import { sql } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import { beforeEach, describe, expect, it } from "vitest";
import { fakeClock } from "../clock";
import { lessons, llmDrafts, llmRuns, user } from "../db/schema";
import { bodyOf, createTestApp, TEST_APP_URL } from "../test/app";
import { useTestDatabase } from "../test/db";
import { queueDraft } from "../test/llm";
import { seedLesson, seedQuestion } from "../test/seed";
import { createSignedInUser } from "../test/session";
import { recordRun } from "./usage";

const { db, truncateAll } = useTestDatabase();
const clock = fakeClock("2026-10-01T20:00:00Z");
const enabled = createTestApp({ db, clock });
const disabled = createTestApp({ db, clock, llm: { enabled: false } });
const { auth } = enabled;

let carlos: Awaited<ReturnType<typeof createSignedInUser>>;
beforeEach(async () => {
  await truncateAll();
  clock.set("2026-10-01T20:00:00Z");
  enabled.jobs.sent.length = 0;
  carlos = await createSignedInUser(db, auth);
});

function call(method: string, path: string, body?: unknown, app = enabled.app) {
  return app.request(`${TEST_APP_URL}/api${path}`, {
    method,
    headers: {
      cookie: carlos.cookie,
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

const drafts = () => db.select().from(llmDrafts);

describe("starting enrichment", () => {
  it("AC-1: queues a draft and a job, and refuses a second one while it runs", async () => {
    const lesson = await seedLesson(db, carlos.userId);
    const response = await call("POST", `/lessons/${lesson.id}/enrich`, {});
    expect(response.status).toBe(202);
    const { draftId } = await bodyOf(response);
    expect(await drafts()).toEqual([
      expect.objectContaining({
        id: draftId,
        status: "queued",
        kind: "lesson_enrichment",
        subjectId: lesson.id,
      }),
    ]);
    expect(enabled.jobs.sent).toEqual([{ name: "llm.lesson-enrich", data: { draftId } }]);

    const again = await call("POST", `/lessons/${lesson.id}/enrich`, {});
    expect(again.status).toBe(409);
    expect(await bodyOf(again)).toEqual({ error: "llm.running" });
  });

  it("AC-1: the lesson page reports the latest draft, so the waiting state survives a reload", async () => {
    const lesson = await seedLesson(db, carlos.userId);
    expect((await bodyOf(call("GET", `/lessons/${lesson.id}`))).draft).toBeNull();
    const { draftId } = await bodyOf(call("POST", `/lessons/${lesson.id}/enrich`, {}));
    expect((await bodyOf(call("GET", `/lessons/${lesson.id}`))).draft).toEqual({
      id: draftId,
      status: "queued",
    });
  });

  it("AC-10: regenerating discards the pending draft and keeps the instruction", async () => {
    const lesson = await seedLesson(db, carlos.userId);
    const pending = await queueDraft(
      db,
      carlos.userId,
      { type: "lesson", id: lesson.id },
      { status: "pending" },
    );
    const response = await call("POST", `/lessons/${lesson.id}/enrich`, {
      instruction: "más breve",
    });
    expect(response.status).toBe(202);
    const { draftId } = await bodyOf(response);
    const rows = await drafts();
    expect(rows.find((row) => row.id === pending.id)?.status).toBe("discarded");
    expect(rows.find((row) => row.id === draftId)).toMatchObject({
      status: "queued",
      instruction: "más breve",
    });
  });

  it("frees a subject whose draft has been stuck for over 15 minutes", async () => {
    const lesson = await seedLesson(db, carlos.userId);
    const stuck = await queueDraft(
      db,
      carlos.userId,
      { type: "lesson", id: lesson.id },
      { status: "running" },
    );
    await db.execute(
      sql`UPDATE llm_drafts SET updated_at = now() - interval '16 minutes' WHERE id = ${stuck.id}`,
    );
    expect((await call("POST", `/lessons/${lesson.id}/enrich`, {})).status).toBe(202);
    expect((await drafts()).find((row) => row.id === stuck.id)).toMatchObject({
      status: "failed",
      error: "stale",
    });
  });

  it("answers 404 for another user's lesson", async () => {
    const otherId = uuidv7();
    await db
      .insert(user)
      .values({ id: otherId, name: "Otro", email: "o@example.com", githubId: "2002" });
    const lesson = await seedLesson(db, otherId);
    expect((await call("POST", `/lessons/${lesson.id}/enrich`, {})).status).toBe(404);
  });

  it("AC-15: refuses over this month's budget", async () => {
    const lesson = await seedLesson(db, carlos.userId);
    await recordRun(db, {
      userId: carlos.userId,
      feature: "lesson_enrichment",
      model: "claude-sonnet-5-5",
      usage: { inputTokens: 5_000_000, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
      latencyMs: 1,
    });
    await db.update(llmRuns).set({ createdAt: new Date("2026-10-01T18:00:00Z") });
    const response = await call("POST", `/lessons/${lesson.id}/enrich`, {});
    expect(response.status).toBe(409);
    expect(await bodyOf(response)).toEqual({ error: "llm.budget" });
    expect(await drafts()).toEqual([]);
  });

  it("AC-16: answers 503 when Claude isn't configured, and /me says so", async () => {
    const lesson = await seedLesson(db, carlos.userId);
    const response = await call("POST", `/lessons/${lesson.id}/enrich`, {}, disabled.app);
    expect(response.status).toBe(503);
    expect(await bodyOf(response)).toEqual({ error: "llm.disabled" });
    expect((await bodyOf(call("GET", "/me", undefined, disabled.app))).llm).toEqual({
      enabled: false,
    });
  });
});

describe("quick capture", () => {
  it("AC-2: 'Guardar y completar con Claude' saves a draft lesson and starts enrichment", async () => {
    const response = await call("POST", "/lessons", {
      date: "2026-10-01",
      title: "Clase del 1 de octubre",
      rawNotes: "Tríadas",
      enrich: true,
    });
    expect(response.status).toBe(201);
    const { lesson, draftId } = await bodyOf(response);
    expect(lesson.status).toBe("draft");
    expect(await drafts()).toEqual([
      expect.objectContaining({ id: draftId, subjectId: lesson.id }),
    ]);
    expect(enabled.jobs.sent).toHaveLength(1);
  });

  it("AC-17: with files, the lesson is saved as a draft first and enrichment starts after the uploads", async () => {
    const response = await call("POST", "/lessons", {
      date: "2026-10-01",
      title: "Clase",
      draft: true,
    });
    const { lesson, draftId } = await bodyOf(response);
    expect(lesson.status).toBe("draft");
    expect(draftId).toBeNull();
    expect(await drafts()).toEqual([]);
    expect((await call("POST", `/lessons/${lesson.id}/enrich`, {})).status).toBe(202);
  });

  it("AC-2: a plain save stays final with no draft", async () => {
    const response = await call("POST", "/lessons", { date: "2026-10-01", title: "Clase" });
    const body = await bodyOf(response);
    expect(body.lesson.status).toBe("final");
    expect(body.draftId).toBeNull();
    expect(await drafts()).toEqual([]);
  });

  it("AC-16: creates nothing when Claude isn't available", async () => {
    const response = await call(
      "POST",
      "/lessons",
      { date: "2026-10-01", title: "Clase", enrich: true },
      disabled.app,
    );
    expect(response.status).toBe(503);
    expect(await db.select().from(lessons)).toEqual([]);
  });
});

describe("drafts", () => {
  it("returns the draft with the subject's current values and the questions it answers", async () => {
    const lesson = await seedLesson(db, carlos.userId, { title: "Dórico", summary: "Actual" });
    const question = await seedQuestion(db, carlos.userId, { text: "¿Digitación?" });
    const draft = await queueDraft(
      db,
      carlos.userId,
      { type: "lesson", id: lesson.id },
      {
        status: "pending",
        payload: {
          title: "Nuevo",
          summary: "",
          practicePoints: [],
          homework: "",
          topics: [],
          answers: [{ questionId: question.id, answer: "1-2-4" }],
          questions: [],
        },
      },
    );
    const body = await bodyOf(call("GET", `/drafts/${draft.id}`));
    expect(body.draft).toMatchObject({
      id: draft.id,
      status: "pending",
      payload: { title: "Nuevo" },
      current: {
        title: "Dórico",
        summary: "Actual",
        status: "final",
        questions: [{ id: question.id, text: "¿Digitación?", status: "open" }],
      },
    });
  });

  it("deleting a lesson deletes its drafts", async () => {
    const lesson = await seedLesson(db, carlos.userId);
    await queueDraft(db, carlos.userId, { type: "lesson", id: lesson.id }, { status: "pending" });
    expect((await call("DELETE", `/lessons/${lesson.id}`)).status).toBe(204);
    expect(await drafts()).toEqual([]);
  });
});

describe("usage", () => {
  it("AC-14: reports this month's spend, calls and budget", async () => {
    await recordRun(db, {
      userId: carlos.userId,
      feature: "lesson_enrichment",
      model: "claude-sonnet-5-5",
      usage: {
        inputTokens: 100_000,
        outputTokens: 10_000,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
      latencyMs: 1,
    });
    await db.update(llmRuns).set({ createdAt: new Date("2026-10-01T18:00:00Z") });
    expect(await bodyOf(call("GET", "/llm/usage"))).toEqual({
      enabled: true,
      monthSpendUsd: 0.3,
      monthCalls: 1,
      budgetUsd: 10,
    });
  });
});
