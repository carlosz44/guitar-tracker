import { SESSION_SOURCES, SESSION_STATUSES } from "@ds/shared";
import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { instant, timestamps } from "./columns";
import { topics } from "./topics";

const inList = (values: readonly string[]) =>
  sql.raw(values.map((value) => `'${value}'`).join(", "));

export const practiceSessions = pgTable(
  "practice_sessions",
  {
    id: uuid().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    startedAt: instant().notNull(),
    endedAt: instant(),
    pausedAt: instant(),
    pausedSeconds: integer().notNull().default(0),
    lastActivityAt: instant().notNull(),
    status: text().$type<(typeof SESSION_STATUSES)[number]>().notNull().default("in_progress"),
    source: text().$type<(typeof SESSION_SOURCES)[number]>().notNull().default("timer"),
    notes: text().notNull().default(""),
    planDayId: uuid(),
    practiceDate: date({ mode: "string" }).notNull(),
    ...timestamps,
  },
  (table) => [
    check("practice_sessions_status_check", sql`${table.status} IN (${inList(SESSION_STATUSES)})`),
    check("practice_sessions_source_check", sql`${table.source} IN (${inList(SESSION_SOURCES)})`),
    check("practice_sessions_paused_seconds_check", sql`${table.pausedSeconds} >= 0`),
    index().on(table.userId, table.practiceDate.desc()),
    uniqueIndex("practice_sessions_one_in_progress")
      .on(table.userId)
      .where(sql`${table.status} = 'in_progress'`),
    index().on(table.status, table.lastActivityAt),
  ],
);

export const sessionBlocks = pgTable(
  "session_blocks",
  {
    id: uuid().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    sessionId: uuid()
      .notNull()
      .references(() => practiceSessions.id, { onDelete: "cascade" }),
    position: smallint().notNull(),
    topicId: uuid().references(() => topics.id, { onDelete: "no action" }),
    label: text(),
    plannedSeconds: integer().notNull(),
    startedAt: instant(),
    endedAt: instant(),
    pausedSeconds: integer().notNull().default(0),
    actualSeconds: integer(),
    cleanBpm: smallint(),
    rating: smallint(),
    notes: text().notNull().default(""),
    ...timestamps,
  },
  (table) => [
    check(
      "session_blocks_topic_or_label_check",
      sql`${table.topicId} IS NOT NULL OR coalesce(${table.label}, '') <> ''`,
    ),
    check("session_blocks_rating_check", sql`${table.rating} BETWEEN 1 AND 5`),
    check("session_blocks_clean_bpm_check", sql`${table.cleanBpm} BETWEEN 20 AND 400`),
    check(
      "session_blocks_seconds_check",
      sql`${table.plannedSeconds} > 0 AND ${table.actualSeconds} >= 0`,
    ),
    uniqueIndex().on(table.sessionId, table.position),
    index().on(table.topicId, table.endedAt.desc()),
  ],
);

export const practiceDays = pgTable(
  "practice_days",
  {
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    date: date({ mode: "string" }).notNull(),
    targetMinutes: smallint().notNull(),
    ...timestamps,
  },
  (table) => [primaryKey({ columns: [table.userId, table.date] })],
);
