import { sessionErrors } from "@ds/shared";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { fakeClock } from "../clock";
import { practiceDays, topics } from "../db/schema";
import { bodyOf, createTestApp, TEST_APP_URL } from "../test/app";
import { useTestDatabase } from "../test/db";
import { seedTopic } from "../test/seed";
import { createSignedInUser } from "../test/session";

const { db, truncateAll } = useTestDatabase();
const T0 = "2026-10-01T16:00:00.000Z";
const clock = fakeClock(T0);
const { app, auth } = createTestApp({ db, clock, allowedGithubIds: ["1001", "1002"] });

let carlos: Awaited<ReturnType<typeof createSignedInUser>>;
beforeEach(async () => {
  await truncateAll();
  clock.set(T0);
  carlos = await createSignedInUser(db, auth);
});

const at = (seconds: number) => new Date(new Date(T0).getTime() + seconds * 1000).toISOString();
const advanceTo = (seconds: number) => clock.set(at(seconds));

function call(method: string, path: string, body?: unknown, cookie = carlos.cookie) {
  return app.request(`${TEST_APP_URL}/api/sessions${path}`, {
    method,
    headers: { cookie, ...(body !== undefined ? { "content-type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

async function start(blocks?: unknown[]) {
  const topic = await seedTopic(db, carlos.userId, { status: "new", targetBpm: 90 });
  const response = await call("POST", "", {
    blocks: blocks ?? [
      { label: "Calentamiento", plannedSeconds: 300 },
      { topicId: topic.id, plannedSeconds: 900 },
    ],
  });
  return { response, topic, session: (await bodyOf(response)).session };
}

const action = (session: { id: string; blocks: { id: string }[] }, index: number, body: unknown) =>
  bodyOf(call("PATCH", `/${session.id}/blocks/${session.blocks[index]?.id}`, body)).then(
    (r) => r.session,
  );

describe("starting a session", () => {
  it("AC-5: creates the session and its blocks on the server, the first one running", async () => {
    const { response, session, topic } = await start();
    expect(response.status).toBe(201);
    expect(session).toMatchObject({
      status: "in_progress",
      source: "timer",
      practiceDate: "2026-10-01",
      serverNow: T0,
    });
    expect(session.blocks).toMatchObject([
      { title: "Calentamiento", topicId: null, plannedSeconds: 300, startedAt: T0, endedAt: null },
      {
        title: topic.title,
        topicId: topic.id,
        plannedSeconds: 900,
        startedAt: null,
        targetBpm: 90,
      },
    ]);
  });

  it("snapshots today's target the first time a session starts that day", async () => {
    await start();
    expect(await db.select().from(practiceDays)).toMatchObject([
      { date: "2026-10-01", targetMinutes: 30 },
    ]);
  });

  it("allows one session at a time and says which one is in progress", async () => {
    const { session } = await start();
    const second = await call("POST", "", { blocks: [{ label: "Libre", plannedSeconds: 300 }] });
    expect(second.status).toBe(409);
    expect(await bodyOf(second)).toEqual({
      error: sessionErrors.active,
      activeSessionId: session.id,
    });
  });

  it("rejects archived topics and topics that aren't mine", async () => {
    const archived = await seedTopic(db, carlos.userId, { status: "archived" });
    const response = await call("POST", "", {
      blocks: [{ topicId: archived.id, plannedSeconds: 300 }],
    });
    expect(await bodyOf(response)).toEqual({ error: sessionErrors.unknownTopic });
  });
});

describe("timing", () => {
  it("AC-11: logging a block records actual seconds, BPM, rating and note, and starts the next", async () => {
    const { session } = await start();
    advanceTo(320);
    const updated = await action(session, 0, {
      action: "complete",
      endedAt: at(310),
      nextStartsAt: at(318),
      cleanBpm: 80,
      rating: 4,
      notes: "Suelto",
    });
    expect(updated.blocks[0]).toMatchObject({
      endedAt: at(310),
      actualSeconds: 310,
      cleanBpm: 80,
      rating: 4,
      notes: "Suelto",
    });
    expect(updated.blocks[1]).toMatchObject({ startedAt: at(318), endedAt: null });
  });

  it("AC-8: paused time counts toward neither the block nor the session", async () => {
    const { session } = await start();
    advanceTo(60);
    expect((await bodyOf(call("POST", `/${session.id}/pause`, {}))).session.pausedAt).toBe(at(60));
    advanceTo(70);
    await call("POST", `/${session.id}/pause`, {});
    advanceTo(180);
    const resumed = (await bodyOf(call("POST", `/${session.id}/resume`, {}))).session;
    expect(resumed).toMatchObject({ pausedAt: null, pausedSeconds: 120 });
    expect(resumed.blocks[0].pausedSeconds).toBe(120);
    advanceTo(420);
    const done = await action(session, 0, { action: "complete" });
    expect(done.blocks[0].actualSeconds).toBe(300);
  });

  it("AC-8: logging while paused closes the pause at the moment the block ended", async () => {
    const { session } = await start();
    advanceTo(100);
    await call("POST", `/${session.id}/pause`, {});
    advanceTo(400);
    const done = await action(session, 0, { action: "complete", endedAt: at(250) });
    expect(done).toMatchObject({ pausedAt: null, pausedSeconds: 150 });
    expect(done.blocks[0].actualSeconds).toBe(100);
  });

  it("AC-6: a save that arrives late keeps the phone's timestamp, clamped to sensible bounds", async () => {
    const { session } = await start();
    advanceTo(3600);
    const late = await action(session, 0, {
      action: "complete",
      endedAt: at(305),
      nextStartsAt: at(320),
    });
    expect(late.blocks[0].actualSeconds).toBe(305);
    expect(late.blocks[1].startedAt).toBe(at(320));

    advanceTo(4000);
    const future = await action(late, 1, {
      action: "complete",
      endedAt: at(99_999),
      nextStartsAt: at(99_999),
    });
    expect(future.blocks[1]).toMatchObject({ endedAt: at(4000), actualSeconds: 3680 });
  });

  it("AC-11: overtime counts toward the block's actual seconds", async () => {
    const { session } = await start();
    advanceTo(420);
    expect((await action(session, 0, { action: "complete" })).blocks[0].actualSeconds).toBe(420);
  });

  it("AC-9: +5 min extends the current block; Saltar ends it early through the same log", async () => {
    const { session } = await start();
    advanceTo(200);
    expect((await action(session, 0, { action: "extend" })).blocks[0].plannedSeconds).toBe(600);
    advanceTo(240);
    const skipped = await action(session, 0, { action: "skip", rating: 2 });
    expect(skipped.blocks[0]).toMatchObject({ actualSeconds: 240, rating: 2 });
  });

  it("is safe to retry: logging the same block twice changes nothing", async () => {
    const { session } = await start();
    advanceTo(300);
    const first = await action(session, 0, { action: "complete", cleanBpm: 70 });
    advanceTo(500);
    const again = await action(session, 0, { action: "complete", cleanBpm: 99 });
    expect(again.blocks).toEqual(first.blocks);
  });

  it("refuses to log a block that hasn't started", async () => {
    const { session } = await start();
    const response = await call("PATCH", `/${session.id}/blocks/${session.blocks[1].id}`, {
      action: "complete",
    });
    expect(await bodyOf(response)).toEqual({ error: sessionErrors.notCurrent });
  });

  it("AC-14: a new topic becomes active the first time a block with it is saved", async () => {
    const { session, topic } = await start();
    advanceTo(300);
    const next = await action(session, 0, { action: "complete" });
    expect((await db.select().from(topics).where(eq(topics.id, topic.id)))[0]?.status).toBe("new");
    advanceTo(1200);
    await action(next, 1, { action: "complete" });
    expect((await db.select().from(topics).where(eq(topics.id, topic.id)))[0]?.status).toBe(
      "active",
    );
  });
});

describe("ending", () => {
  it("AC-13: Terminar completes the session with its note", async () => {
    const { session } = await start();
    advanceTo(300);
    const next = await action(session, 0, { action: "complete" });
    advanceTo(1200);
    await action(next, 1, { action: "complete" });
    advanceTo(1260);
    const finished = (await bodyOf(call("POST", `/${session.id}/finish`, { notes: "Buen día" })))
      .session;
    expect(finished).toMatchObject({ status: "completed", endedAt: at(1200), notes: "Buen día" });
  });

  it("finishing early logs the running block up to now", async () => {
    const { session } = await start();
    advanceTo(120);
    const finished = (await bodyOf(call("POST", `/${session.id}/finish`, {}))).session;
    expect(finished.blocks[0]).toMatchObject({ actualSeconds: 120, endedAt: at(120) });
    expect(finished.blocks[1].actualSeconds).toBeNull();
  });

  it("discarding keeps the blocks already logged", async () => {
    const { session } = await start();
    advanceTo(300);
    await action(session, 0, { action: "complete" });
    advanceTo(400);
    const abandoned = (await bodyOf(call("POST", `/${session.id}/abandon`))).session;
    expect(abandoned.status).toBe("abandoned");
    expect(abandoned.blocks[0].actualSeconds).toBe(300);
    expect(
      (await call("POST", "", { blocks: [{ label: "Libre", plannedSeconds: 300 }] })).status,
    ).toBe(201);
  });

  it("another user's session is out of reach", async () => {
    const { session } = await start();
    const other = await createSignedInUser(db, auth, { githubId: "1002" });
    expect((await call("GET", `/${session.id}`, undefined, other.cookie)).status).toBe(404);
    expect((await call("POST", `/${session.id}/pause`, {}, other.cookie)).status).toBe(404);
  });
});
