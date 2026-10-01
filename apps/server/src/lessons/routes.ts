import {
  createLessonSchema,
  lessonErrors,
  lessonTopicLinksSchema,
  updateLessonSchema,
} from "@ds/shared";
import { and, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { uuidv7 } from "uuidv7";
import type { SessionVariables } from "../auth/require-session";
import type { Database } from "../db/client";
import { lessonFiles, lessons, lessonTopics, topics } from "../db/schema";
import { idParam, validate } from "../http/validate";
import type { Logger } from "../logger";
import type { ObjectStorage } from "../storage/r2";
import {
  findLesson,
  latestLessonId,
  lessonFilesWithDuplicates,
  lessonTopicGroups,
  listLessons,
  openQuestions,
  toLesson,
} from "./queries";

export function createLessonRoutes(deps: { db: Database; storage: ObjectStorage; logger: Logger }) {
  const { db } = deps;

  return new Hono<{ Variables: SessionVariables }>()
    .get("/", async (c) => c.json({ lessons: await listLessons(db, c.get("user").id) }, 200))
    .post("/", validate("json", createLessonSchema), async (c) => {
      const [row] = await db
        .insert(lessons)
        .values({ id: uuidv7(), userId: c.get("user").id, ...c.req.valid("json") })
        .returning();
      if (!row) throw new Error("lesson insert returned nothing");
      return c.json({ lesson: toLesson(row) }, 201);
    })
    .get("/:id", idParam, async (c) => {
      const userId = c.get("user").id;
      const lesson = await findLesson(db, userId, c.req.valid("param").id);
      if (!lesson) return c.json({ error: "not_found" as const }, 404);
      const [files, topics, questions, latestId] = await Promise.all([
        lessonFilesWithDuplicates(db, userId, lesson.id),
        lessonTopicGroups(db, userId, lesson.id),
        openQuestions(db, userId),
        latestLessonId(db, userId),
      ]);
      const isLatest = latestId === lesson.id;
      return c.json(
        {
          lesson: toLesson(lesson),
          topics,
          files,
          isLatest,
          openQuestionsCount: questions.length,
          openQuestions: isLatest
            ? questions.map((question) => ({
                id: question.id,
                text: question.text,
                createdAt: question.createdAt.toISOString(),
                topic: question.topicId
                  ? { id: question.topicId, title: question.topicTitle ?? "" }
                  : null,
              }))
            : [],
        },
        200,
      );
    })
    .patch("/:id", idParam, validate("json", updateLessonSchema), async (c) => {
      const userId = c.get("user").id;
      const [row] = await db
        .update(lessons)
        .set(c.req.valid("json"))
        .where(and(eq(lessons.userId, userId), eq(lessons.id, c.req.valid("param").id)))
        .returning();
      if (!row) return c.json({ error: "not_found" as const }, 404);
      return c.json({ lesson: toLesson(row) }, 200);
    })
    .put("/:id/topics", idParam, validate("json", lessonTopicLinksSchema), async (c) => {
      const userId = c.get("user").id;
      const lesson = await findLesson(db, userId, c.req.valid("param").id);
      if (!lesson) return c.json({ error: "not_found" as const }, 404);
      const links = c.req.valid("json");
      const topicIds = links.map((link) => link.topicId);
      const owned = topicIds.length
        ? await db
            .select({ id: topics.id })
            .from(topics)
            .where(and(eq(topics.userId, userId), inArray(topics.id, topicIds)))
        : [];
      const ownedIds = new Set(owned.map((topic) => topic.id));
      const unknown = topicIds.findIndex((id) => !ownedIds.has(id));
      if (unknown !== -1) {
        return c.json(
          {
            error: "invalid" as const,
            issues: [{ path: [unknown, "topicId"], message: lessonErrors.unknownTopic }],
          },
          400,
        );
      }
      await db.transaction(async (tx) => {
        await tx
          .delete(lessonTopics)
          .where(and(eq(lessonTopics.userId, userId), eq(lessonTopics.lessonId, lesson.id)));
        if (links.length) {
          await tx
            .insert(lessonTopics)
            .values(links.map((link) => ({ userId, lessonId: lesson.id, ...link })));
        }
      });
      return c.json({ topics: await lessonTopicGroups(db, userId, lesson.id) }, 200);
    })
    .delete("/:id", idParam, async (c) => {
      const userId = c.get("user").id;
      const lesson = await findLesson(db, userId, c.req.valid("param").id);
      if (!lesson) return c.json({ error: "not_found" as const }, 404);
      const files = await db
        .select({ key: lessonFiles.r2Key })
        .from(lessonFiles)
        .where(and(eq(lessonFiles.userId, userId), eq(lessonFiles.lessonId, lesson.id)));
      try {
        await Promise.all(files.map(({ key }) => deps.storage.delete(key)));
      } catch {
        deps.logger.error({ lessonId: lesson.id }, "deleting lesson files from storage failed");
        return c.json({ error: "storage_unavailable" as const }, 502);
      }
      await db.delete(lessons).where(and(eq(lessons.userId, userId), eq(lessons.id, lesson.id)));
      return c.body(null, 204);
    });
}
