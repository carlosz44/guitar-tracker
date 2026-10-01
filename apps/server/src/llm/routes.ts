import { llmErrors, startDraftSchema } from "@ds/shared";
import { Hono } from "hono";
import type { SessionVariables } from "../auth/require-session";
import { idParam, validate } from "../http/validate";
import { findLesson } from "../lessons/queries";
import { DraftConflict, type DraftDeps, draftView, findDraft, startDraft } from "./drafts";
import { userTimezone } from "./run";
import { LlmUnavailable, monthUsage } from "./usage";

export interface LlmRouteDeps extends DraftDeps {
  defaultTimezone: string;
}

export function startFailure(error: unknown) {
  if (error instanceof LlmUnavailable) {
    return error.key === llmErrors.disabled
      ? ({ body: { error: error.key }, status: 503 } as const)
      : ({ body: { error: error.key }, status: 409 } as const);
  }
  if (error instanceof DraftConflict) return { body: { error: error.key }, status: 409 } as const;
  throw error;
}

export function createLlmRoutes(deps: LlmRouteDeps) {
  const { db } = deps;
  const timeZone = (userId: string) => userTimezone(db, userId, deps.defaultTimezone);

  return new Hono<{ Variables: SessionVariables }>()
    .post("/lessons/:id/enrich", idParam, validate("json", startDraftSchema), async (c) => {
      const userId = c.get("user").id;
      const lesson = await findLesson(db, userId, c.req.valid("param").id);
      if (!lesson) return c.json({ error: "not_found" as const }, 404);
      try {
        const draft = await db.transaction(async (tx) =>
          startDraft(
            deps,
            {
              userId,
              timeZone: await timeZone(userId),
              kind: "lesson_enrichment",
              subject: { type: "lesson", id: lesson.id },
              instruction: c.req.valid("json").instruction,
            },
            tx,
          ),
        );
        await draft.send();
        return c.json({ draftId: draft.id }, 202);
      } catch (error) {
        const failure = startFailure(error);
        return c.json(failure.body, failure.status);
      }
    })
    .get("/drafts/:id", idParam, async (c) => {
      const draft = await findDraft(db, c.get("user").id, c.req.valid("param").id);
      if (!draft) return c.json({ error: "not_found" as const }, 404);
      return c.json({ draft: await draftView(db, draft) }, 200);
    })
    .get("/llm/usage", async (c) => {
      const userId = c.get("user").id;
      const usage = await monthUsage(db, userId, await timeZone(userId), deps.clock.now());
      return c.json(
        {
          enabled: deps.llm.enabled,
          monthSpendUsd: usage.spendUsd,
          monthCalls: usage.calls,
          budgetUsd: deps.llm.budgetUsd,
        },
        200,
      );
    });
}
