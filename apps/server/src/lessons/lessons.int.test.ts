import { beforeEach, describe, expect, it } from "vitest";
import { lessonFiles, lessons, topics } from "../db/schema";
import { bodyOf, createTestApp, TEST_APP_URL } from "../test/app";
import { useTestDatabase } from "../test/db";
import { linkTopic, seedFile, seedLesson, seedQuestion, seedTopic } from "../test/seed";
import { createSignedInUser } from "../test/session";

const { db, truncateAll } = useTestDatabase();
const { app, auth, storage } = createTestApp({ db, allowedGithubIds: ["1001", "1002"] });

let carlos: Awaited<ReturnType<typeof createSignedInUser>>;
beforeEach(async () => {
  await truncateAll();
  storage.objects.clear();
  storage.state.failDeletes = false;
  carlos = await createSignedInUser(db, auth);
});

function call(method: string, path: string, body?: unknown, cookie = carlos.cookie) {
  return app.request(`${TEST_APP_URL}/api${path}`, {
    method,
    headers: { cookie, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("lessons API", () => {
  it("AC-1: creates a lesson with every field and lists newest date first", async () => {
    const created = await call("POST", "/lessons", {
      date: "2026-10-01",
      title: "Modo dórico",
      rawNotes: "Notas **importantes**",
      summary: "Dórico en A",
      practicePoints: ["Tríadas en 1–3"],
      homework: "Tríadas a 90",
    });
    expect(created.status).toBe(201);
    expect((await bodyOf(created)).lesson).toMatchObject({
      date: "2026-10-01",
      title: "Modo dórico",
      practicePoints: ["Tríadas en 1–3"],
      status: "final",
      source: "web",
    });

    await call("POST", "/lessons", { date: "2026-09-24", title: "Jónico" });
    await call("POST", "/lessons", { date: "2026-10-08", title: "Frigio" });
    const list = await bodyOf(call("GET", "/lessons"));
    expect(list.lessons.map((lesson: { title: string }) => lesson.title)).toEqual([
      "Frigio",
      "Modo dórico",
      "Jónico",
    ]);
  });

  it("AC-1: rejects a lesson without a title", async () => {
    const response = await call("POST", "/lessons", { date: "2026-10-01", title: "" });
    expect(response.status).toBe(400);
  });

  it("AC-1: lists file and topic counts", async () => {
    const lesson = await seedLesson(db, carlos.userId);
    await seedFile(db, carlos.userId, lesson.id);
    await linkTopic(db, carlos.userId, lesson.id, (await seedTopic(db, carlos.userId)).id);
    const list = await bodyOf(call("GET", "/lessons"));
    expect(list.lessons[0]).toMatchObject({ fileCount: 1, topicCount: 1 });
  });

  it("AC-2: the lesson page has fields, topics by relation, files and the open questions count", async () => {
    const lesson = await seedLesson(db, carlos.userId, { summary: "Resumen" });
    const mode = await seedTopic(db, carlos.userId, { title: "Modo dórico" });
    const triads = await seedTopic(db, carlos.userId, {
      title: "Tríadas de dórico",
      category: "chords_arpeggios",
    });
    await linkTopic(db, carlos.userId, lesson.id, mode.id, "extended");
    await linkTopic(db, carlos.userId, lesson.id, triads.id, "introduced");
    await seedFile(db, carlos.userId, lesson.id);
    await seedQuestion(db, carlos.userId);
    await seedQuestion(db, carlos.userId, { status: "dismissed" });

    const detail = await bodyOf(call("GET", `/lessons/${lesson.id}`));
    expect(detail.lesson.summary).toBe("Resumen");
    expect(detail.topics.introduced.map((t: { title: string }) => t.title)).toEqual([
      "Tríadas de dórico",
    ]);
    expect(detail.topics.extended.map((t: { title: string }) => t.title)).toEqual(["Modo dórico"]);
    expect(detail.topics.reviewed).toEqual([]);
    expect(detail.files).toHaveLength(1);
    expect(detail.openQuestionsCount).toBe(1);
  });

  it("AC-17: only the most recent lesson carries the open questions", async () => {
    const older = await seedLesson(db, carlos.userId, { date: "2026-09-24" });
    const latest = await seedLesson(db, carlos.userId, { date: "2026-10-01" });
    await seedQuestion(db, carlos.userId, { text: "¿Pulgar?" });
    const latestDetail = await bodyOf(call("GET", `/lessons/${latest.id}`));
    const olderDetail = await bodyOf(call("GET", `/lessons/${older.id}`));
    expect(latestDetail).toMatchObject({ isLatest: true, openQuestionsCount: 1 });
    expect(latestDetail.openQuestions.map((q: { text: string }) => q.text)).toEqual(["¿Pulgar?"]);
    expect(olderDetail).toMatchObject({
      isLatest: false,
      openQuestionsCount: 1,
      openQuestions: [],
    });
  });

  it("AC-3: edits any field", async () => {
    const lesson = await seedLesson(db, carlos.userId);
    const response = await call("PATCH", `/lessons/${lesson.id}`, {
      date: "2026-10-02",
      title: "Dórico II",
      homework: "Más tríadas",
      practicePoints: ["Uno", "Dos"],
    });
    expect(response.status).toBe(200);
    expect((await bodyOf(response)).lesson).toMatchObject({
      date: "2026-10-02",
      title: "Dórico II",
      homework: "Más tríadas",
      practicePoints: ["Uno", "Dos"],
    });
  });

  it("AC-3: deleting removes its files from the database and storage, and keeps topics", async () => {
    const lesson = await seedLesson(db, carlos.userId);
    const topic = await seedTopic(db, carlos.userId);
    await linkTopic(db, carlos.userId, lesson.id, topic.id);
    const file = await seedFile(db, carlos.userId, lesson.id);
    storage.objects.set(file.r2Key, Buffer.from("pdf"));

    const response = await call("DELETE", `/lessons/${lesson.id}`);
    expect(response.status).toBe(204);
    expect(await db.select().from(lessons)).toEqual([]);
    expect(await db.select().from(lessonFiles)).toEqual([]);
    expect(storage.objects.size).toBe(0);
    expect(await db.select().from(topics)).toHaveLength(1);
  });

  it("AC-3: when storage can't delete the files, nothing is deleted", async () => {
    const lesson = await seedLesson(db, carlos.userId);
    const file = await seedFile(db, carlos.userId, lesson.id);
    storage.objects.set(file.r2Key, Buffer.from("pdf"));
    storage.state.failDeletes = true;

    expect((await call("DELETE", `/lessons/${lesson.id}`)).status).toBe(502);
    expect(await db.select().from(lessons)).toHaveLength(1);
    expect(await db.select().from(lessonFiles)).toHaveLength(1);
  });

  it("never shows, edits or deletes another user's lesson", async () => {
    const other = await createSignedInUser(db, auth, { githubId: "1002" });
    const lesson = await seedLesson(db, other.userId);
    expect((await call("GET", `/lessons/${lesson.id}`)).status).toBe(404);
    expect((await call("PATCH", `/lessons/${lesson.id}`, { title: "x" })).status).toBe(404);
    expect((await call("DELETE", `/lessons/${lesson.id}`)).status).toBe(404);
    expect((await bodyOf(call("GET", "/lessons"))).lessons).toEqual([]);
  });

  it("answers 404 for a malformed id", async () => {
    expect((await call("GET", "/lessons/not-a-uuid")).status).toBe(404);
  });
});
