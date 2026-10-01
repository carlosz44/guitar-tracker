import { topicErrors } from "@ds/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { teacherQuestions, topics } from "../db/schema";
import { bodyOf, createTestApp, TEST_APP_URL } from "../test/app";
import { useTestDatabase } from "../test/db";
import { linkTopic, seedLesson, seedQuestion, seedSession, seedTopic } from "../test/seed";
import { createSignedInUser } from "../test/session";

const { db, truncateAll } = useTestDatabase();
const { app, auth } = createTestApp({ db, allowedGithubIds: ["1001", "1002"] });

let carlos: Awaited<ReturnType<typeof createSignedInUser>>;
beforeEach(async () => {
  await truncateAll();
  carlos = await createSignedInUser(db, auth);
});

function call(method: string, path: string, body?: unknown) {
  return app.request(`${TEST_APP_URL}/api${path}`, {
    method,
    headers: { cookie: carlos.cookie, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("topics API", () => {
  it("AC-11: creates a topic with every field, starting as new", async () => {
    const parent = await seedTopic(db, carlos.userId, { title: "Modo dórico" });
    const response = await call("POST", "/topics", {
      title: "Tríadas de dórico",
      category: "chords_arpeggios",
      description: "En **A**",
      practicePoints: ["Cuerdas 1–3"],
      successCriteria: "3 veces limpias a 90",
      targetBpm: 90,
      priority: 3,
      defaultBlockMinutes: 15,
      parentId: parent.id,
    });
    expect(response.status).toBe(201);
    expect((await bodyOf(response)).topic).toMatchObject({
      title: "Tríadas de dórico",
      status: "new",
      priority: 3,
      targetBpm: 90,
      defaultBlockMinutes: 15,
      parentId: parent.id,
    });
  });

  it("AC-11: rejects a missing category and an out-of-range BPM", async () => {
    const response = await call("POST", "/topics", { title: "x", targetBpm: 500 });
    expect(response.status).toBe(400);
    const messages = (await bodyOf(response)).issues.map(
      (issue: { message: string }) => issue.message,
    );
    expect(messages).toEqual([topicErrors.category, topicErrors.targetBpm]);
  });

  it("AC-11: rejects a parent that isn't one of my topics", async () => {
    const response = await call("POST", "/topics", {
      title: "x",
      category: "technique",
      parentId: "0190f0e0-0000-7000-8000-0000000000ff",
    });
    expect(response.status).toBe(400);
  });

  it("AC-12: lists topics with their parent, filtered by status and category", async () => {
    const mode = await seedTopic(db, carlos.userId, { title: "Modo dórico", status: "active" });
    await seedTopic(db, carlos.userId, {
      title: "Tríadas",
      category: "chords_arpeggios",
      parentId: mode.id,
    });
    await seedTopic(db, carlos.userId, {
      title: "Cromática",
      category: "technique",
      status: "archived",
    });

    const all = await bodyOf(call("GET", "/topics"));
    expect(all.topics).toHaveLength(3);
    const triads = all.topics.find((topic: { title: string }) => topic.title === "Tríadas");
    expect(triads.parent).toEqual({ id: mode.id, title: "Modo dórico" });

    const archived = await bodyOf(call("GET", "/topics?status=archived"));
    expect(archived.topics.map((topic: { title: string }) => topic.title)).toEqual(["Cromática"]);
    const chords = await bodyOf(call("GET", "/topics?category=chords_arpeggios"));
    expect(chords.topics.map((topic: { title: string }) => topic.title)).toEqual(["Tríadas"]);
    expect((await call("GET", "/topics?category=jazz")).status).toBe(400);
  });

  it("AC-13: the topic page has parent, children, linked lessons and open questions", async () => {
    const mode = await seedTopic(db, carlos.userId, { title: "Modo dórico" });
    const triads = await seedTopic(db, carlos.userId, { title: "Tríadas", parentId: mode.id });
    const lesson = await seedLesson(db, carlos.userId, { title: "Clase 1" });
    await linkTopic(db, carlos.userId, lesson.id, mode.id, "introduced");
    await seedQuestion(db, carlos.userId, { topicId: mode.id, text: "¿Pulgar?" });
    await seedQuestion(db, carlos.userId, { topicId: mode.id, status: "answered", answer: "Sí" });

    const detail = await bodyOf(call("GET", `/topics/${mode.id}`));
    expect(detail.parent).toBeNull();
    expect(detail.children).toEqual([{ id: triads.id, title: "Tríadas", status: "new" }]);
    expect(detail.lessons).toEqual([
      { id: lesson.id, date: "2026-10-01", title: "Clase 1", relation: "introduced" },
    ]);
    expect(detail.openQuestions.map((question: { text: string }) => question.text)).toEqual([
      "¿Pulgar?",
    ]);
    expect((await bodyOf(call("GET", `/topics/${triads.id}`))).parent).toEqual({
      id: mode.id,
      title: "Modo dórico",
    });
  });

  it("AC-13: moves a topic between any two statuses", async () => {
    const topic = await seedTopic(db, carlos.userId);
    for (const status of ["archived", "new", "maintenance", "active", "new"]) {
      const response = await call("PATCH", `/topics/${topic.id}`, { status });
      expect((await bodyOf(response)).topic.status).toBe(status);
    }
  });

  it("AC-14: rejects a parent that would create a cycle, with a message key", async () => {
    const mode = await seedTopic(db, carlos.userId, { title: "Modo dórico" });
    const triads = await seedTopic(db, carlos.userId, { title: "Tríadas", parentId: mode.id });
    const inversions = await seedTopic(db, carlos.userId, {
      title: "Inversiones",
      parentId: triads.id,
    });

    for (const parentId of [mode.id, inversions.id]) {
      const response = await call("PATCH", `/topics/${mode.id}`, { parentId });
      expect(response.status).toBe(400);
      expect(await bodyOf(response)).toEqual({
        error: "invalid",
        issues: [{ path: ["parentId"], message: topicErrors.cycle }],
      });
    }
    expect((await call("PATCH", `/topics/${inversions.id}`, { parentId: mode.id })).status).toBe(
      200,
    );
    expect((await call("PATCH", `/topics/${triads.id}`, { parentId: null })).status).toBe(200);
  });

  it("deletes a topic with no lesson links; its questions and children stay", async () => {
    const mode = await seedTopic(db, carlos.userId, { title: "Modo dórico" });
    const triads = await seedTopic(db, carlos.userId, { title: "Tríadas", parentId: mode.id });
    await seedQuestion(db, carlos.userId, { topicId: mode.id });

    expect((await call("DELETE", `/topics/${mode.id}`)).status).toBe(204);
    const remaining = await db.select().from(topics);
    expect(remaining.map((topic) => [topic.id, topic.parentId])).toEqual([[triads.id, null]]);
    const [question] = await db.select().from(teacherQuestions);
    expect(question?.topicId).toBeNull();
  });

  it("refuses to delete a topic a lesson links, suggesting archive instead", async () => {
    const topic = await seedTopic(db, carlos.userId);
    const lesson = await seedLesson(db, carlos.userId);
    await linkTopic(db, carlos.userId, lesson.id, topic.id);
    const response = await call("DELETE", `/topics/${topic.id}`);
    expect(response.status).toBe(409);
    expect(await bodyOf(response)).toEqual({ error: topicErrors.hasLessons });
  });

  it("keeps other users' topics out of reach", async () => {
    const other = await createSignedInUser(db, auth, { githubId: "1002" });
    const theirs = await seedTopic(db, other.userId);
    const mine = await seedTopic(db, carlos.userId);
    expect((await call("GET", `/topics/${theirs.id}`)).status).toBe(404);
    expect((await call("PATCH", `/topics/${mine.id}`, { parentId: theirs.id })).status).toBe(400);
    expect((await bodyOf(call("GET", "/topics"))).topics).toHaveLength(1);
  });

  it("shows practice stats: last practiced, current and best clean BPM, total minutes", async () => {
    const topic = await seedTopic(db, carlos.userId);
    await seedSession(db, carlos.userId, {
      practiceDate: "2026-09-28",
      blocks: [
        {
          topicId: topic.id,
          actualSeconds: 600,
          cleanBpm: 95,
          endedAt: new Date("2026-09-28T16:10:00Z"),
        },
      ],
    });
    await seedSession(db, carlos.userId, {
      practiceDate: "2026-10-01",
      blocks: [
        {
          topicId: topic.id,
          actualSeconds: 900,
          cleanBpm: 88,
          endedAt: new Date("2026-10-01T16:15:00Z"),
        },
      ],
    });
    const expected = {
      lastPracticedAt: "2026-10-01T16:15:00.000Z",
      lastPracticedDate: "2026-10-01",
      latestCleanBpm: 88,
      bestCleanBpm: 95,
      totalSeconds: 1500,
    };
    expect((await bodyOf(call("GET", `/topics/${topic.id}`))).stats).toEqual(expected);
    expect((await bodyOf(call("GET", "/topics"))).topics[0].stats).toEqual(expected);
  });

  it("refuses to delete a topic with practice logged, suggesting archive", async () => {
    const topic = await seedTopic(db, carlos.userId);
    await seedSession(db, carlos.userId, { blocks: [{ topicId: topic.id }] });
    const response = await call("DELETE", `/topics/${topic.id}`);
    expect(response.status).toBe(409);
    expect(await bodyOf(response)).toEqual({ error: topicErrors.hasPractice });
  });
});
