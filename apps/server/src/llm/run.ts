import type { DraftReview, DraftSubject, LlmFeature, SkippedFile } from "@ds/shared";
import { and, eq } from "drizzle-orm";
import type { Clock } from "../clock";
import type { Database } from "../db/client";
import { llmDrafts, userSettings } from "../db/schema";
import type { Logger } from "../logger";
import type { ObjectStorage } from "../storage/r2";
import { LlmCallError, type LlmClient, type LlmRequest } from "./client";
import { assertCanCall, type LlmSettings, LlmUnavailable, recordRun } from "./usage";

export interface LlmJobDeps {
  db: Database;
  storage: ObjectStorage;
  logger: Logger;
  clock: Clock;
  llm: LlmClient | null;
  settings: LlmSettings;
  defaultTimezone: string;
}

export type Draft = typeof llmDrafts.$inferSelect;

export async function claimDraft(db: Database, draftId: string) {
  const [draft] = await db
    .update(llmDrafts)
    .set({ status: "running" })
    .where(and(eq(llmDrafts.id, draftId), eq(llmDrafts.status, "queued")))
    .returning();
  return draft ?? null;
}

export async function finishDraft(
  db: Database,
  draftId: string,
  values:
    | {
        status: "pending";
        payload: unknown;
        review: DraftReview;
        skippedFiles: SkippedFile[];
        llmRunId: string;
      }
    | { status: "failed"; error: string; llmRunId?: string; skippedFiles?: SkippedFile[] }
    | { status: "discarded" },
) {
  await db
    .update(llmDrafts)
    .set(values)
    .where(and(eq(llmDrafts.id, draftId), eq(llmDrafts.status, "running")));
}

export async function userTimezone(db: Database, userId: string, fallback: string) {
  const [row] = await db
    .select({ timezone: userSettings.timezone })
    .from(userSettings)
    .where(eq(userSettings.userId, userId));
  return row?.timezone ?? fallback;
}

export type GenerateResult<T> =
  | { ok: true; payload: T; runId: string }
  | { ok: false; error: string; runId?: string };

export async function generate<T>(
  deps: LlmJobDeps,
  context: { userId: string; feature: LlmFeature; subject: { type: DraftSubject; id: string } },
  request: Omit<LlmRequest, "model">,
  toPayload: (output: unknown) => T | null,
): Promise<GenerateResult<T>> {
  const timeZone = await userTimezone(deps.db, context.userId, deps.defaultTimezone);
  try {
    await assertCanCall(deps.db, deps.settings, {
      userId: context.userId,
      timeZone,
      now: deps.clock.now(),
    });
  } catch (error) {
    if (error instanceof LlmUnavailable) return { ok: false, error: error.key };
    throw error;
  }
  const llm = deps.llm;
  if (!llm) return { ok: false, error: "llm.disabled" };

  let runId: string | undefined;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const started = performance.now();
    try {
      const response = await llm.complete({ ...request, model: deps.settings.model });
      runId = await recordRun(deps.db, {
        ...context,
        model: deps.settings.model,
        usage: response.usage,
        latencyMs: response.latencyMs,
      });
      const payload = toPayload(response.output);
      deps.logger.info(
        {
          feature: context.feature,
          subjectId: context.subject.id,
          attempt,
          inputTokens: response.usage.inputTokens,
          outputTokens: response.usage.outputTokens,
          latencyMs: response.latencyMs,
          valid: payload !== null,
        },
        "llm call",
      );
      if (payload !== null) return { ok: true, payload, runId };
    } catch (error) {
      if (!(error instanceof LlmCallError)) throw error;
      runId = await recordRun(deps.db, {
        ...context,
        model: deps.settings.model,
        latencyMs: Math.round(performance.now() - started),
        error: error.code,
      });
      deps.logger.warn(
        { feature: context.feature, subjectId: context.subject.id, error: error.code },
        "llm call failed",
      );
      return { ok: false, error: error.code, runId };
    }
  }
  return { ok: false, error: "invalid_output", runId };
}
