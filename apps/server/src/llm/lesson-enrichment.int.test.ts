import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { lessons, llmDrafts, llmRuns } from "../db/schema";
import { createTestApp } from "../test/app";
import { useTestDatabase } from "../test/db";
import { fakeLlm } from "../test/fake-llm";
import { enrichmentOutput, llmDeps, newTopicOutput, queueDraft } from "../test/llm";
import { captureLogger } from "../test/logger";
import { memoryStorage } from "../test/memory-storage";
import { seedFile, seedLesson, seedQuestion, seedTopic } from "../test/seed";
import { createSignedInUser } from "../test/session";
import { LlmCallError } from "./client";
import { runLessonEnrichment } from "./lesson-enrichment";
import { recordRun } from "./usage";

const { db, truncateAll } = useTestDatabase();
const { auth } = createTestApp({ db });

beforeEach(truncateAll);

async function setup(lessonValues: Parameters<typeof seedLesson>[2] = {}) {
  const { userId } = await createSignedInUser(db, auth);
  const lesson = await seedLesson(db, userId, {
    rawNotes: "Tríadas en dórico. Preguntar si uso púa alternada.",
    ...lessonValues,
  });
  const draft = await queueDraft(db, userId, { type: "lesson", id: lesson.id });
  return { userId, lesson, draft };
}

const draftRow = async (id: string) =>
  (await db.select().from(llmDrafts).where(eq(llmDrafts.id, id)))[0];

describe("lesson enrichment job", () => {
  it("AC-3: sends the notes, files, existing topics and open questions, and lists skipped files", async () => {
    const { userId, lesson, draft } = await setup();
    const topic = await seedTopic(db, userId, { title: "Modo dórico" });
    await seedTopic(db, userId, { title: "Viejo", status: "archived" });
    const question = await seedQuestion(db, userId, { text: "¿Qué digitación uso?" });
    await seedQuestion(db, userId, { text: "Ya resuelta", status: "dismissed" });
    const { storage, objects } = memoryStorage();
    const pdf = await seedFile(db, userId, lesson.id, { originalName: "ej.pdf", sizeBytes: 4 });
    objects.set(pdf.r2Key, Buffer.from("%PDF"));
    await seedFile(db, userId, lesson.id, {
      kind: "image",
      originalName: "foto.heic",
      mime: "image/heic",
    });
    const { client, requests } = fakeLlm({ output: enrichmentOutput() });

    await runLessonEnrichment(llmDeps(db, client, { storage }), draft.id);

    const [request] = requests;
    const text = request?.content
      .flatMap((block) => (block.type === "text" ? [block.text] : []))
      .join("\n");
    expect(request?.model).toBe("claude-sonnet-5-5");
    expect(request?.system).toContain("Spanish (es-PE)");
    expect(text).toContain("Tríadas en dórico. Preguntar si uso púa alternada.");
    expect(text).toContain(topic.id);
    expect(text).not.toContain("Viejo");
    expect(text).toContain(question.id);
    expect(text).not.toContain("Ya resuelta");
    expect(request?.content.some((block) => block.type === "document")).toBe(true);
    const row = await draftRow(draft.id);
    expect(row?.status).toBe("pending");
    expect(row?.skippedFiles).toEqual([
      expect.objectContaining({ name: "foto.heic", reason: "unsupported" }),
    ]);
  });

  it("AC-11: stores a pending draft with every section pending and leaves the lesson untouched", async () => {
    const { lesson, draft } = await setup();
    const { client } = fakeLlm({ output: enrichmentOutput({ topics: [newTopicOutput()] }) });
    await runLessonEnrichment(llmDeps(db, client), draft.id);

    const row = await draftRow(draft.id);
    expect(row).toMatchObject({
      status: "pending",
      review: {
        title: { state: "pending" },
        summary: { state: "pending" },
        practicePoints: { state: "pending" },
        homework: { state: "pending" },
        topics: { state: "pending" },
        answers: { state: "discarded" },
        questions: { state: "discarded" },
      },
    });
    expect(row?.payload).toMatchObject({
      title: "Modo dórico en tríadas",
      topics: [{ kind: "new" }],
    });
    expect(row?.llmRunId).not.toBeNull();
    const [unchanged] = await db.select().from(lessons).where(eq(lessons.id, lesson.id));
    expect(unchanged).toMatchObject({ title: lesson.title, summary: "", practicePoints: [] });
  });

  it("AC-4: retries invalid output once, then marks the draft failed; both calls are logged", async () => {
    const { draft } = await setup();
    const { client, requests } = fakeLlm({ output: { nope: true } });
    await runLessonEnrichment(llmDeps(db, client), draft.id);
    expect(requests).toHaveLength(2);
    expect(await draftRow(draft.id)).toMatchObject({ status: "failed", error: "invalid_output" });
    expect(await db.select().from(llmRuns)).toHaveLength(2);
  });

  it("AC-4: succeeds when the retry is valid", async () => {
    const { draft } = await setup();
    const { client } = fakeLlm({ output: null }, { output: enrichmentOutput() });
    await runLessonEnrichment(llmDeps(db, client), draft.id);
    expect((await draftRow(draft.id))?.status).toBe("pending");
  });

  it("AC-6: matches topics to existing ones, drops unknown ids and keeps parents among new topics", async () => {
    const { userId, draft } = await setup();
    const existing = await seedTopic(db, userId, { title: "Modo dórico" });
    const { client } = fakeLlm({
      output: enrichmentOutput({
        topics: [
          newTopicOutput({ ref: "n1", title: "Arpegios" }),
          newTopicOutput({ ref: "n2", title: "Arpegios menores", parentRef: "n1" }),
          newTopicOutput({ ref: "n3", title: "modo DÓRICO" }),
          newTopicOutput({
            ref: "x",
            kind: "existing",
            existingTopicId: "not-mine",
            title: "Fantasma",
          }),
          newTopicOutput({ ref: "n4", title: "Huérfano", parentRef: "missing", targetBpm: 900 }),
        ],
      }),
    });
    await runLessonEnrichment(llmDeps(db, client), draft.id);
    const payload = (await draftRow(draft.id))?.payload as { topics: Record<string, unknown>[] };
    expect(payload.topics).toEqual([
      expect.objectContaining({ ref: "n1", kind: "new", title: "Arpegios" }),
      expect.objectContaining({ ref: "n2", parentRef: "n1" }),
      expect.objectContaining({ kind: "existing", topicId: existing.id, title: "Modo dórico" }),
      expect.objectContaining({ ref: "n4", parentRef: null, targetBpm: null }),
    ]);
  });

  it("AC-7, AC-8: keeps answers to open questions only and drops suggested duplicates", async () => {
    const { userId, draft } = await setup();
    const open = await seedQuestion(db, userId, { text: "¿Qué digitación uso?" });
    const dismissed = await seedQuestion(db, userId, { text: "Otra", status: "dismissed" });
    const { client } = fakeLlm({
      output: enrichmentOutput({
        topics: [newTopicOutput()],
        answers: [
          { questionId: open.id, answer: "La 1-2-4." },
          { questionId: dismissed.id, answer: "No" },
        ],
        questions: [
          { text: "¿qué digitación uso?", topicRef: null },
          { text: "¿Púa alternada en tríadas?", topicRef: "n1" },
          { text: "¿Púa alternada en tríadas?", topicRef: null },
        ],
      }),
    });
    await runLessonEnrichment(llmDeps(db, client), draft.id);
    const payload = (await draftRow(draft.id))?.payload as Record<string, unknown>;
    expect(payload.answers).toEqual([{ questionId: open.id, answer: "La 1-2-4." }]);
    expect(payload.questions).toEqual([{ text: "¿Púa alternada en tríadas?", topicRef: "n1" }]);
  });

  it("logs a failed API call and marks the draft failed with its code", async () => {
    const { draft } = await setup();
    const { client } = fakeLlm(new LlmCallError("rate_limited"));
    await runLessonEnrichment(llmDeps(db, client), draft.id);
    expect(await draftRow(draft.id)).toMatchObject({ status: "failed", error: "rate_limited" });
    expect(await db.select().from(llmRuns)).toEqual([
      expect.objectContaining({ status: "error", error: "rate_limited", costUsd: 0 }),
    ]);
  });

  it("AC-15: the worker refuses over budget without calling Claude", async () => {
    const { userId, draft } = await setup();
    await recordRun(db, {
      userId,
      feature: "lesson_enrichment",
      model: "claude-sonnet-5-5",
      usage: { inputTokens: 5_000_000, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
      latencyMs: 1,
    });
    await db.update(llmRuns).set({ createdAt: new Date("2026-10-01T18:00:00Z") });
    const { client, requests } = fakeLlm({ output: enrichmentOutput() });
    await runLessonEnrichment(llmDeps(db, client), draft.id);
    expect(requests).toHaveLength(0);
    expect(await draftRow(draft.id)).toMatchObject({ status: "failed", error: "llm.budget" });
  });

  it("AC-16: without a key the draft fails as disabled", async () => {
    const { draft } = await setup();
    await runLessonEnrichment(llmDeps(db, null), draft.id);
    expect(await draftRow(draft.id)).toMatchObject({ status: "failed", error: "llm.disabled" });
  });

  it("discards the draft when its lesson was deleted, and ignores drafts that aren't queued", async () => {
    const { lesson, draft } = await setup();
    await db.delete(lessons).where(eq(lessons.id, lesson.id));
    const { client, requests } = fakeLlm({ output: enrichmentOutput() });
    await runLessonEnrichment(llmDeps(db, client), draft.id);
    await runLessonEnrichment(llmDeps(db, client), draft.id);
    expect(requests).toHaveLength(0);
    expect((await draftRow(draft.id))?.status).toBe("discarded");
  });

  it("AC-13: logs ids, tokens and durations, never notes or output", async () => {
    const { draft } = await setup();
    const { logger, text } = captureLogger("worker");
    const { client } = fakeLlm({ output: enrichmentOutput() });
    await runLessonEnrichment(llmDeps(db, client, { logger }), draft.id);
    expect(text()).toContain('"inputTokens":1000');
    expect(text()).not.toContain("púa");
    expect(text()).not.toContain("tríadas");
  });
});
