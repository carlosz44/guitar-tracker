import { and, asc, desc, eq, type SQL } from "drizzle-orm";
import type { Database } from "../db/client";
import { lessons, lessonTopics, teacherQuestions, topics } from "../db/schema";
import { EMPTY_STATS, topicStats } from "../practice/queries";

type TopicRow = typeof topics.$inferSelect;

export function toTopic(row: TopicRow) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category,
    status: row.status,
    priority: row.priority,
    practicePoints: row.practicePoints,
    successCriteria: row.successCriteria,
    targetBpm: row.targetBpm,
    defaultBlockMinutes: row.defaultBlockMinutes,
    parentId: row.parentId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function findTopic(db: Database, userId: string, id: string) {
  const [row] = await db
    .select()
    .from(topics)
    .where(and(eq(topics.userId, userId), eq(topics.id, id)));
  return row;
}

export async function listTopics(
  db: Database,
  userId: string,
  filters: { status?: TopicRow["status"]; category?: TopicRow["category"] },
) {
  const conditions: SQL[] = [eq(topics.userId, userId)];
  if (filters.status) conditions.push(eq(topics.status, filters.status));
  if (filters.category) conditions.push(eq(topics.category, filters.category));
  const rows = await db
    .select()
    .from(topics)
    .where(and(...conditions))
    .orderBy(desc(topics.priority), asc(topics.title));
  const stats = await topicStats(db, userId);
  const titles = new Map(
    (
      await db
        .select({ id: topics.id, title: topics.title })
        .from(topics)
        .where(eq(topics.userId, userId))
    ).map((topic) => [topic.id, topic.title]),
  );
  return rows.map((row) => ({
    ...toTopic(row),
    parent: row.parentId ? { id: row.parentId, title: titles.get(row.parentId) ?? "" } : null,
    stats: stats.get(row.id) ?? EMPTY_STATS,
  }));
}

export async function parentMap(db: Database, userId: string) {
  const rows = await db
    .select({ id: topics.id, parentId: topics.parentId })
    .from(topics)
    .where(eq(topics.userId, userId));
  return new Map(rows.map((row) => [row.id, row.parentId]));
}

export async function topicRelations(db: Database, userId: string, topic: TopicRow) {
  const [parent, children, linkedLessons, questions, stats] = await Promise.all([
    topic.parentId ? findTopic(db, userId, topic.parentId) : undefined,
    db
      .select({ id: topics.id, title: topics.title, status: topics.status })
      .from(topics)
      .where(and(eq(topics.userId, userId), eq(topics.parentId, topic.id)))
      .orderBy(asc(topics.title)),
    db
      .select({
        id: lessons.id,
        date: lessons.date,
        title: lessons.title,
        relation: lessonTopics.relation,
      })
      .from(lessonTopics)
      .innerJoin(lessons, eq(lessons.id, lessonTopics.lessonId))
      .where(and(eq(lessonTopics.userId, userId), eq(lessonTopics.topicId, topic.id)))
      .orderBy(desc(lessons.date)),
    db
      .select({ id: teacherQuestions.id, text: teacherQuestions.text })
      .from(teacherQuestions)
      .where(
        and(
          eq(teacherQuestions.userId, userId),
          eq(teacherQuestions.topicId, topic.id),
          eq(teacherQuestions.status, "open"),
        ),
      )
      .orderBy(asc(teacherQuestions.createdAt)),
    topicStats(db, userId),
  ]);
  return {
    parent: parent ? { id: parent.id, title: parent.title } : null,
    children,
    lessons: linkedLessons,
    openQuestions: questions,
    stats: stats.get(topic.id) ?? EMPTY_STATS,
  };
}
