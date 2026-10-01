import { type ManualSession, sessionErrors } from "@ds/shared";
import { and, asc, eq, gte, inArray, lte, ne } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import { practiceSessions, sessionBlocks, topics } from "../db/schema";
import { targetForDate } from "../planner/queries";
import { getOrCreateSettings } from "../settings";
import { dayTotals } from "./queries";
import { addDays, cycleStart, isMet, practiceDate, splitManual } from "./rules";
import {
  activateTopic,
  ensureDaySnapshot,
  loadSessionView,
  type SessionDeps,
  SessionError,
} from "./sessions";

export function createHistoryService(deps: SessionDeps) {
  const { db, clock } = deps;

  return {
    async manual(userId: string, input: ManualSession) {
      const settings = await getOrCreateSettings(db, userId, deps.defaultTimezone);
      const target = await targetForDate(db, userId, settings, input.date);
      const wanted = input.items.flatMap((item) => (item.topicId ? [item.topicId] : []));
      const owned = wanted.length
        ? new Set(
            (
              await db
                .select({ id: topics.id })
                .from(topics)
                .where(
                  and(
                    eq(topics.userId, userId),
                    inArray(topics.id, wanted),
                    ne(topics.status, "archived"),
                  ),
                )
            ).map((row) => row.id),
          )
        : new Set<string>();
      if (wanted.some((id) => !owned.has(id)))
        throw new SessionError(400, sessionErrors.unknownTopic);

      const seconds = splitManual(
        input.minutes * 60,
        input.items.map((item) => (item.minutes ? item.minutes * 60 : null)),
      );
      const now = clock.now();
      const sessionId = uuidv7();
      await db.transaction(async (tx) => {
        await tx.insert(practiceSessions).values({
          id: sessionId,
          userId,
          startedAt: now,
          endedAt: now,
          lastActivityAt: now,
          status: "completed",
          source: "manual",
          notes: input.notes ?? "",
          practiceDate: input.date,
        });
        await tx.insert(sessionBlocks).values(
          input.items.map((item, position) => ({
            id: uuidv7(),
            userId,
            sessionId,
            position,
            topicId: item.topicId ?? null,
            label: item.topicId ? null : (item.label ?? null),
            plannedSeconds: Math.max(1, seconds[position] ?? 0),
            actualSeconds: seconds[position] ?? 0,
            cleanBpm: item.cleanBpm ?? null,
          })),
        );
        await ensureDaySnapshot(tx, userId, input.date, target);
        for (const id of wanted) await activateTopic(tx, userId, id);
      });
      const view = await loadSessionView(db, userId, sessionId, now);
      if (!view) throw new Error("manual session missing after insert");
      return view;
    },

    async history(userId: string, query: { before?: string; cycles: number }) {
      const settings = await getOrCreateSettings(db, userId, deps.defaultTimezone);
      const today = practiceDate(clock.now(), settings.timezone);
      const todayTarget = await targetForDate(db, userId, settings, today);
      const lastStart = cycleStart(query.before ?? today, settings.lessonWeekday);
      const from = addDays(lastStart, -7 * (query.cycles - 1));
      const to = addDays(lastStart, 6);

      const sessions = await db
        .select()
        .from(practiceSessions)
        .where(
          and(
            eq(practiceSessions.userId, userId),
            ne(practiceSessions.status, "in_progress"),
            gte(practiceSessions.practiceDate, from),
            lte(practiceSessions.practiceDate, to),
          ),
        )
        .orderBy(asc(practiceSessions.startedAt));
      const blocks = sessions.length
        ? await db
            .select({ block: sessionBlocks, title: topics.title })
            .from(sessionBlocks)
            .leftJoin(topics, eq(topics.id, sessionBlocks.topicId))
            .where(
              inArray(
                sessionBlocks.sessionId,
                sessions.map((session) => session.id),
              ),
            )
            .orderBy(asc(sessionBlocks.position))
        : [];
      const days = await dayTotals(db, userId);

      const summaries = sessions.map((session) => {
        const own = blocks.filter(({ block }) => block.sessionId === session.id);
        const ratings = own.flatMap(({ block }) => (block.rating ? [block.rating] : []));
        return {
          id: session.id,
          date: session.practiceDate,
          startedAt: session.startedAt.toISOString(),
          source: session.source,
          status: session.status,
          seconds: own.reduce((sum, { block }) => sum + (block.actualSeconds ?? 0), 0),
          topics: [...new Set(own.map(({ block, title }) => title ?? block.label ?? ""))],
          averageRating: ratings.length
            ? ratings.reduce((a, b) => a + b, 0) / ratings.length
            : null,
        };
      });

      const cycles = Array.from({ length: query.cycles }, (_, index) => {
        const start = addDays(lastStart, -7 * index);
        const end = addDays(start, 6);
        const dates = [
          ...new Set(summaries.filter((s) => s.date >= start && s.date <= end).map((s) => s.date)),
        ]
          .sort()
          .reverse();
        const dayList = dates.map((date) => {
          const total = days.get(date);
          const targetMinutes = date === today ? todayTarget : (total?.targetMinutes ?? null);
          const seconds = total?.seconds ?? 0;
          return {
            date,
            seconds,
            targetMinutes,
            met: isMet(seconds, targetMinutes),
            sessions: summaries.filter((s) => s.date === date),
          };
        });
        return {
          start,
          end,
          seconds: dayList.reduce((sum, day) => sum + day.seconds, 0),
          daysPracticed: dayList.filter((day) => day.seconds > 0).length,
          days: dayList,
        };
      });
      return { cycles, nextBefore: addDays(from, -1) };
    },
  };
}
