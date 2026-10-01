import { QUESTION_STATUSES, TOPIC_CATEGORIES, TOPIC_STATUSES } from "@ds/shared";
import { sql } from "drizzle-orm";
import { type AnyPgColumn, check, index, pgTable, smallint, text, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { timestamps } from "./columns";
import { lessons } from "./lessons";

const inList = (values: readonly string[]) =>
  sql.raw(values.map((value) => `'${value}'`).join(", "));

export const topics = pgTable(
  "topics",
  {
    id: uuid().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text().notNull(),
    description: text().notNull().default(""),
    category: text().$type<(typeof TOPIC_CATEGORIES)[number]>().notNull(),
    parentId: uuid().references((): AnyPgColumn => topics.id, { onDelete: "set null" }),
    status: text().$type<(typeof TOPIC_STATUSES)[number]>().notNull().default("new"),
    priority: smallint().notNull().default(2),
    practicePoints: text().array().notNull().default([]),
    successCriteria: text().notNull().default(""),
    targetBpm: smallint(),
    defaultBlockMinutes: smallint().notNull().default(10),
    ...timestamps,
  },
  (table) => [
    check("topics_category_check", sql`${table.category} IN (${inList(TOPIC_CATEGORIES)})`),
    check("topics_status_check", sql`${table.status} IN (${inList(TOPIC_STATUSES)})`),
    check("topics_priority_check", sql`${table.priority} BETWEEN 1 AND 3`),
    check("topics_target_bpm_check", sql`${table.targetBpm} BETWEEN 20 AND 400`),
    check("topics_default_block_minutes_check", sql`${table.defaultBlockMinutes} BETWEEN 5 AND 60`),
    check("topics_parent_not_self_check", sql`${table.parentId} <> ${table.id}`),
    index().on(table.userId, table.status),
    index().on(table.parentId),
  ],
);

export const teacherQuestions = pgTable(
  "teacher_questions",
  {
    id: uuid().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    text: text().notNull(),
    topicId: uuid().references(() => topics.id, { onDelete: "set null" }),
    status: text().$type<(typeof QUESTION_STATUSES)[number]>().notNull().default("open"),
    answer: text(),
    answeredInLessonId: uuid().references((): AnyPgColumn => lessons.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (table) => [
    check("teacher_questions_status_check", sql`${table.status} IN (${inList(QUESTION_STATUSES)})`),
    index().on(table.userId, table.status),
  ],
);
