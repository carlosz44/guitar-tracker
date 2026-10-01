import { BLOCK_STEP_SECONDS, type BlockAction, type PlannedBlock, sessionErrors } from "@ds/shared";
import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import type { Clock } from "../clock";
import type { Database } from "../db/client";
import { practiceDays, practiceSessions, sessionBlocks, topics } from "../db/schema";
import { getOrCreateSettings } from "../settings";
import { topicStats } from "./queries";
import { practiceDate } from "./rules";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type SessionRow = typeof practiceSessions.$inferSelect;
type BlockRow = typeof sessionBlocks.$inferSelect;

export class SessionError extends Error {
  constructor(
    readonly status: 400 | 404 | 409,
    readonly key: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(key);
  }
}

export interface SessionDeps {
  db: Database;
  clock: Clock;
  defaultTimezone: string;
}

export function clampInstant(value: string | undefined, min: Date, max: Date) {
  if (!value) return max;
  const time = new Date(value).getTime();
  return new Date(Math.min(Math.max(time, min.getTime()), max.getTime()));
}

const secondsBetween = (from: Date, to: Date) =>
  Math.max(0, Math.round((to.getTime() - from.getTime()) / 1000));

export async function loadSessionView(
  db: Database | Tx,
  userId: string,
  sessionId: string,
  serverNow: Date,
) {
  const [session] = await db
    .select()
    .from(practiceSessions)
    .where(and(eq(practiceSessions.userId, userId), eq(practiceSessions.id, sessionId)));
  if (!session) return null;
  const blocks = await db
    .select({ block: sessionBlocks, title: topics.title, targetBpm: topics.targetBpm })
    .from(sessionBlocks)
    .leftJoin(topics, eq(topics.id, sessionBlocks.topicId))
    .where(eq(sessionBlocks.sessionId, session.id))
    .orderBy(asc(sessionBlocks.position));
  const stats = await topicStats(db as Database, userId);
  return {
    id: session.id,
    status: session.status,
    source: session.source,
    practiceDate: session.practiceDate,
    startedAt: session.startedAt.toISOString(),
    endedAt: session.endedAt?.toISOString() ?? null,
    pausedAt: session.pausedAt?.toISOString() ?? null,
    pausedSeconds: session.pausedSeconds,
    notes: session.notes,
    serverNow: serverNow.toISOString(),
    blocks: blocks.map(({ block, title, targetBpm }) => ({
      id: block.id,
      position: block.position,
      topicId: block.topicId,
      label: block.label,
      title: title ?? block.label ?? "",
      targetBpm: targetBpm ?? null,
      lastCleanBpm: block.topicId ? (stats.get(block.topicId)?.latestCleanBpm ?? null) : null,
      plannedSeconds: block.plannedSeconds,
      startedAt: block.startedAt?.toISOString() ?? null,
      endedAt: block.endedAt?.toISOString() ?? null,
      pausedSeconds: block.pausedSeconds,
      actualSeconds: block.actualSeconds,
      cleanBpm: block.cleanBpm,
      rating: block.rating,
      notes: block.notes,
    })),
  };
}
export type SessionView = NonNullable<Awaited<ReturnType<typeof loadSessionView>>>;

async function lockSession(tx: Tx, userId: string, sessionId: string) {
  const [session] = await tx
    .select()
    .from(practiceSessions)
    .where(and(eq(practiceSessions.userId, userId), eq(practiceSessions.id, sessionId)))
    .for("update");
  if (!session) throw new SessionError(404, "not_found");
  return session;
}

async function blocksOf(tx: Tx, sessionId: string) {
  return tx
    .select()
    .from(sessionBlocks)
    .where(eq(sessionBlocks.sessionId, sessionId))
    .orderBy(asc(sessionBlocks.position));
}

const currentBlock = (blocks: BlockRow[]) =>
  blocks.find((block) => block.startedAt && !block.endedAt);

async function ownedTopicIds(tx: Tx | Database, userId: string, ids: string[]) {
  if (ids.length === 0) return new Set<string>();
  const rows = await tx
    .select({ id: topics.id })
    .from(topics)
    .where(and(eq(topics.userId, userId), inArray(topics.id, ids), ne(topics.status, "archived")));
  return new Set(rows.map((row) => row.id));
}

export async function ensureDaySnapshot(
  tx: Tx,
  userId: string,
  date: string,
  targetMinutes: number,
) {
  await tx.insert(practiceDays).values({ userId, date, targetMinutes }).onConflictDoNothing();
}

export async function activateTopic(tx: Tx, userId: string, topicId: string | null) {
  if (!topicId) return;
  await tx
    .update(topics)
    .set({ status: "active" })
    .where(and(eq(topics.userId, userId), eq(topics.id, topicId), eq(topics.status, "new")));
}

async function resumeIfPaused(tx: Tx, session: SessionRow, blocks: BlockRow[], at: Date) {
  if (!session.pausedAt) return session;
  const until = at < session.pausedAt ? session.pausedAt : at;
  const paused = secondsBetween(session.pausedAt, until);
  const running = currentBlock(blocks);
  if (running) {
    running.pausedSeconds += paused;
    await tx
      .update(sessionBlocks)
      .set({ pausedSeconds: running.pausedSeconds })
      .where(eq(sessionBlocks.id, running.id));
  }
  const [updated] = await tx
    .update(practiceSessions)
    .set({ pausedAt: null, pausedSeconds: session.pausedSeconds + paused })
    .where(eq(practiceSessions.id, session.id))
    .returning();
  return updated ?? session;
}

async function touch(tx: Tx, sessionId: string, now: Date) {
  await tx
    .update(practiceSessions)
    .set({ lastActivityAt: now })
    .where(eq(practiceSessions.id, sessionId));
}

export function createSessionService(deps: SessionDeps) {
  const { db, clock } = deps;

  const view = async (userId: string, sessionId: string) => {
    const result = await loadSessionView(db, userId, sessionId, clock.now());
    if (!result) throw new SessionError(404, "not_found");
    return result;
  };

  return {
    view,

    async start(userId: string, planned: PlannedBlock[]) {
      const settings = await getOrCreateSettings(db, userId, deps.defaultTimezone);
      const now = clock.now();
      const date = practiceDate(now, settings.timezone);
      const sessionId = uuidv7();
      try {
        await db.transaction(async (tx) => {
          const [active] = await tx
            .select({ id: practiceSessions.id })
            .from(practiceSessions)
            .where(
              and(eq(practiceSessions.userId, userId), eq(practiceSessions.status, "in_progress")),
            );
          if (active)
            throw new SessionError(409, sessionErrors.active, { activeSessionId: active.id });

          const wanted = planned.flatMap((block) => (block.topicId ? [block.topicId] : []));
          const owned = await ownedTopicIds(tx, userId, wanted);
          if (wanted.some((id) => !owned.has(id)))
            throw new SessionError(400, sessionErrors.unknownTopic);

          await tx.insert(practiceSessions).values({
            id: sessionId,
            userId,
            startedAt: now,
            lastActivityAt: now,
            practiceDate: date,
          });
          await tx.insert(sessionBlocks).values(
            planned.map((block, position) => ({
              id: uuidv7(),
              userId,
              sessionId,
              position,
              topicId: block.topicId ?? null,
              label: block.topicId ? null : (block.label ?? null),
              plannedSeconds: block.plannedSeconds,
              startedAt: position === 0 ? now : null,
            })),
          );
          await ensureDaySnapshot(tx, userId, date, settings.dailyTargetMinutes);
        });
      } catch (error) {
        if ((error as { cause?: { code?: string } }).cause?.code === "23505") {
          throw new SessionError(409, sessionErrors.active);
        }
        throw error;
      }
      return view(userId, sessionId);
    },

    async pause(userId: string, sessionId: string, at?: string) {
      await db.transaction(async (tx) => {
        const session = await lockSession(tx, userId, sessionId);
        if (session.status !== "in_progress") throw new SessionError(409, sessionErrors.notActive);
        if (session.pausedAt) return;
        const now = clock.now();
        const running = currentBlock(await blocksOf(tx, sessionId));
        const pausedAt = clampInstant(at, running?.startedAt ?? session.startedAt, now);
        await tx
          .update(practiceSessions)
          .set({ pausedAt, lastActivityAt: now })
          .where(eq(practiceSessions.id, sessionId));
      });
      return view(userId, sessionId);
    },

    async resume(userId: string, sessionId: string, at?: string) {
      await db.transaction(async (tx) => {
        const session = await lockSession(tx, userId, sessionId);
        if (session.status !== "in_progress") throw new SessionError(409, sessionErrors.notActive);
        if (!session.pausedAt) return;
        const now = clock.now();
        await resumeIfPaused(
          tx,
          session,
          await blocksOf(tx, sessionId),
          clampInstant(at, session.pausedAt, now),
        );
        await touch(tx, sessionId, now);
      });
      return view(userId, sessionId);
    },

    async blockAction(userId: string, sessionId: string, blockId: string, action: BlockAction) {
      await db.transaction(async (tx) => {
        let session = await lockSession(tx, userId, sessionId);
        const blocks = await blocksOf(tx, sessionId);
        const block = blocks.find((candidate) => candidate.id === blockId);
        if (!block) throw new SessionError(404, "not_found");
        if (block.endedAt && action.action !== "extend") return;
        if (session.status !== "in_progress") throw new SessionError(409, sessionErrors.notActive);
        if (!block.startedAt || block.endedAt)
          throw new SessionError(409, sessionErrors.notCurrent);
        const now = clock.now();

        if (action.action === "extend") {
          await tx
            .update(sessionBlocks)
            .set({ plannedSeconds: block.plannedSeconds + BLOCK_STEP_SECONDS })
            .where(eq(sessionBlocks.id, block.id));
          await touch(tx, sessionId, now);
          return;
        }

        const endedAt = clampInstant(action.endedAt, block.startedAt, now);
        session = await resumeIfPaused(tx, session, blocks, endedAt);
        const actualSeconds = Math.max(
          0,
          secondsBetween(block.startedAt, endedAt) - block.pausedSeconds,
        );
        await tx
          .update(sessionBlocks)
          .set({
            endedAt,
            actualSeconds,
            cleanBpm: action.cleanBpm ?? null,
            rating: action.rating ?? null,
            notes: action.notes ?? "",
          })
          .where(eq(sessionBlocks.id, block.id));
        await activateTopic(tx, userId, block.topicId);

        const next = blocks.find((candidate) => candidate.position === block.position + 1);
        if (next) {
          await tx
            .update(sessionBlocks)
            .set({ startedAt: clampInstant(action.nextStartsAt, endedAt, now) })
            .where(eq(sessionBlocks.id, next.id));
        }
        await touch(tx, sessionId, now);
      });
      return view(userId, sessionId);
    },

    async finish(userId: string, sessionId: string, notes?: string) {
      await db.transaction(async (tx) => {
        let session = await lockSession(tx, userId, sessionId);
        if (session.status === "completed") return;
        if (session.status !== "in_progress") throw new SessionError(409, sessionErrors.notActive);
        const now = clock.now();
        const blocks = await blocksOf(tx, sessionId);
        session = await resumeIfPaused(tx, session, blocks, now);
        const running = currentBlock(blocks);
        if (running?.startedAt) {
          await tx
            .update(sessionBlocks)
            .set({
              endedAt: now,
              actualSeconds: Math.max(
                0,
                secondsBetween(running.startedAt, now) - running.pausedSeconds,
              ),
            })
            .where(eq(sessionBlocks.id, running.id));
          await activateTopic(tx, userId, running.topicId);
        }
        const lastEnded = blocks.reduce<Date | null>(
          (latest, block) =>
            block.endedAt && (!latest || block.endedAt > latest) ? block.endedAt : latest,
          running ? now : null,
        );
        await tx
          .update(practiceSessions)
          .set({
            status: "completed",
            endedAt: lastEnded ?? now,
            lastActivityAt: now,
            notes: notes ?? session.notes,
          })
          .where(eq(practiceSessions.id, sessionId));
      });
      return view(userId, sessionId);
    },

    async update(
      userId: string,
      sessionId: string,
      input: {
        notes?: string;
        blocks?: {
          id: string;
          actualMinutes?: number;
          cleanBpm?: number | null;
          rating?: number | null;
          notes?: string;
        }[];
      },
    ) {
      await db.transaction(async (tx) => {
        const session = await lockSession(tx, userId, sessionId);
        if (session.status === "in_progress") throw new SessionError(409, sessionErrors.active);
        const blocks = await blocksOf(tx, sessionId);
        for (const change of input.blocks ?? []) {
          if (!blocks.some((block) => block.id === change.id))
            throw new SessionError(400, sessionErrors.notCurrent);
          await tx
            .update(sessionBlocks)
            .set({
              ...(change.actualMinutes !== undefined
                ? { actualSeconds: change.actualMinutes * 60 }
                : {}),
              ...(change.cleanBpm !== undefined ? { cleanBpm: change.cleanBpm } : {}),
              ...(change.rating !== undefined ? { rating: change.rating } : {}),
              ...(change.notes !== undefined ? { notes: change.notes } : {}),
            })
            .where(eq(sessionBlocks.id, change.id));
        }
        if (input.notes !== undefined) {
          await tx
            .update(practiceSessions)
            .set({ notes: input.notes })
            .where(eq(practiceSessions.id, sessionId));
        }
      });
      return view(userId, sessionId);
    },

    async remove(userId: string, sessionId: string) {
      await db.transaction(async (tx) => {
        await lockSession(tx, userId, sessionId);
        await tx.delete(practiceSessions).where(eq(practiceSessions.id, sessionId));
      });
    },

    async abandon(userId: string, sessionId: string) {
      await db.transaction(async (tx) => {
        const session = await lockSession(tx, userId, sessionId);
        if (session.status !== "in_progress") return;
        const now = clock.now();
        await tx
          .update(practiceSessions)
          .set({ status: "abandoned", endedAt: now, pausedAt: null, lastActivityAt: now })
          .where(eq(practiceSessions.id, sessionId));
      });
      return view(userId, sessionId);
    },
  };
}
