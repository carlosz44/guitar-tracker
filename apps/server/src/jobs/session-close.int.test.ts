import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from "vitest";
import { fakeClock } from "../clock";
import { practiceSessions, sessionBlocks } from "../db/schema";
import { createTestApp } from "../test/app";
import { useTestDatabase } from "../test/db";
import { silentLogger } from "../test/logger";
import { seedSession } from "../test/seed";
import { createSignedInUser } from "../test/session";
import { type Boss, createBoss, QUEUES } from "./boss";
import { closeStaleSessions, registerSessionClose, SESSION_CLOSE_CRON } from "./session-close";

const { db, truncateAll } = useTestDatabase();
const { auth } = createTestApp({ db });
const clock = fakeClock("2026-10-01T22:00:00Z");
const deps = { db, clock, logger: silentLogger };

let userId: string;
beforeEach(async () => {
  await truncateAll();
  userId = (await createSignedInUser(db, auth)).userId;
});

describe("session.close-stale", () => {
  it("AC-16: abandons sessions idle for over 3 hours, ending them at the last activity and keeping their blocks", async () => {
    const lastActivityAt = new Date("2026-10-01T18:30:00Z");
    const { session: stale } = await seedSession(db, userId, {
      status: "in_progress",
      lastActivityAt,
      pausedAt: new Date("2026-10-01T18:30:00Z"),
      blocks: [{ actualSeconds: 600 }, { actualSeconds: null, endedAt: null }],
    });
    expect(await closeStaleSessions(deps)).toBe(1);
    const [row] = await db.select().from(practiceSessions).where(eq(practiceSessions.id, stale.id));
    expect(row).toMatchObject({ status: "abandoned", endedAt: lastActivityAt, pausedAt: null });
    const blocks = await db
      .select()
      .from(sessionBlocks)
      .where(eq(sessionBlocks.sessionId, stale.id));
    expect(blocks.map((block) => block.actualSeconds).sort()).toEqual([600, null]);
  });

  it("AC-16: leaves recent and finished sessions alone", async () => {
    await seedSession(db, userId, {
      status: "in_progress",
      lastActivityAt: new Date("2026-10-01T19:30:00Z"),
    });
    await seedSession(db, userId, {
      status: "completed",
      lastActivityAt: new Date("2026-09-01T00:00:00Z"),
    });
    expect(await closeStaleSessions(deps)).toBe(0);
  });
});

describe("worker wiring", () => {
  let boss: Boss;
  beforeAll(async () => {
    boss = createBoss(inject("databaseUrl"));
    await boss.start();
    await registerSessionClose(boss, deps);
  });
  afterAll(() => boss.stop({ graceful: false }));

  it("AC-16: runs every hour", async () => {
    expect(await boss.getSchedule(QUEUES.sessionClose)).toMatchObject({ cron: SESSION_CLOSE_CRON });
  });
});
