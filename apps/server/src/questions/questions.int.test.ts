import { questionErrors } from "@ds/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { bodyOf, createTestApp, TEST_APP_URL } from "../test/app";
import { useTestDatabase } from "../test/db";
import { seedLesson, seedQuestion, seedTopic } from "../test/seed";
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

describe("questions API", () => {
  it("AC-16: adds a question without a topic (global or from a lesson)", async () => {
    const response = await call("POST", "/questions", { text: "¿Cómo practico el vibrato?" });
    expect(response.status).toBe(201);
    expect((await bodyOf(response)).question).toMatchObject({
      text: "¿Cómo practico el vibrato?",
      topicId: null,
      status: "open",
    });
  });

  it("AC-16: links the question to the topic it was created from", async () => {
    const topic = await seedTopic(db, carlos.userId);
    const response = await call("POST", "/questions", { text: "¿Digitación?", topicId: topic.id });
    expect((await bodyOf(response)).question.topicId).toBe(topic.id);
    const listed = await bodyOf(call("GET", `/questions?topicId=${topic.id}`));
    expect(listed.questions[0].topic).toEqual({ id: topic.id, title: topic.title });
  });

  it("AC-16: rejects a topic that isn't mine", async () => {
    const other = await createSignedInUser(db, auth, { githubId: "1002" });
    const theirs = await seedTopic(db, other.userId);
    const response = await call("POST", "/questions", { text: "?", topicId: theirs.id });
    expect(response.status).toBe(400);
    expect((await bodyOf(response)).issues[0].message).toBe(questionErrors.topic);
  });

  it("AC-17: lists open questions oldest first", async () => {
    await seedQuestion(db, carlos.userId, { text: "Primera" });
    await seedQuestion(db, carlos.userId, { text: "Descartada", status: "dismissed" });
    await seedQuestion(db, carlos.userId, { text: "Segunda" });
    const listed = await bodyOf(call("GET", "/questions?status=open"));
    expect(listed.questions.map((q: { text: string }) => q.text)).toEqual(["Primera", "Segunda"]);
  });

  it("AC-17: marks a question answered with the answer and an optional lesson", async () => {
    const question = await seedQuestion(db, carlos.userId);
    const lesson = await seedLesson(db, carlos.userId);
    const response = await call("PATCH", `/questions/${question.id}`, {
      status: "answered",
      answer: "Usa 1-2-4",
      answeredInLessonId: lesson.id,
    });
    expect((await bodyOf(response)).question).toMatchObject({
      status: "answered",
      answer: "Usa 1-2-4",
      answeredInLessonId: lesson.id,
    });

    const withoutLesson = await seedQuestion(db, carlos.userId);
    const plain = await call("PATCH", `/questions/${withoutLesson.id}`, {
      status: "answered",
      answer: "Sí",
    });
    expect((await bodyOf(plain)).question.answeredInLessonId).toBeNull();
  });

  it("AC-17: answering needs answer text", async () => {
    const question = await seedQuestion(db, carlos.userId);
    const response = await call("PATCH", `/questions/${question.id}`, { status: "answered" });
    expect(response.status).toBe(400);
    expect((await bodyOf(response)).issues[0].message).toBe(questionErrors.answer);
  });

  it("AC-17: dismisses a question", async () => {
    const question = await seedQuestion(db, carlos.userId);
    const response = await call("PATCH", `/questions/${question.id}`, { status: "dismissed" });
    expect((await bodyOf(response)).question.status).toBe("dismissed");
  });

  it("rejects answering in another user's lesson and editing another user's question", async () => {
    const other = await createSignedInUser(db, auth, { githubId: "1002" });
    const theirLesson = await seedLesson(db, other.userId);
    const theirQuestion = await seedQuestion(db, other.userId);
    const mine = await seedQuestion(db, carlos.userId);
    expect(
      (
        await call("PATCH", `/questions/${mine.id}`, {
          status: "answered",
          answer: "x",
          answeredInLessonId: theirLesson.id,
        })
      ).status,
    ).toBe(400);
    expect(
      (await call("PATCH", `/questions/${theirQuestion.id}`, { status: "dismissed" })).status,
    ).toBe(404);
  });
});
