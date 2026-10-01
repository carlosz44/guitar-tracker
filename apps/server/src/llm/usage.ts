import { type LlmFeature, type LlmSubject, llmErrors } from "@ds/shared";
import { and, eq, sql } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import type { Database, Tx } from "../db/client";
import { llmRuns } from "../db/schema";
import { costUsd, type TokenUsage } from "./pricing";

export interface LlmSettings {
  enabled: boolean;
  model: string;
  budgetUsd: number;
}

export class LlmUnavailable extends Error {
  constructor(readonly key: typeof llmErrors.disabled | typeof llmErrors.budget) {
    super(key);
  }
}

export async function recordRun(
  db: Database,
  run: {
    userId: string;
    feature: LlmFeature;
    model: string;
    usage?: TokenUsage;
    latencyMs: number;
    error?: string;
    subject?: { type: LlmSubject; id: string };
  },
) {
  const id = uuidv7();
  await db.insert(llmRuns).values({
    id,
    userId: run.userId,
    feature: run.feature,
    model: run.model,
    inputTokens: run.usage?.inputTokens ?? 0,
    outputTokens: run.usage?.outputTokens ?? 0,
    cacheReadTokens: run.usage?.cacheReadTokens ?? 0,
    costUsd: run.usage ? costUsd(run.model, run.usage) : 0,
    latencyMs: run.latencyMs,
    status: run.error ? "error" : "ok",
    error: run.error ?? null,
    subjectType: run.subject?.type ?? null,
    subjectId: run.subject?.id ?? null,
  });
  return id;
}

export async function monthUsage(db: Database | Tx, userId: string, timeZone: string, now: Date) {
  const [row] = await db
    .select({
      spend: sql<string>`coalesce(sum(${llmRuns.costUsd}), 0)`,
      calls: sql<number>`count(*)::int`,
    })
    .from(llmRuns)
    .where(
      and(
        eq(llmRuns.userId, userId),
        sql`date_trunc('month', ${llmRuns.createdAt} AT TIME ZONE ${timeZone}) = date_trunc('month', ${now.toISOString()}::timestamptz AT TIME ZONE ${timeZone})`,
      ),
    );
  return { spendUsd: Number(row?.spend ?? 0), calls: row?.calls ?? 0 };
}

export async function assertCanCall(
  db: Database | Tx,
  settings: LlmSettings,
  context: { userId: string; timeZone: string; now: Date },
) {
  if (!settings.enabled) throw new LlmUnavailable(llmErrors.disabled);
  const { spendUsd } = await monthUsage(db, context.userId, context.timeZone, context.now);
  if (spendUsd >= settings.budgetUsd) throw new LlmUnavailable(llmErrors.budget);
}
