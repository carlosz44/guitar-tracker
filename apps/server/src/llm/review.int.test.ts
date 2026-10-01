import type { LessonDraftPayload } from "@ds/shared";
import { eq } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import { beforeEach, describe, expect, it } from "vitest";
import { lessons, lessonTopics, llmDrafts, teacherQuestions, topics, user } from "../db/schema";
import { bodyOf, createTestApp, TEST_APP_URL } from "../test/app";
import { useTestDatabase } from "../test/db";
import { queueDraft } from "../test/llm";
import { seedLesson, seedQuestion, seedTopic } from "../test/seed";
import { createSignedInUser } from "../test/session";
import { initialReview } from "./lesson-enrichment";

const { db, truncateAll } = useTestDatabase();
const { app, auth } = createTestApp({ db });

let carlos: Awaited<ReturnType<typeof createSignedInUser>>;
beforeEach(async () => {
  await truncateAll();
  carlos = await createSignedInUser(db, auth);
});

function call(method: string, path: string, body?: unknown) {
  return app.request(`${TEST_APP_URL}/api${path}`, {
    method,
    headers: {
      cookie: carlos.cookie,
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

const topic = (values: Partial<LessonDraftPayload["topics"][number]>) => ({
  ref: "n1",
  kind: "new" as const,
  topicId: null,
  title: "Arpegios",
  category: "chords_arpeggios" as const,
  parentRef: null,
  description: "",
  practicePoints: [],
  successCriteria: "",
  targetBpm: null,
  relation: "introduced" as const,
  ...values,
});

async function setup() {
  const lesson = await seedLesson(db, carlos.userId, { title: "Dórico", status: "draft" });
  const existing = await seedTopic(db, carlos.userId, { title: "Modo dórico" });
  const question = await seedQuestion(db, carlos.userId, { text: "¿Digitación?" });
  const payload: LessonDraftPayload = {
    title: "Modo dórico en tríadas",
    summary: "Vimos tríadas.",
    practicePoints: ["Cuerdas 1–3"],
    homework: "Grabar el riff.",
    topics: [
      topic({ ref: "n1", title: "Arpegios" }),
      topic({ ref: "n2", title: "Arpegios menores", parentRef: "n1", targetBpm: 80 }),
      topic({ ref: "n3", title: "Sobrante" }),
      topic({
        ref: existing.id,
        kind: "existing",
        topicId: existing.id,
        title: "Modo dórico",
        category: null,
        relation: "extended",
      }),
    ],
    answers: [{ questionId: question.id, answer: "1-2-4" }],
    questions: [{ text: "¿Púa alternada?", topicRef: "n2" }],
  };
  const draft = await queueDraft(
    db,
    carlos.userId,
    { type: "lesson", id: lesson.id },
    { status: "pending", payload, review: initialReview(payload) },
  );
  return { lesson, existing, question, draft, payload };
}

const section = (draftId: string, name: string, body: unknown) =>
  call("POST", `/drafts/${draftId}/sections/${name}`, body);
const lessonRow = async (id: string) =>
  (await db.select().from(lessons).where(eq(lessons.id, id)))[0];

describe("reviewing a lesson draft", () => {
  it("AC-5: accepts a section with Carlos's edits, leaving the others untouched", async () => {
    const { lesson, draft } = await setup();
    const response = await section(draft.id, "title", {
      action: "accept",
      value: "Dórico, tríadas",
    });
    expect(response.status).toBe(200);
    const body = await bodyOf(response);
    expect(body.draft.review.title).toEqual({ state: "accepted", value: "Dórico, tríadas" });
    expect(body.draft.current.title).toBe("Dórico, tríadas");
    expect(await lessonRow(lesson.id)).toMatchObject({
      title: "Dórico, tríadas",
      summary: "",
      status: "draft",
    });
  });

  it("AC-6: creates checked new topics parents first and links all checked topics with their relation", async () => {
    const { lesson, existing, draft, payload } = await setup();
    const value = payload.topics.map((item) => ({ ...item, checked: item.ref !== "n3" }));
    expect((await section(draft.id, "topics", { action: "accept", value })).status).toBe(200);

    const rows = await db.select().from(topics).where(eq(topics.userId, carlos.userId));
    const parent = rows.find((row) => row.title === "Arpegios");
    expect(rows.find((row) => row.title === "Arpegios menores")).toMatchObject({
      parentId: parent?.id,
      targetBpm: 80,
      category: "chords_arpeggios",
      status: "new",
    });
    expect(rows.some((row) => row.title === "Sobrante")).toBe(false);
    const links = await db.select().from(lessonTopics).where(eq(lessonTopics.lessonId, lesson.id));
    expect(
      links
        .map((link) => [rows.find((row) => row.id === link.topicId)?.title, link.relation])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    ).toEqual([
      ["Arpegios", "introduced"],
      ["Arpegios menores", "introduced"],
      [existing.title, "extended"],
    ]);
  });

  it("AC-6: a new topic whose title now exists is linked instead of duplicated", async () => {
    const { draft } = await setup();
    await seedTopic(db, carlos.userId, { title: "arpegios" });
    await section(draft.id, "topics", { action: "accept" });
    const titles = (await db.select().from(topics)).map((row) => row.title.toLowerCase());
    expect(titles.filter((title) => title === "arpegios")).toHaveLength(1);
  });

  it("AC-7: accepting an answer marks the question answered in this lesson", async () => {
    const { lesson, question, draft } = await setup();
    await section(draft.id, "answers", { action: "accept" });
    const [row] = await db
      .select()
      .from(teacherQuestions)
      .where(eq(teacherQuestions.id, question.id));
    expect(row).toMatchObject({
      status: "answered",
      answer: "1-2-4",
      answeredInLessonId: lesson.id,
    });
  });

  it("AC-7: a question resolved in the meantime can't be accepted", async () => {
    const { question, draft } = await setup();
    await db
      .update(teacherQuestions)
      .set({ status: "dismissed" })
      .where(eq(teacherQuestions.id, question.id));
    const response = await section(draft.id, "answers", { action: "accept" });
    expect(response.status).toBe(409);
    expect(await bodyOf(response)).toEqual({ error: "draft.resolved" });
    const [row] = await db
      .select()
      .from(teacherQuestions)
      .where(eq(teacherQuestions.id, question.id));
    expect(row?.status).toBe("dismissed");
  });

  it("AC-8: suggested questions become open questions linked to the topic created from this draft", async () => {
    const { draft } = await setup();
    await section(draft.id, "topics", { action: "accept" });
    await section(draft.id, "questions", { action: "accept" });
    const [minor] = await db.select().from(topics).where(eq(topics.title, "Arpegios menores"));
    const [created] = await db
      .select()
      .from(teacherQuestions)
      .where(eq(teacherQuestions.text, "¿Púa alternada?"));
    expect(created).toMatchObject({ status: "open", topicId: minor?.id });
  });

  it("AC-9: accepting everything makes the draft accepted and the lesson final", async () => {
    const { lesson, draft } = await setup();
    const response = await call("POST", `/drafts/${draft.id}/accept-all`, {
      values: { homework: "Grabar el riff a 90." },
    });
    expect(response.status).toBe(200);
    expect((await bodyOf(response)).draft.status).toBe("accepted");
    expect(await lessonRow(lesson.id)).toMatchObject({
      status: "final",
      title: "Modo dórico en tríadas",
      practicePoints: ["Cuerdas 1–3"],
      homework: "Grabar el riff a 90.",
    });
  });

  it("AC-9: when every section is discarded the draft is discarded and the lesson final", async () => {
    const { lesson, draft } = await setup();
    for (const name of ["title", "summary", "practicePoints", "homework", "topics", "answers"]) {
      await section(draft.id, name, { action: "discard" });
    }
    const response = await section(draft.id, "questions", { action: "discard" });
    expect((await bodyOf(response)).draft.status).toBe("discarded");
    expect(await lessonRow(lesson.id)).toMatchObject({
      status: "final",
      title: "Dórico",
      summary: "",
    });
  });

  it("AC-10: regenerating after accepting a section keeps what was accepted", async () => {
    const { lesson, draft } = await setup();
    await section(draft.id, "title", { action: "accept" });
    expect(
      (await call("POST", `/lessons/${lesson.id}/enrich`, { instruction: "más breve" })).status,
    ).toBe(202);
    const rows = await db.select().from(llmDrafts);
    expect(rows.find((row) => row.id === draft.id)?.status).toBe("discarded");
    expect((await lessonRow(lesson.id))?.title).toBe("Modo dórico en tríadas");
  });

  it("AC-11: discarding the whole draft leaves the lesson exactly as it was", async () => {
    const { lesson, draft } = await setup();
    const before = await lessonRow(lesson.id);
    const response = await call("POST", `/drafts/${draft.id}/discard`);
    expect((await bodyOf(response)).draft.status).toBe("discarded");
    expect(await lessonRow(lesson.id)).toEqual(before);
    expect(await db.select().from(topics)).toHaveLength(1);
  });

  it("rejects reviewing a section twice, unknown sections and invalid edits", async () => {
    const { draft } = await setup();
    await section(draft.id, "summary", { action: "discard" });
    expect(await bodyOf(section(draft.id, "summary", { action: "accept" }))).toEqual({
      error: "draft.notPending",
    });
    expect((await section(draft.id, "description", { action: "accept" })).status).toBe(409);
    expect((await section(draft.id, "nope", { action: "accept" })).status).toBe(404);
    expect((await section(draft.id, "title", { action: "accept", value: "" })).status).toBe(400);
  });

  it("can't review another user's draft", async () => {
    const { draft } = await setup();
    const otherId = uuidv7();
    await db
      .insert(user)
      .values({ id: otherId, name: "Otro", email: "o@example.com", githubId: "2002" });
    await db.update(llmDrafts).set({ userId: otherId }).where(eq(llmDrafts.id, draft.id));
    expect((await call("POST", `/drafts/${draft.id}/discard`)).status).toBe(404);
    expect((await call("GET", `/drafts/${draft.id}`)).status).toBe(404);
  });
});
