import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from "vitest";
import { fakeClock } from "../clock";
import { workerHeartbeat } from "../db/schema";
import { createTestApp } from "../test/app";
import { useTestDatabase } from "../test/db";
import { type Boss, createBoss, QUEUES } from "./boss";
import { HEARTBEAT_CRON, recordHeartbeat, registerHeartbeat } from "./heartbeat";

const { db, truncateAll } = useTestDatabase();
const clock = fakeClock("2026-10-01T15:00:00Z");
const { app } = createTestApp({ db, clock });

let boss: Boss;
beforeAll(async () => {
  boss = createBoss(inject("databaseUrl"));
  await boss.start();
  await registerHeartbeat(boss, { db, clock });
});
afterAll(() => boss.stop({ graceful: false }));
beforeEach(truncateAll);

async function waitFor<T>(read: () => Promise<T | undefined>, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await read();
    if (value !== undefined) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("timed out waiting");
}

describe("worker heartbeat", () => {
  it("upserts the single heartbeat row", async () => {
    await recordHeartbeat(db, clock);
    clock.advance(60_000);
    await recordHeartbeat(db, clock);
    const rows = await db.select().from(workerHeartbeat);
    expect(rows).toEqual([{ id: 1, beatAt: new Date("2026-10-01T15:01:00Z") }]);
  });

  it("is scheduled every minute", async () => {
    const [schedule] = await boss.getSchedules(QUEUES.heartbeat);
    expect(schedule).toMatchObject({ name: QUEUES.heartbeat, cron: HEARTBEAT_CRON });
  });

  it("AC-10: a heartbeat job processed by the worker turns health ok", async () => {
    const before = await (await app.request("/api/health")).json();
    expect(before).toMatchObject({ worker: "stale" });

    await boss.send(QUEUES.heartbeat);
    await waitFor(async () => (await db.select().from(workerHeartbeat))[0]);

    expect(await (await app.request("/api/health")).json()).toEqual({
      status: "ok",
      db: "ok",
      worker: "ok",
    });
  }, 20_000);
});
