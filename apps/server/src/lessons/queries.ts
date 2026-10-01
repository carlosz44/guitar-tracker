import type { LessonRelation } from "@ds/shared";
import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import type { Database } from "../db/client";
import { lessonFiles, lessons, lessonTopics, teacherQuestions, topics } from "../db/schema";

type LessonRow = typeof lessons.$inferSelect;
type FileRow = typeof lessonFiles.$inferSelect;

export function toLesson(row: LessonRow) {
  return {
    id: row.id,
    date: row.date,
    title: row.title,
    rawNotes: row.rawNotes,
    summary: row.summary,
    practicePoints: row.practicePoints,
    homework: row.homework,
    status: row.status,
    source: row.source,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toFile(row: FileRow, duplicateOf: string | null = null) {
  return {
    id: row.id,
    lessonId: row.lessonId,
    kind: row.kind,
    originalName: row.originalName,
    sizeBytes: row.sizeBytes,
    uploadStatus: row.uploadStatus,
    extractionStatus: row.extractionStatus,
    extractionError: row.extractionError,
    duplicateOf,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function findLesson(db: Database, userId: string, id: string) {
  const [row] = await db
    .select()
    .from(lessons)
    .where(and(eq(lessons.userId, userId), eq(lessons.id, id)));
  return row;
}

export async function listLessons(db: Database, userId: string) {
  const fileCount = db
    .select({ n: count() })
    .from(lessonFiles)
    .where(eq(lessonFiles.lessonId, lessons.id));
  const topicCount = db
    .select({ n: count() })
    .from(lessonTopics)
    .where(eq(lessonTopics.lessonId, lessons.id));
  return db
    .select({
      id: lessons.id,
      date: lessons.date,
      title: lessons.title,
      status: lessons.status,
      fileCount: sql<number>`(${fileCount})::int`,
      topicCount: sql<number>`(${topicCount})::int`,
    })
    .from(lessons)
    .where(eq(lessons.userId, userId))
    .orderBy(desc(lessons.date), desc(lessons.createdAt));
}

export async function latestLessonId(db: Database, userId: string) {
  const [row] = await db
    .select({ id: lessons.id })
    .from(lessons)
    .where(eq(lessons.userId, userId))
    .orderBy(desc(lessons.date), desc(lessons.createdAt))
    .limit(1);
  return row?.id ?? null;
}

export async function lessonFilesWithDuplicates(db: Database, userId: string, lessonId: string) {
  const rows = await db
    .select()
    .from(lessonFiles)
    .where(and(eq(lessonFiles.userId, userId), eq(lessonFiles.lessonId, lessonId)))
    .orderBy(asc(lessonFiles.createdAt));
  const firstBySha = new Map<string, FileRow>();
  return rows.map((row) => {
    const first = row.sha256 ? firstBySha.get(row.sha256) : undefined;
    if (row.sha256 && !first) firstBySha.set(row.sha256, row);
    return toFile(row, first?.originalName ?? null);
  });
}

export async function lessonTopicGroups(db: Database, userId: string, lessonId: string) {
  const rows = await db
    .select({
      relation: lessonTopics.relation,
      id: topics.id,
      title: topics.title,
      category: topics.category,
      status: topics.status,
    })
    .from(lessonTopics)
    .innerJoin(topics, eq(topics.id, lessonTopics.topicId))
    .where(and(eq(lessonTopics.userId, userId), eq(lessonTopics.lessonId, lessonId)))
    .orderBy(asc(topics.title));
  type LinkedTopic = { id: string; title: string; category: string; status: string };
  const groups: Record<LessonRelation, LinkedTopic[]> = {
    introduced: [],
    extended: [],
    reviewed: [],
  };
  for (const { relation, ...topic } of rows) groups[relation].push(topic);
  return groups;
}

export async function openQuestions(db: Database, userId: string) {
  return db
    .select({
      id: teacherQuestions.id,
      text: teacherQuestions.text,
      createdAt: teacherQuestions.createdAt,
      topicId: topics.id,
      topicTitle: topics.title,
    })
    .from(teacherQuestions)
    .leftJoin(topics, eq(topics.id, teacherQuestions.topicId))
    .where(and(eq(teacherQuestions.userId, userId), eq(teacherQuestions.status, "open")))
    .orderBy(asc(teacherQuestions.createdAt));
}
