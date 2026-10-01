import {
  createLessonSchema,
  createUploadSchema,
  lessonErrors,
  lessonTopicLinksSchema,
  updateLessonSchema,
} from "@ds/shared";
import { and, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { uuidv7 } from "uuidv7";
import { z } from "zod";
import type { SessionVariables } from "../auth/require-session";
import { lessonFiles, lessons, lessonTopics, topics } from "../db/schema";
import { createUpload, type FileDeps } from "../files/routes";
import { idParam, validate } from "../http/validate";
import { deleteDrafts, latestDraft, startDraft } from "../llm/drafts";
import { type LlmRouteDeps, startFailure } from "../llm/routes";
import { userTimezone } from "../llm/run";
import {
  findLesson,
  latestLessonId,
  lessonFilesWithDuplicates,
  lessonTopicGroups,
  listLessons,
  openQuestions,
  toLesson,
} from "./queries";

const createLessonRequestSchema = createLessonSchema.extend({ enrich: z.boolean().default(false) });

export function createLessonRoutes(deps: FileDeps & LlmRouteDeps) {
  const { db } = deps;

  return new Hono<{ Variables: SessionVariables }>()
    .get("/", async (c) => c.json({ lessons: await listLessons(db, c.get("user").id) }, 200))
    .post("/", validate("json", createLessonRequestSchema), async (c) => {
      const userId = c.get("user").id;
      const { enrich, ...values } = c.req.valid("json");
      try {
        const created = await db.transaction(async (tx) => {
          const [row] = await tx
            .insert(lessons)
            .values({ id: uuidv7(), userId, ...values, status: enrich ? "draft" : "final" })
            .returning();
          if (!row) throw new Error("lesson insert returned nothing");
          const draft = enrich
            ? await startDraft(
                deps,
                {
                  userId,
                  timeZone: await userTimezone(tx, userId, deps.defaultTimezone),
                  kind: "lesson_enrichment",
                  subject: { type: "lesson", id: row.id },
                },
                tx,
              )
            : null;
          return { row, draft };
        });
        await created.draft?.send();
        return c.json({ lesson: toLesson(created.row), draftId: created.draft?.id ?? null }, 201);
      } catch (error) {
        const failure = startFailure(error);
        return c.json(failure.body, failure.status);
      }
    })
    .get("/:id", idParam, async (c) => {
      const userId = c.get("user").id;
      const lesson = await findLesson(db, userId, c.req.valid("param").id);
      if (!lesson) return c.json({ error: "not_found" as const }, 404);
      const [files, topics, questions, latestId, draft] = await Promise.all([
        lessonFilesWithDuplicates(db, userId, lesson.id),
        lessonTopicGroups(db, userId, lesson.id),
        openQuestions(db, userId),
        latestLessonId(db, userId),
        latestDraft(db, userId, "lesson", lesson.id),
      ]);
      const isLatest = latestId === lesson.id;
      return c.json(
        {
          lesson: toLesson(lesson),
          draft,
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
    .post("/:id/files", idParam, validate("json", createUploadSchema), async (c) => {
      const userId = c.get("user").id;
      const lesson = await findLesson(db, userId, c.req.valid("param").id);
      if (!lesson) return c.json({ error: "not_found" as const }, 404);
      return c.json(await createUpload(deps, userId, lesson.id, c.req.valid("json")), 201);
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
      await deleteDrafts(db, userId, "lesson", lesson.id);
      await db.delete(lessons).where(and(eq(lessons.userId, userId), eq(lessons.id, lesson.id)));
      return c.body(null, 204);
    });
}
