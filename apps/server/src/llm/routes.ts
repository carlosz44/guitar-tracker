import {
  type DraftSection,
  LESSON_DRAFT_SECTIONS,
  llmErrors,
  sectionActionSchema,
  startDraftSchema,
  TOPIC_DRAFT_SECTIONS,
} from "@ds/shared";
import { zValidator } from "@hono/zod-validator";
import { type Context, Hono } from "hono";
import { z } from "zod";
import type { SessionVariables } from "../auth/require-session";
import { idParam, validate } from "../http/validate";
import { findLesson } from "../lessons/queries";
import { findTopic } from "../topics/queries";
import { DraftConflict, type DraftDeps, draftView, findDraft, startDraft } from "./drafts";
import { acceptAll, discardDraft, InvalidSection, ReviewError, reviewSection } from "./review";
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

const DRAFT_SECTIONS = [...new Set([...LESSON_DRAFT_SECTIONS, ...TOPIC_DRAFT_SECTIONS])] as [
  DraftSection,
  ...DraftSection[],
];
const sectionParam = zValidator(
  "param",
  z.object({ id: z.uuid(), section: z.enum(DRAFT_SECTIONS) }),
  (result, c) => {
    if (!result.success) return c.json({ error: "not_found" as const }, 404);
  },
);
const acceptAllSchema = z.strictObject({
  values: z.partialRecord(z.enum(DRAFT_SECTIONS), z.unknown()).default({}),
});

export function createLlmRoutes(deps: LlmRouteDeps) {
  const { db } = deps;

  async function reviewed(
    c: Context<{ Variables: SessionVariables }>,
    userId: string,
    run: () => Promise<string | null>,
  ) {
    try {
      const id = await run();
      const draft = id ? await findDraft(db, userId, id) : null;
      if (!draft) return c.json({ error: "not_found" as const }, 404);
      return c.json({ draft: await draftView(db, draft) }, 200);
    } catch (error) {
      if (error instanceof ReviewError) return c.json({ error: error.key }, 409);
      if (error instanceof InvalidSection) {
        return c.json({ error: "invalid" as const, issues: error.issues }, 400);
      }
      throw error;
    }
  }
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
    .post("/topics/:id/improve", idParam, async (c) => {
      const userId = c.get("user").id;
      const topic = await findTopic(db, userId, c.req.valid("param").id);
      if (!topic) return c.json({ error: "not_found" as const }, 404);
      try {
        const draft = await db.transaction(async (tx) =>
          startDraft(
            deps,
            {
              userId,
              timeZone: await timeZone(userId),
              kind: "topic_improve",
              subject: { type: "topic", id: topic.id },
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
    .post(
      "/drafts/:id/sections/:section",
      sectionParam,
      validate("json", sectionActionSchema),
      async (c) => {
        const userId = c.get("user").id;
        const { id, section } = c.req.valid("param");
        return reviewed(c, userId, () =>
          reviewSection(db, userId, id, { section, ...c.req.valid("json") }),
        );
      },
    )
    .post("/drafts/:id/accept-all", idParam, validate("json", acceptAllSchema), async (c) => {
      const userId = c.get("user").id;
      return reviewed(c, userId, () =>
        acceptAll(db, userId, c.req.valid("param").id, c.req.valid("json").values),
      );
    })
    .post("/drafts/:id/discard", idParam, async (c) => {
      const userId = c.get("user").id;
      return reviewed(c, userId, () => discardDraft(db, userId, c.req.valid("param").id));
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
