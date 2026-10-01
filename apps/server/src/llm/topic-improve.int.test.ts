import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { llmDrafts, topics } from "../db/schema";
import { bodyOf, createTestApp, TEST_APP_URL } from "../test/app";
import { useTestDatabase } from "../test/db";
import { fakeLlm } from "../test/fake-llm";
import { llmDeps } from "../test/llm";
import { linkTopic, seedLesson, seedSession, seedTopic } from "../test/seed";
import { createSignedInUser } from "../test/session";
import { runTopicImprove } from "./topic-improve";

const { db, truncateAll } = useTestDatabase();
const { app, auth, jobs } = createTestApp({ db });

let carlos: Awaited<ReturnType<typeof createSignedInUser>>;
beforeEach(async () => {
  await truncateAll();
  jobs.sent.length = 0;
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

const output = {
  description: "Tríadas **cerradas** del modo dórico.",
  practicePoints: ["Cuerdas 1–3 a 80", " ", "Subir de 5 en 5"],
  successCriteria: "Limpio a 100 dos días seguidos.",
};

async function improvedTopic() {
  const parent = await seedTopic(db, carlos.userId, { title: "Modo dórico" });
  const topic = await seedTopic(db, carlos.userId, {
    title: "Tríadas de dórico",
    parentId: parent.id,
    description: "Viejo",
  });
  await seedTopic(db, carlos.userId, { title: "Inversiones", parentId: topic.id });
  const lesson = await seedLesson(db, carlos.userId, { summary: "Vimos tríadas en dórico" });
  await linkTopic(db, carlos.userId, lesson.id, topic.id);
  await seedSession(db, carlos.userId, {
    status: "completed",
    blocks: [
      {
        topicId: topic.id,
        actualSeconds: 600,
        startedAt: new Date("2026-10-01T16:00:00Z"),
        endedAt: new Date("2026-10-01T16:10:00Z"),
        cleanBpm: 85,
        rating: 3,
      },
    ],
  });
  const response = await call("POST", `/topics/${topic.id}/improve`);
  expect(response.status).toBe(202);
  const { draftId } = await bodyOf(response);
  return { topic, draftId: draftId as string };
}

describe("Mejorar tema", () => {
  it("AC-12: drafts from the topic, its family, its lessons and recent practice", async () => {
    const { topic, draftId } = await improvedTopic();
    expect(jobs.sent).toEqual([{ name: "llm.topic-improve", data: { draftId } }]);
    const { client, requests } = fakeLlm({ output });
    await runTopicImprove(llmDeps(db, client), draftId);

    const text = requests[0]?.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("");
    expect(text).toContain('"title":"Tríadas de dórico"');
    expect(text).toContain('"parent":"Modo dórico"');
    expect(text).toContain('"children":["Inversiones"]');
    expect(text).toContain("Vimos tríadas en dórico");
    expect(text).toContain('"cleanBpm":85');
    const [draft] = await db.select().from(llmDrafts).where(eq(llmDrafts.id, draftId));
    expect(draft).toMatchObject({
      status: "pending",
      payload: { ...output, practicePoints: ["Cuerdas 1–3 a 80", "Subir de 5 en 5"] },
      review: {
        description: { state: "pending" },
        practicePoints: { state: "pending" },
        successCriteria: { state: "pending" },
      },
    });
    const [unchanged] = await db.select().from(topics).where(eq(topics.id, topic.id));
    expect(unchanged?.description).toBe("Viejo");
  });

  it("AC-12: accepts each field separately, with edits", async () => {
    const { topic, draftId } = await improvedTopic();
    await runTopicImprove(llmDeps(db, fakeLlm({ output }).client), draftId);
    await call("POST", `/drafts/${draftId}/sections/description`, {
      action: "accept",
      value: "Tríadas cerradas.",
    });
    await call("POST", `/drafts/${draftId}/sections/practicePoints`, { action: "discard" });
    const response = await call("POST", `/drafts/${draftId}/sections/successCriteria`, {
      action: "accept",
    });
    expect((await bodyOf(response)).draft.status).toBe("accepted");
    const [row] = await db.select().from(topics).where(eq(topics.id, topic.id));
    expect(row).toMatchObject({
      description: "Tríadas cerradas.",
      practicePoints: [],
      successCriteria: "Limpio a 100 dos días seguidos.",
    });
    expect((await bodyOf(call("GET", `/topics/${topic.id}`))).draft).toBeNull();
  });

  it("AC-12: the topic page reports the draft while it runs", async () => {
    const { topic, draftId } = await improvedTopic();
    expect((await bodyOf(call("GET", `/topics/${topic.id}`))).draft).toEqual({
      id: draftId,
      status: "queued",
    });
  });

  it("deleting a topic deletes its drafts", async () => {
    const topic = await seedTopic(db, carlos.userId, { title: "Suelto" });
    expect((await call("POST", `/topics/${topic.id}/improve`)).status).toBe(202);
    expect((await call("DELETE", `/topics/${topic.id}`)).status).toBe(204);
    expect(await db.select().from(llmDrafts)).toEqual([]);
  });
});
