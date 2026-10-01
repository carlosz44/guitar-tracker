import { PLAN_LLM_STATUSES, PLAN_SOURCES, PLAN_STATUSES } from "@ds/shared";
import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  pgTable,
  smallint,
  text,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { timestamps } from "./columns";
import { llmRuns } from "./llm";
import { topics } from "./topics";

const inList = (values: readonly string[]) =>
  sql.raw(values.map((value) => `'${value}'`).join(", "));

export const weeklyPlans = pgTable(
  "weekly_plans",
  {
    id: uuid().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    cycleStart: date({ mode: "string" }).notNull(),
    cycleEnd: date({ mode: "string" }).notNull(),
    status: text().$type<(typeof PLAN_STATUSES)[number]>().notNull().default("draft"),
    weekNote: text().notNull().default(""),
    rationale: text().notNull().default(""),
    source: text().$type<(typeof PLAN_SOURCES)[number]>().notNull().default("rules"),
    llmStatus: text().$type<(typeof PLAN_LLM_STATUSES)[number]>().notNull().default("skipped"),
    llmError: text(),
    llmRunId: uuid().references(() => llmRuns.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (table) => [
    check("weekly_plans_status_check", sql`${table.status} IN (${inList(PLAN_STATUSES)})`),
    check("weekly_plans_source_check", sql`${table.source} IN (${inList(PLAN_SOURCES)})`),
    check(
      "weekly_plans_llm_status_check",
      sql`${table.llmStatus} IN (${inList(PLAN_LLM_STATUSES)})`,
    ),
    check("weekly_plans_cycle_check", sql`${table.cycleEnd} >= ${table.cycleStart}`),
    uniqueIndex("weekly_plans_one_draft")
      .on(table.userId, table.cycleStart)
      .where(sql`${table.status} = 'draft'`),
    uniqueIndex("weekly_plans_one_active")
      .on(table.userId, table.cycleStart)
      .where(sql`${table.status} = 'active'`),
  ],
);

export const planDays = pgTable(
  "plan_days",
  {
    id: uuid().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    planId: uuid()
      .notNull()
      .references(() => weeklyPlans.id, { onDelete: "cascade" }),
    date: date({ mode: "string" }).notNull(),
    targetMinutes: smallint().notNull(),
    focusNote: text().notNull().default(""),
    ...timestamps,
  },
  (table) => [
    unique().on(table.planId, table.date),
    check("plan_days_target_check", sql`${table.targetMinutes} BETWEEN 10 AND 240`),
  ],
);

export const planItems = pgTable(
  "plan_items",
  {
    id: uuid().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    planDayId: uuid()
      .notNull()
      .references(() => planDays.id, { onDelete: "cascade" }),
    position: smallint().notNull(),
    topicId: uuid().references(() => topics.id, { onDelete: "cascade" }),
    label: text(),
    minutes: smallint().notNull(),
    ...timestamps,
  },
  (table) => [
    unique().on(table.planDayId, table.position),
    index().on(table.topicId),
    check(
      "plan_items_topic_or_label_check",
      sql`${table.topicId} IS NOT NULL OR ${table.label} IS NOT NULL`,
    ),
    check("plan_items_minutes_check", sql`${table.minutes} >= 5 AND ${table.minutes} % 5 = 0`),
  ],
);
