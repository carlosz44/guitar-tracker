import type { LessonEnrichmentOutput } from "@ds/shared";
import { uuidv7 } from "uuidv7";
import { fakeClock } from "../clock";
import type { Database } from "../db/client";
import { llmDrafts } from "../db/schema";
import type { LlmClient } from "../llm/client";
import type { LlmJobDeps } from "../llm/run";
import { silentLogger } from "./logger";
import { memoryStorage } from "./memory-storage";

export function llmDeps(db: Database, llm: LlmClient | null, overrides: Partial<LlmJobDeps> = {}) {
  return {
    db,
    storage: memoryStorage().storage,
    logger: silentLogger,
    clock: fakeClock("2026-10-01T20:00:00Z"),
    llm,
    settings: { enabled: llm !== null, model: "claude-sonnet-5-5", budgetUsd: 10 },
    defaultTimezone: "America/Lima",
    ...overrides,
  } satisfies LlmJobDeps;
}

export async function queueDraft(
  db: Database,
  userId: string,
  subject: { type: "lesson" | "topic"; id: string },
  values: Partial<typeof llmDrafts.$inferInsert> = {},
) {
  const [row] = await db
    .insert(llmDrafts)
    .values({
      id: uuidv7(),
      userId,
      kind: subject.type === "lesson" ? "lesson_enrichment" : "topic_improve",
      subjectType: subject.type,
      subjectId: subject.id,
      ...values,
    })
    .returning();
  if (!row) throw new Error("queue draft failed");
  return row;
}

export function enrichmentOutput(
  values: Partial<LessonEnrichmentOutput> = {},
): LessonEnrichmentOutput {
  return {
    title: "Modo dórico en tríadas",
    summary: "Vimos **tríadas** del modo dórico.",
    practicePoints: ["Tríadas en cuerdas 1–3", "Metrónomo a 80"],
    homework: "Grabar el riff a 90.",
    topics: [],
    answers: [],
    questions: [],
    ...values,
  };
}

export const newTopicOutput = (values: Partial<LessonEnrichmentOutput["topics"][number]> = {}) => ({
  ref: "n1",
  kind: "new" as const,
  existingTopicId: null,
  title: "Tríadas de dórico",
  category: "chords_arpeggios" as const,
  parentRef: null,
  description: "Tríadas sobre el modo dórico.",
  practicePoints: ["Cuerdas 1–3"],
  successCriteria: "Limpio a 90",
  targetBpm: 90,
  relation: "introduced" as const,
  ...values,
});
