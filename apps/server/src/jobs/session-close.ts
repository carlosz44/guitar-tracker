import { and, eq, lt, sql } from "drizzle-orm";
import type { Clock } from "../clock";
import type { Database } from "../db/client";
import { practiceSessions } from "../db/schema";
import type { Logger } from "../logger";
import { type Boss, ensureQueue, QUEUES } from "./boss";

export const SESSION_CLOSE_CRON = "7 * * * *";
export const STALE_SESSION_MS = 3 * 60 * 60 * 1000;

export async function closeStaleSessions(deps: { db: Database; clock: Clock; logger: Logger }) {
  const cutoff = new Date(deps.clock.now().getTime() - STALE_SESSION_MS);
  const closed = await deps.db
    .update(practiceSessions)
    .set({ status: "abandoned", endedAt: sql`${practiceSessions.lastActivityAt}`, pausedAt: null })
    .where(
      and(eq(practiceSessions.status, "in_progress"), lt(practiceSessions.lastActivityAt, cutoff)),
    )
    .returning({ id: practiceSessions.id });
  if (closed.length > 0) deps.logger.info({ closed: closed.length }, "stale sessions abandoned");
  return closed.length;
}

export async function registerSessionClose(
  boss: Boss,
  deps: { db: Database; clock: Clock; logger: Logger },
) {
  await ensureQueue(boss, QUEUES.sessionClose);
  await boss.schedule(QUEUES.sessionClose, SESSION_CLOSE_CRON, null, { tz: "UTC", missed: "skip" });
  await boss.work(QUEUES.sessionClose, async () => {
    await closeStaleSessions(deps);
  });
}
