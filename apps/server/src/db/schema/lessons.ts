import {
  EXTRACTION_STATUSES,
  FILE_KINDS,
  LESSON_RELATIONS,
  LESSON_SOURCES,
  LESSON_STATUSES,
} from "@ds/shared";
import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  date,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { timestamps } from "./columns";
import { topics } from "./topics";

const inList = (values: readonly string[]) =>
  sql.raw(values.map((value) => `'${value}'`).join(", "));

export const lessons = pgTable(
  "lessons",
  {
    id: uuid().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    date: date({ mode: "string" }).notNull(),
    title: text().notNull(),
    rawNotes: text().notNull().default(""),
    summary: text().notNull().default(""),
    practicePoints: text().array().notNull().default([]),
    homework: text().notNull().default(""),
    status: text().$type<(typeof LESSON_STATUSES)[number]>().notNull().default("final"),
    source: text().$type<(typeof LESSON_SOURCES)[number]>().notNull().default("web"),
    ...timestamps,
  },
  (table) => [
    check("lessons_status_check", sql`${table.status} IN (${inList(LESSON_STATUSES)})`),
    check("lessons_source_check", sql`${table.source} IN (${inList(LESSON_SOURCES)})`),
    index().on(table.userId, table.date.desc()),
  ],
);

export const lessonFiles = pgTable(
  "lesson_files",
  {
    id: uuid().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    lessonId: uuid()
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    kind: text().$type<(typeof FILE_KINDS)[number]>().notNull(),
    originalName: text().notNull(),
    mime: text().notNull(),
    sizeBytes: bigint({ mode: "number" }).notNull(),
    r2Key: text().notNull().unique(),
    sha256: text(),
    uploadStatus: text().$type<"uploading" | "uploaded">().notNull().default("uploading"),
    extractionStatus: text()
      .$type<(typeof EXTRACTION_STATUSES)[number]>()
      .notNull()
      .default("pending"),
    extractionError: text(),
    extractedText: text(),
    meta: jsonb().$type<Record<string, unknown>>(),
    ...timestamps,
  },
  (table) => [
    check("lesson_files_kind_check", sql`${table.kind} IN (${inList(FILE_KINDS)})`),
    check(
      "lesson_files_upload_status_check",
      sql`${table.uploadStatus} IN ('uploading', 'uploaded')`,
    ),
    check(
      "lesson_files_extraction_status_check",
      sql`${table.extractionStatus} IN (${inList(EXTRACTION_STATUSES)})`,
    ),
    index().on(table.lessonId),
    index().on(table.uploadStatus, table.createdAt),
  ],
);

export const lessonTopics = pgTable(
  "lesson_topics",
  {
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    lessonId: uuid()
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    topicId: uuid()
      .notNull()
      .references(() => topics.id, { onDelete: "no action" }),
    relation: text().$type<(typeof LESSON_RELATIONS)[number]>().notNull(),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.lessonId, table.topicId] }),
    check("lesson_topics_relation_check", sql`${table.relation} IN (${inList(LESSON_RELATIONS)})`),
    index().on(table.topicId),
  ],
);
