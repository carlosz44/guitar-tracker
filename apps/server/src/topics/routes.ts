import {
  createTopicSchema,
  topicErrors,
  topicListQuerySchema,
  updateTopicSchema,
} from "@ds/shared";
import { and, count, eq } from "drizzle-orm";
import { Hono } from "hono";
import { uuidv7 } from "uuidv7";
import type { SessionVariables } from "../auth/require-session";
import type { Database } from "../db/client";
import { lessonTopics, sessionBlocks, topics } from "../db/schema";
import { idParam, validate } from "../http/validate";
import { deleteDrafts, latestDraft } from "../llm/drafts";
import { wouldCreateCycle } from "./cycle";
import { findTopic, listTopics, parentMap, topicRelations, toTopic } from "./queries";

function parentProblem(message: string) {
  return { error: "invalid" as const, issues: [{ path: ["parentId"], message }] };
}

export function createTopicRoutes(deps: { db: Database }) {
  const { db } = deps;

  return new Hono<{ Variables: SessionVariables }>()
    .get("/", validate("query", topicListQuerySchema), async (c) =>
      c.json({ topics: await listTopics(db, c.get("user").id, c.req.valid("query")) }, 200),
    )
    .post("/", validate("json", createTopicSchema), async (c) => {
      const userId = c.get("user").id;
      const input = c.req.valid("json");
      if (input.parentId && !(await findTopic(db, userId, input.parentId))) {
        return c.json(parentProblem(topicErrors.parent), 400);
      }
      const [row] = await db
        .insert(topics)
        .values({ id: uuidv7(), userId, ...input })
        .returning();
      if (!row) throw new Error("topic insert returned nothing");
      return c.json({ topic: toTopic(row) }, 201);
    })
    .get("/:id", idParam, async (c) => {
      const userId = c.get("user").id;
      const topic = await findTopic(db, userId, c.req.valid("param").id);
      if (!topic) return c.json({ error: "not_found" as const }, 404);
      const [relations, draft] = await Promise.all([
        topicRelations(db, userId, topic),
        latestDraft(db, userId, "topic", topic.id),
      ]);
      return c.json({ topic: toTopic(topic), draft, ...relations }, 200);
    })
    .patch("/:id", idParam, validate("json", updateTopicSchema), async (c) => {
      const userId = c.get("user").id;
      const id = c.req.valid("param").id;
      const input = c.req.valid("json");
      if (!(await findTopic(db, userId, id))) return c.json({ error: "not_found" as const }, 404);
      if (input.parentId) {
        if (!(await findTopic(db, userId, input.parentId))) {
          return c.json(parentProblem(topicErrors.parent), 400);
        }
        if (wouldCreateCycle(id, input.parentId, await parentMap(db, userId))) {
          return c.json(parentProblem(topicErrors.cycle), 400);
        }
      }
      const [row] = await db
        .update(topics)
        .set(input)
        .where(and(eq(topics.userId, userId), eq(topics.id, id)))
        .returning();
      if (!row) return c.json({ error: "not_found" as const }, 404);
      return c.json({ topic: toTopic(row) }, 200);
    })
    .delete("/:id", idParam, async (c) => {
      const userId = c.get("user").id;
      const id = c.req.valid("param").id;
      if (!(await findTopic(db, userId, id))) return c.json({ error: "not_found" as const }, 404);
      const [links] = await db
        .select({ n: count() })
        .from(lessonTopics)
        .where(and(eq(lessonTopics.userId, userId), eq(lessonTopics.topicId, id)));
      if ((links?.n ?? 0) > 0) return c.json({ error: topicErrors.hasLessons }, 409);
      const [practice] = await db
        .select({ n: count() })
        .from(sessionBlocks)
        .where(and(eq(sessionBlocks.userId, userId), eq(sessionBlocks.topicId, id)));
      if ((practice?.n ?? 0) > 0) return c.json({ error: topicErrors.hasPractice }, 409);
      await deleteDrafts(db, userId, "topic", id);
      await db.delete(topics).where(and(eq(topics.userId, userId), eq(topics.id, id)));
      return c.body(null, 204);
    });
}
