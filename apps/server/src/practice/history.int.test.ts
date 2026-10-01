import { sessionErrors } from "@ds/shared";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { fakeClock } from "../clock";
import { practiceDays, practiceSessions, topics } from "../db/schema";
import { bodyOf, createTestApp, TEST_APP_URL } from "../test/app";
import { useTestDatabase } from "../test/db";
import { seedSession, seedTopic } from "../test/seed";
import { createSignedInUser } from "../test/session";

const { db, truncateAll } = useTestDatabase();
const clock = fakeClock("2026-10-07T21:00:00Z");
const { app, auth } = createTestApp({ db, clock });

let carlos: Awaited<ReturnType<typeof createSignedInUser>>;
beforeEach(async () => {
  await truncateAll();
  clock.set("2026-10-07T21:00:00Z");
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

describe("manual log", () => {
  it("AC-17: creates a completed manual session, splitting the duration across topics", async () => {
    const triads = await seedTopic(db, carlos.userId, { title: "Tríadas", status: "new" });
    const response = await call("POST", "/sessions/manual", {
      date: "2026-10-06",
      minutes: 35,
      items: [{ topicId: triads.id, cleanBpm: 85 }, { label: "Cromática" }],
      notes: "Sin la app",
    });
    expect(response.status).toBe(201);
    const { session } = await bodyOf(response);
    expect(session).toMatchObject({
      status: "completed",
      source: "manual",
      practiceDate: "2026-10-06",
      notes: "Sin la app",
    });
    expect(
      session.blocks.map(
        (block: { title: string; actualSeconds: number; cleanBpm: number | null }) => [
          block.title,
          block.actualSeconds,
          block.cleanBpm,
        ],
      ),
    ).toEqual([
      ["Tríadas", 1050, 85],
      ["Cromática", 1050, null],
    ]);
    expect((await db.select().from(topics).where(eq(topics.id, triads.id)))[0]?.status).toBe(
      "active",
    );
    expect(await db.select().from(practiceDays)).toMatchObject([
      { date: "2026-10-06", targetMinutes: 30 },
    ]);
  });

  it("AC-17: keeps per-topic minutes when given", async () => {
    const { session } = await bodyOf(
      call("POST", "/sessions/manual", {
        date: "2026-10-07",
        minutes: 30,
        items: [{ label: "Escalas", minutes: 20 }, { label: "Arpegios" }],
      }),
    );
    expect(session.blocks.map((block: { actualSeconds: number }) => block.actualSeconds)).toEqual([
      1200, 600,
    ]);
    expect((await bodyOf(call("GET", "/today"))).minutes).toBe(30);
  });

  it("AC-17: rejects topics that aren't mine or are archived", async () => {
    const archived = await seedTopic(db, carlos.userId, { status: "archived" });
    const response = await call("POST", "/sessions/manual", {
      date: "2026-10-07",
      minutes: 10,
      items: [{ topicId: archived.id }],
    });
    expect(await bodyOf(response)).toEqual({ error: sessionErrors.unknownTopic });
  });
});

describe("history", () => {
  it("AC-18: groups by practice cycle starting on the lesson weekday, then by day, with totals and checks", async () => {
    await seedSession(db, carlos.userId, {
      practiceDate: "2026-10-07",
      targetMinutes: 30,
      blocks: [{ actualSeconds: 1200 }],
    });
    await seedSession(db, carlos.userId, {
      practiceDate: "2026-10-07",
      blocks: [
        { actualSeconds: 900, rating: 4 },
        { actualSeconds: 300, rating: 2 },
      ],
    });
    await seedSession(db, carlos.userId, {
      practiceDate: "2026-10-01",
      targetMinutes: 30,
      blocks: [{ actualSeconds: 600 }],
    });
    await seedSession(db, carlos.userId, {
      practiceDate: "2026-09-30",
      targetMinutes: 20,
      blocks: [{ actualSeconds: 1500 }],
    });
    await seedSession(db, carlos.userId, {
      practiceDate: "2026-10-07",
      status: "in_progress",
      blocks: [{ actualSeconds: null }],
    });

    const { cycles, nextBefore } = await bodyOf(call("GET", "/sessions?cycles=2"));
    expect(cycles.map((cycle: { start: string; end: string }) => [cycle.start, cycle.end])).toEqual(
      [
        ["2026-10-01", "2026-10-07"],
        ["2026-09-24", "2026-09-30"],
      ],
    );
    const [current, previous] = cycles;
    expect(current).toMatchObject({ seconds: 3000, daysPracticed: 2 });
    expect(
      current.days.map((day: { date: string; seconds: number; met: boolean }) => [
        day.date,
        day.seconds,
        day.met,
      ]),
    ).toEqual([
      ["2026-10-07", 2400, true],
      ["2026-10-01", 600, false],
    ]);
    expect(current.days[0].sessions).toHaveLength(2);
    expect(current.days[0].sessions[1]).toMatchObject({ seconds: 1200, averageRating: 3 });
    expect(previous.days).toMatchObject([
      { date: "2026-09-30", seconds: 1500, targetMinutes: 20, met: true },
    ]);
    expect(nextBefore).toBe("2026-09-23");
  });

  it("AC-18: pages back with before", async () => {
    await seedSession(db, carlos.userId, {
      practiceDate: "2026-09-10",
      blocks: [{ actualSeconds: 600 }],
    });
    const { cycles } = await bodyOf(call("GET", "/sessions?cycles=1&before=2026-09-12"));
    expect(cycles[0]).toMatchObject({ start: "2026-09-10", end: "2026-09-16", seconds: 600 });
  });
});

describe("editing and deleting", () => {
  it("AC-19: edits block minutes, BPM, rating and notes, and today's total follows", async () => {
    const { session, blocks } = await seedSession(db, carlos.userId, {
      practiceDate: "2026-10-07",
      blocks: [{ actualSeconds: 600, cleanBpm: 80, rating: 3 }],
    });
    const response = await call("PATCH", `/sessions/${session.id}`, {
      notes: "Corregido",
      blocks: [{ id: blocks[0]?.id, actualMinutes: 25, cleanBpm: 90, rating: 5, notes: "Mejor" }],
    });
    expect((await bodyOf(response)).session).toMatchObject({
      notes: "Corregido",
      blocks: [{ actualSeconds: 1500, cleanBpm: 90, rating: 5, notes: "Mejor" }],
    });
    expect((await bodyOf(call("GET", "/today"))).minutes).toBe(25);
  });

  it("AC-19: deletes a session and today's total and streak follow", async () => {
    const { session } = await seedSession(db, carlos.userId, {
      practiceDate: "2026-10-07",
      targetMinutes: 30,
      blocks: [{ actualSeconds: 1800 }],
    });
    expect((await bodyOf(call("GET", "/today"))).streak).toBe(1);
    expect((await call("DELETE", `/sessions/${session.id}`)).status).toBe(204);
    expect(await db.select().from(practiceSessions)).toEqual([]);
    expect(await bodyOf(call("GET", "/today"))).toMatchObject({ minutes: 0, streak: 0 });
  });

  it("won't edit a session that is still running", async () => {
    const { session } = await seedSession(db, carlos.userId, { status: "in_progress" });
    expect(await bodyOf(call("PATCH", `/sessions/${session.id}`, { notes: "x" }))).toEqual({
      error: sessionErrors.active,
    });
  });
});
