import {
  DRAFT_KINDS,
  DRAFT_STATUSES,
  DRAFT_SUBJECTS,
  type DraftReview,
  LLM_FEATURES,
  LLM_RUN_STATUSES,
  type LlmSubject,
  type SkippedFile,
} from "@ds/shared";
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { timestamps } from "./columns";

const inList = (values: readonly string[]) =>
  sql.raw(values.map((value) => `'${value}'`).join(", "));

export const llmRuns = pgTable(
  "llm_runs",
  {
    id: uuid().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    feature: text().$type<(typeof LLM_FEATURES)[number]>().notNull(),
    model: text().notNull(),
    inputTokens: integer().notNull().default(0),
    outputTokens: integer().notNull().default(0),
    cacheReadTokens: integer().notNull().default(0),
    costUsd: numeric({ precision: 10, scale: 6, mode: "number" }).notNull().default(0),
    latencyMs: integer().notNull().default(0),
    status: text().$type<(typeof LLM_RUN_STATUSES)[number]>().notNull(),
    error: text(),
    subjectType: text().$type<LlmSubject>(),
    subjectId: uuid(),
    ...timestamps,
  },
  (table) => [
    check("llm_runs_feature_check", sql`${table.feature} IN (${inList(LLM_FEATURES)})`),
    check("llm_runs_status_check", sql`${table.status} IN (${inList(LLM_RUN_STATUSES)})`),
    index().on(table.userId, table.createdAt),
  ],
);

export const llmDrafts = pgTable(
  "llm_drafts",
  {
    id: uuid().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: text().$type<(typeof DRAFT_KINDS)[number]>().notNull(),
    subjectType: text().$type<(typeof DRAFT_SUBJECTS)[number]>().notNull(),
    subjectId: uuid().notNull(),
    payload: jsonb().$type<unknown>(),
    review: jsonb().$type<DraftReview>().notNull().default({}),
    instruction: text().notNull().default(""),
    skippedFiles: jsonb().$type<SkippedFile[]>().notNull().default([]),
    status: text().$type<(typeof DRAFT_STATUSES)[number]>().notNull().default("queued"),
    error: text(),
    llmRunId: uuid().references(() => llmRuns.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (table) => [
    check("llm_drafts_kind_check", sql`${table.kind} IN (${inList(DRAFT_KINDS)})`),
    check("llm_drafts_subject_check", sql`${table.subjectType} IN (${inList(DRAFT_SUBJECTS)})`),
    check("llm_drafts_status_check", sql`${table.status} IN (${inList(DRAFT_STATUSES)})`),
    index().on(table.subjectType, table.subjectId, table.createdAt.desc()),
    uniqueIndex("llm_drafts_one_active")
      .on(table.userId, table.subjectType, table.subjectId)
      .where(sql`${table.status} IN ('queued', 'running', 'pending')`),
  ],
);
