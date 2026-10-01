import type { Clock } from "../clock";
import type { Database } from "../db/client";
import { workerHeartbeat } from "../db/schema";
import { type Boss, ensureQueue, QUEUES } from "./boss";

export const HEARTBEAT_CRON = "* * * * *";

export async function recordHeartbeat(db: Database, clock: Clock) {
  const beatAt = clock.now();
  await db
    .insert(workerHeartbeat)
    .values({ id: 1, beatAt })
    .onConflictDoUpdate({ target: workerHeartbeat.id, set: { beatAt } });
}

export async function registerHeartbeat(boss: Boss, deps: { db: Database; clock: Clock }) {
  await ensureQueue(boss, QUEUES.heartbeat);
  await boss.schedule(QUEUES.heartbeat, HEARTBEAT_CRON, null, { tz: "UTC", missed: "skip" });
  await boss.work(QUEUES.heartbeat, { pollingIntervalSeconds: 5 }, async () => {
    await recordHeartbeat(deps.db, deps.clock);
  });
}
