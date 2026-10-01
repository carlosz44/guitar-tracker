import { lessonErrors } from "@ds/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { lessonTopics } from "../db/schema";
import { bodyOf, createTestApp, TEST_APP_URL } from "../test/app";
import { useTestDatabase } from "../test/db";
import { linkTopic, seedLesson, seedTopic } from "../test/seed";
import { createSignedInUser } from "../test/session";

const { db, truncateAll } = useTestDatabase();
const { app, auth } = createTestApp({ db, allowedGithubIds: ["1001", "1002"] });

let carlos: Awaited<ReturnType<typeof createSignedInUser>>;
beforeEach(async () => {
  await truncateAll();
  carlos = await createSignedInUser(db, auth);
});

function putLinks(lessonId: string, links: unknown) {
  return app.request(`${TEST_APP_URL}/api/lessons/${lessonId}/topics`, {
    method: "PUT",
    headers: { cookie: carlos.cookie, "content-type": "application/json" },
    body: JSON.stringify(links),
  });
}

describe("PUT /api/lessons/:id/topics", () => {
  it("AC-15: links topics with a relation and returns them grouped", async () => {
    const lesson = await seedLesson(db, carlos.userId);
    const mode = await seedTopic(db, carlos.userId, { title: "Modo dórico" });
    const triads = await seedTopic(db, carlos.userId, { title: "Tríadas" });

    const response = await putLinks(lesson.id, [
      { topicId: mode.id, relation: "extended" },
      { topicId: triads.id, relation: "introduced" },
    ]);
    expect(response.status).toBe(200);
    const { topics } = await bodyOf(response);
    expect(topics.introduced.map((t: { id: string }) => t.id)).toEqual([triads.id]);
    expect(topics.extended.map((t: { id: string }) => t.id)).toEqual([mode.id]);
  });

  it("AC-15: replaces the previous links", async () => {
    const lesson = await seedLesson(db, carlos.userId);
    const mode = await seedTopic(db, carlos.userId);
    const triads = await seedTopic(db, carlos.userId, { title: "Tríadas" });
    await linkTopic(db, carlos.userId, lesson.id, mode.id, "introduced");

    await putLinks(lesson.id, [{ topicId: triads.id, relation: "reviewed" }]);
    const rows = await db.select().from(lessonTopics);
    expect(rows.map((row) => [row.topicId, row.relation])).toEqual([[triads.id, "reviewed"]]);

    await putLinks(lesson.id, []);
    expect(await db.select().from(lessonTopics)).toEqual([]);
  });

  it("AC-15: rejects the same topic twice", async () => {
    const lesson = await seedLesson(db, carlos.userId);
    const mode = await seedTopic(db, carlos.userId);
    const response = await putLinks(lesson.id, [
      { topicId: mode.id, relation: "introduced" },
      { topicId: mode.id, relation: "reviewed" },
    ]);
    expect(response.status).toBe(400);
    expect((await bodyOf(response)).issues[0].message).toBe(lessonErrors.duplicateTopic);
  });

  it("AC-15: rejects a topic that isn't mine and keeps the existing links", async () => {
    const other = await createSignedInUser(db, auth, { githubId: "1002" });
    const theirs = await seedTopic(db, other.userId);
    const lesson = await seedLesson(db, carlos.userId);
    const mine = await seedTopic(db, carlos.userId);
    await linkTopic(db, carlos.userId, lesson.id, mine.id);

    const response = await putLinks(lesson.id, [
      { topicId: mine.id, relation: "introduced" },
      { topicId: theirs.id, relation: "introduced" },
    ]);
    expect(response.status).toBe(400);
    expect(await bodyOf(response)).toEqual({
      error: "invalid",
      issues: [{ path: [1, "topicId"], message: lessonErrors.unknownTopic }],
    });
    expect(await db.select().from(lessonTopics)).toHaveLength(1);
  });

  it("answers 404 for another user's lesson", async () => {
    const other = await createSignedInUser(db, auth, { githubId: "1002" });
    const lesson = await seedLesson(db, other.userId);
    expect((await putLinks(lesson.id, [])).status).toBe(404);
  });
});
