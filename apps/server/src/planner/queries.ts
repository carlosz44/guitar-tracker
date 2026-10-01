import { and, asc, desc, eq, gte, inArray, isNotNull, lte, ne, sql } from "drizzle-orm";
import type { Database, Tx } from "../db/client";
import {
  lessons,
  lessonTopics,
  planDays,
  planItems,
  practiceSessions,
  sessionBlocks,
  topics,
  weeklyPlans,
} from "../db/schema";
import { dayTotals, topicStats } from "../practice/queries";
import type { PlannerTopic } from "./rules";

type Db = Database | Tx;

export async function plannerTopics(
  db: Db,
  userId: string,
): Promise<(PlannerTopic & { targetBpm: number | null; latestCleanBpm: number | null })[]> {
  const [rows, stats, ratings] = await Promise.all([
    db
      .select({
        id: topics.id,
        title: topics.title,
        status: topics.status,
        priority: topics.priority,
        targetBpm: topics.targetBpm,
      })
      .from(topics)
      .where(and(eq(topics.userId, userId), ne(topics.status, "archived"))),
    topicStats(db as Database, userId),
    db.execute<{ topic_id: string; rating: number }>(sql`
      SELECT topic_id, rating FROM (
        SELECT b.topic_id, b.rating,
               row_number() OVER (PARTITION BY b.topic_id ORDER BY b.ended_at DESC) AS n
          FROM ${sessionBlocks} b
         WHERE b.user_id = ${userId} AND b.topic_id IS NOT NULL AND b.rating IS NOT NULL
      ) ranked
      WHERE n <= 3
      ORDER BY topic_id, n`),
  ]);
  const recent = new Map<string, number[]>();
  for (const row of ratings.rows) {
    recent.set(row.topic_id, [...(recent.get(row.topic_id) ?? []), row.rating]);
  }
  return rows.map((row) => ({
    ...row,
    lastPracticedDate: stats.get(row.id)?.lastPracticedDate ?? null,
    latestCleanBpm: stats.get(row.id)?.latestCleanBpm ?? null,
    recentRatings: recent.get(row.id) ?? [],
  }));
}

export async function cycleLesson(db: Db, userId: string, cycleStart: string, cycleEnd: string) {
  const [lesson] = await db
    .select({
      id: lessons.id,
      date: lessons.date,
      title: lessons.title,
      summary: lessons.summary,
      practicePoints: lessons.practicePoints,
    })
    .from(lessons)
    .where(
      and(eq(lessons.userId, userId), gte(lessons.date, cycleStart), lte(lessons.date, cycleEnd)),
    )
    .orderBy(desc(lessons.date), desc(lessons.createdAt))
    .limit(1);
  if (!lesson) return null;
  const links = await db
    .select({ topicId: lessonTopics.topicId })
    .from(lessonTopics)
    .where(
      and(
        eq(lessonTopics.userId, userId),
        eq(lessonTopics.lessonId, lesson.id),
        inArray(lessonTopics.relation, ["introduced", "extended"]),
      ),
    );
  return { ...lesson, topicIds: new Set(links.map((link) => link.topicId)) };
}

export async function practicedTopicsByDate(db: Db, userId: string, from: string, to: string) {
  const rows = await db
    .selectDistinct({ date: practiceSessions.practiceDate, topicId: sessionBlocks.topicId })
    .from(sessionBlocks)
    .innerJoin(practiceSessions, eq(practiceSessions.id, sessionBlocks.sessionId))
    .where(
      and(
        eq(sessionBlocks.userId, userId),
        isNotNull(sessionBlocks.topicId),
        isNotNull(sessionBlocks.actualSeconds),
        gte(practiceSessions.practiceDate, from),
        lte(practiceSessions.practiceDate, to),
      ),
    );
  const byDate = new Map<string, Set<string>>();
  for (const row of rows) {
    if (!row.topicId) continue;
    byDate.set(row.date, (byDate.get(row.date) ?? new Set()).add(row.topicId));
  }
  return byDate;
}

export async function planDaysWithItems(db: Db, planId: string) {
  const days = await db
    .select()
    .from(planDays)
    .where(eq(planDays.planId, planId))
    .orderBy(asc(planDays.date));
  const items = days.length
    ? await db
        .select({
          id: planItems.id,
          planDayId: planItems.planDayId,
          position: planItems.position,
          topicId: planItems.topicId,
          label: planItems.label,
          minutes: planItems.minutes,
          title: topics.title,
          targetBpm: topics.targetBpm,
        })
        .from(planItems)
        .leftJoin(topics, eq(topics.id, planItems.topicId))
        .where(
          inArray(
            planItems.planDayId,
            days.map((day) => day.id),
          ),
        )
        .orderBy(asc(planItems.position))
    : [];
  return days.map((day) => ({ ...day, items: items.filter((item) => item.planDayId === day.id) }));
}

export async function findPlan(db: Db, userId: string, planId: string) {
  const [plan] = await db
    .select()
    .from(weeklyPlans)
    .where(and(eq(weeklyPlans.userId, userId), eq(weeklyPlans.id, planId)));
  return plan ?? null;
}

export async function planForCycle(db: Db, userId: string, cycleStart: string) {
  const rows = await db
    .select()
    .from(weeklyPlans)
    .where(
      and(
        eq(weeklyPlans.userId, userId),
        eq(weeklyPlans.cycleStart, cycleStart),
        inArray(weeklyPlans.status, ["draft", "active"]),
      ),
    );
  return {
    draft: rows.find((row) => row.status === "draft") ?? null,
    active: rows.find((row) => row.status === "active") ?? null,
  };
}

export async function activePlanDay(db: Db, userId: string, date: string) {
  const [row] = await db
    .select({ day: planDays, plan: weeklyPlans })
    .from(planDays)
    .innerJoin(weeklyPlans, eq(weeklyPlans.id, planDays.planId))
    .where(
      and(eq(planDays.userId, userId), eq(planDays.date, date), eq(weeklyPlans.status, "active")),
    )
    .limit(1);
  if (!row) return null;
  const items = await db
    .select({
      id: planItems.id,
      position: planItems.position,
      topicId: planItems.topicId,
      label: planItems.label,
      minutes: planItems.minutes,
      title: topics.title,
      targetBpm: topics.targetBpm,
    })
    .from(planItems)
    .leftJoin(topics, eq(topics.id, planItems.topicId))
    .where(eq(planItems.planDayId, row.day.id))
    .orderBy(asc(planItems.position));
  return { ...row, items };
}

export type PlanRow = typeof weeklyPlans.$inferSelect;

export async function planView(db: Db, userId: string, plan: PlanRow, today: string) {
  const [days, totals, practiced] = await Promise.all([
    planDaysWithItems(db, plan.id),
    dayTotals(db as Database, userId),
    practicedTopicsByDate(db, userId, plan.cycleStart, plan.cycleEnd),
  ]);
  return {
    id: plan.id,
    cycleStart: plan.cycleStart,
    cycleEnd: plan.cycleEnd,
    status: plan.status,
    ended: plan.cycleEnd < today,
    weekNote: plan.weekNote,
    source: plan.source,
    llmStatus: plan.llmStatus,
    llmError: plan.llmError,
    days: days.map((day) => ({
      id: day.id,
      date: day.date,
      targetMinutes: day.targetMinutes,
      focusNote: day.focusNote,
      past: day.date < today,
      today: day.date === today,
      minutesPracticed: Math.floor((totals.get(day.date)?.seconds ?? 0) / 60),
      items: day.items.map((item) => ({
        id: item.id,
        topicId: item.topicId,
        label: item.label,
        title: item.title ?? item.label ?? "",
        targetBpm: item.targetBpm ?? null,
        minutes: item.minutes,
        practiced: item.topicId ? (practiced.get(day.date)?.has(item.topicId) ?? false) : false,
      })),
    })),
  };
}
