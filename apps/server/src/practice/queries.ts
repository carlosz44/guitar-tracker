import { and, count, desc, eq, sql } from "drizzle-orm";
import type { Database } from "../db/client";
import {
  lessons,
  lessonTopics,
  practiceDays,
  practiceSessions,
  sessionBlocks,
  teacherQuestions,
  topics,
} from "../db/schema";
import type { DayTotal } from "./rules";

export async function dayTotals(db: Database, userId: string) {
  const rows = await db
    .select({
      date: practiceSessions.practiceDate,
      seconds: sql<number>`coalesce(sum(${sessionBlocks.actualSeconds}), 0)::int`,
      targetMinutes: practiceDays.targetMinutes,
    })
    .from(practiceSessions)
    .leftJoin(sessionBlocks, eq(sessionBlocks.sessionId, practiceSessions.id))
    .leftJoin(
      practiceDays,
      and(
        eq(practiceDays.userId, practiceSessions.userId),
        eq(practiceDays.date, practiceSessions.practiceDate),
      ),
    )
    .where(eq(practiceSessions.userId, userId))
    .groupBy(practiceSessions.practiceDate, practiceDays.targetMinutes);
  return new Map<string, DayTotal>(
    rows.map((row) => [row.date, { seconds: row.seconds, targetMinutes: row.targetMinutes }]),
  );
}

export interface TopicStats {
  lastPracticedAt: string | null;
  lastPracticedDate: string | null;
  latestCleanBpm: number | null;
  bestCleanBpm: number | null;
  totalSeconds: number;
}

export async function topicStats(db: Database, userId: string) {
  const result = await db.execute<{
    topic_id: string;
    last_practiced_at: Date | string | null;
    last_practiced_date: string | null;
    latest_clean_bpm: number | null;
    best_clean_bpm: number | null;
    total_seconds: number;
  }>(sql`
    SELECT b.topic_id,
           max(b.ended_at) AS last_practiced_at,
           max(s.practice_date)::text AS last_practiced_date,
           (SELECT b2.clean_bpm FROM ${sessionBlocks} b2
             WHERE b2.topic_id = b.topic_id AND b2.user_id = ${userId} AND b2.clean_bpm IS NOT NULL
             ORDER BY b2.ended_at DESC NULLS LAST, b2.created_at DESC LIMIT 1) AS latest_clean_bpm,
           max(b.clean_bpm) AS best_clean_bpm,
           coalesce(sum(b.actual_seconds), 0)::int AS total_seconds
      FROM ${sessionBlocks} b
      JOIN ${practiceSessions} s ON s.id = b.session_id
     WHERE b.user_id = ${userId} AND b.topic_id IS NOT NULL AND b.actual_seconds IS NOT NULL
     GROUP BY b.topic_id`);
  return new Map<string, TopicStats>(
    result.rows.map((row) => [
      row.topic_id,
      {
        lastPracticedAt: row.last_practiced_at
          ? new Date(row.last_practiced_at).toISOString()
          : null,
        lastPracticedDate: row.last_practiced_date,
        latestCleanBpm: row.latest_clean_bpm,
        bestCleanBpm: row.best_clean_bpm,
        totalSeconds: row.total_seconds,
      },
    ]),
  );
}

export const EMPTY_STATS: TopicStats = {
  lastPracticedAt: null,
  lastPracticedDate: null,
  latestCleanBpm: null,
  bestCleanBpm: null,
  totalSeconds: 0,
};

export async function latestLessonWithTopics(db: Database, userId: string) {
  const [lesson] = await db
    .select({ id: lessons.id, title: lessons.title, date: lessons.date, status: lessons.status })
    .from(lessons)
    .where(eq(lessons.userId, userId))
    .orderBy(desc(lessons.date), desc(lessons.createdAt))
    .limit(1);
  if (!lesson) return null;
  const links = await db
    .select({ topicId: lessonTopics.topicId })
    .from(lessonTopics)
    .where(and(eq(lessonTopics.userId, userId), eq(lessonTopics.lessonId, lesson.id)));
  return { ...lesson, topicIds: links.map((link) => link.topicId) };
}

export async function openQuestionsCount(db: Database, userId: string) {
  const [row] = await db
    .select({ n: count() })
    .from(teacherQuestions)
    .where(and(eq(teacherQuestions.userId, userId), eq(teacherQuestions.status, "open")));
  return row?.n ?? 0;
}

export async function activeSessionId(db: Database, userId: string) {
  const [row] = await db
    .select({ id: practiceSessions.id })
    .from(practiceSessions)
    .where(and(eq(practiceSessions.userId, userId), eq(practiceSessions.status, "in_progress")));
  return row?.id ?? null;
}

export async function topicsWithStats(db: Database, userId: string) {
  const [rows, stats] = await Promise.all([
    db.select().from(topics).where(eq(topics.userId, userId)),
    topicStats(db, userId),
  ]);
  return rows.map((topic) => ({ ...topic, stats: stats.get(topic.id) ?? EMPTY_STATS }));
}
