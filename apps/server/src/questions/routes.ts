import {
  createQuestionSchema,
  questionErrors,
  questionListQuerySchema,
  updateQuestionSchema,
} from "@ds/shared";
import { and, asc, eq, type SQL } from "drizzle-orm";
import { Hono } from "hono";
import { uuidv7 } from "uuidv7";
import type { SessionVariables } from "../auth/require-session";
import type { Database } from "../db/client";
import { lessons, teacherQuestions, topics } from "../db/schema";
import { idParam, validate } from "../http/validate";

type QuestionRow = typeof teacherQuestions.$inferSelect;

function toQuestion(row: QuestionRow) {
  return {
    id: row.id,
    text: row.text,
    topicId: row.topicId,
    status: row.status,
    answer: row.answer,
    answeredInLessonId: row.answeredInLessonId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function problem(path: string, message: string) {
  return { error: "invalid" as const, issues: [{ path: [path], message }] };
}

export function createQuestionRoutes(deps: { db: Database }) {
  const { db } = deps;

  const ownsTopic = async (userId: string, id: string) =>
    (
      await db
        .select({ id: topics.id })
        .from(topics)
        .where(and(eq(topics.userId, userId), eq(topics.id, id)))
    ).length > 0;
  const ownsLesson = async (userId: string, id: string) =>
    (
      await db
        .select({ id: lessons.id })
        .from(lessons)
        .where(and(eq(lessons.userId, userId), eq(lessons.id, id)))
    ).length > 0;

  return new Hono<{ Variables: SessionVariables }>()
    .get("/", validate("query", questionListQuerySchema), async (c) => {
      const userId = c.get("user").id;
      const { status, topicId } = c.req.valid("query");
      const conditions: SQL[] = [eq(teacherQuestions.userId, userId)];
      if (status) conditions.push(eq(teacherQuestions.status, status));
      if (topicId) conditions.push(eq(teacherQuestions.topicId, topicId));
      const rows = await db
        .select({ question: teacherQuestions, topicTitle: topics.title })
        .from(teacherQuestions)
        .leftJoin(topics, eq(topics.id, teacherQuestions.topicId))
        .where(and(...conditions))
        .orderBy(asc(teacherQuestions.createdAt));
      return c.json(
        {
          questions: rows.map(({ question, topicTitle }) => ({
            ...toQuestion(question),
            topic: question.topicId ? { id: question.topicId, title: topicTitle ?? "" } : null,
          })),
        },
        200,
      );
    })
    .post("/", validate("json", createQuestionSchema), async (c) => {
      const userId = c.get("user").id;
      const input = c.req.valid("json");
      if (input.topicId && !(await ownsTopic(userId, input.topicId))) {
        return c.json(problem("topicId", questionErrors.topic), 400);
      }
      const [row] = await db
        .insert(teacherQuestions)
        .values({ id: uuidv7(), userId, ...input })
        .returning();
      if (!row) throw new Error("question insert returned nothing");
      return c.json({ question: toQuestion(row) }, 201);
    })
    .patch("/:id", idParam, validate("json", updateQuestionSchema), async (c) => {
      const userId = c.get("user").id;
      const input = c.req.valid("json");
      if (input.answeredInLessonId && !(await ownsLesson(userId, input.answeredInLessonId))) {
        return c.json(problem("answeredInLessonId", questionErrors.lesson), 400);
      }
      const [row] = await db
        .update(teacherQuestions)
        .set(input)
        .where(
          and(
            eq(teacherQuestions.userId, userId),
            eq(teacherQuestions.id, c.req.valid("param").id),
          ),
        )
        .returning();
      if (!row) return c.json({ error: "not_found" as const }, 404);
      return c.json({ question: toQuestion(row) }, 200);
    });
}
