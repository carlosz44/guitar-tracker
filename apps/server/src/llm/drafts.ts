import {
  ACTIVE_DRAFT_STATUSES,
  type DraftKind,
  type DraftSubject,
  type LessonDraftPayload,
  llmErrors,
} from "@ds/shared";
import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import type { Clock } from "../clock";
import type { Database, Tx } from "../db/client";
import { lessons, llmDrafts, teacherQuestions, topics } from "../db/schema";
import { type JobQueue, QUEUES } from "../jobs/boss";
import { assertCanCall, type LlmSettings } from "./usage";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const STALE_DRAFT_MS = 15 * 60 * 1000;

export class DraftConflict extends Error {
  constructor(readonly key: typeof llmErrors.running) {
    super(key);
  }
}

export interface DraftDeps {
  db: Database;
  clock: Clock;
  queue: JobQueue;
  llm: LlmSettings;
}

const QUEUE_FOR: Record<DraftKind, typeof QUEUES.lessonEnrich | typeof QUEUES.topicImprove> = {
  lesson_enrichment: QUEUES.lessonEnrich,
  topic_improve: QUEUES.topicImprove,
};

export async function startDraft(
  deps: DraftDeps,
  input: {
    userId: string;
    timeZone: string;
    kind: DraftKind;
    subject: { type: DraftSubject; id: string };
    instruction?: string;
  },
  tx: Database | Tx = deps.db,
) {
  const now = deps.clock.now();
  await assertCanCall(tx, deps.llm, { userId: input.userId, timeZone: input.timeZone, now });
  const subject = and(
    eq(llmDrafts.userId, input.userId),
    eq(llmDrafts.subjectType, input.subject.type),
    eq(llmDrafts.subjectId, input.subject.id),
  );
  await tx
    .update(llmDrafts)
    .set({ status: "failed", error: "stale" })
    .where(
      and(
        subject,
        inArray(llmDrafts.status, ["queued", "running"]),
        lt(llmDrafts.updatedAt, sql`now() - make_interval(secs => ${STALE_DRAFT_MS / 1000})`),
      ),
    );
  const [active] = await tx
    .select({ id: llmDrafts.id, status: llmDrafts.status })
    .from(llmDrafts)
    .where(and(subject, inArray(llmDrafts.status, [...ACTIVE_DRAFT_STATUSES])));
  if (active && active.status !== "pending") throw new DraftConflict(llmErrors.running);
  if (active) {
    await tx.update(llmDrafts).set({ status: "discarded" }).where(eq(llmDrafts.id, active.id));
  }
  const id = uuidv7();
  try {
    await tx.insert(llmDrafts).values({
      id,
      userId: input.userId,
      kind: input.kind,
      subjectType: input.subject.type,
      subjectId: input.subject.id,
      instruction: input.instruction ?? "",
    });
  } catch (error) {
    if ((error as { cause?: { code?: string } }).cause?.code === "23505") {
      throw new DraftConflict(llmErrors.running);
    }
    throw error;
  }
  return { id, send: () => deps.queue.send(QUEUE_FOR[input.kind], { draftId: id }) };
}

export async function latestDraft(db: Database, userId: string, type: DraftSubject, id: string) {
  const [row] = await db
    .select({ id: llmDrafts.id, status: llmDrafts.status })
    .from(llmDrafts)
    .where(
      and(
        eq(llmDrafts.userId, userId),
        eq(llmDrafts.subjectType, type),
        eq(llmDrafts.subjectId, id),
        inArray(llmDrafts.status, ["queued", "running", "pending", "failed"]),
      ),
    )
    .orderBy(desc(llmDrafts.createdAt))
    .limit(1);
  return row ?? null;
}

export async function deleteDrafts(db: Database, userId: string, type: DraftSubject, id: string) {
  await db
    .delete(llmDrafts)
    .where(
      and(
        eq(llmDrafts.userId, userId),
        eq(llmDrafts.subjectType, type),
        eq(llmDrafts.subjectId, id),
      ),
    );
}

export async function findDraft(db: Database, userId: string, id: string) {
  const [row] = await db
    .select()
    .from(llmDrafts)
    .where(and(eq(llmDrafts.userId, userId), eq(llmDrafts.id, id)));
  return row ?? null;
}

async function currentValues(db: Database, draft: typeof llmDrafts.$inferSelect) {
  const { userId } = draft;
  if (draft.subjectType === "topic") {
    const [topic] = await db
      .select({
        title: topics.title,
        description: topics.description,
        practicePoints: topics.practicePoints,
        successCriteria: topics.successCriteria,
      })
      .from(topics)
      .where(and(eq(topics.userId, userId), eq(topics.id, draft.subjectId)));
    return topic ?? null;
  }
  const [lesson] = await db
    .select({
      title: lessons.title,
      summary: lessons.summary,
      practicePoints: lessons.practicePoints,
      homework: lessons.homework,
      status: lessons.status,
    })
    .from(lessons)
    .where(and(eq(lessons.userId, userId), eq(lessons.id, draft.subjectId)));
  if (!lesson) return null;
  const payload = draft.payload as LessonDraftPayload | null;
  const questionIds = payload?.answers.map((answer) => answer.questionId) ?? [];
  const topicIds = [
    ...new Set(
      (payload?.topics ?? [])
        .flatMap((topic) => [topic.topicId, topic.parentRef])
        .filter((id): id is string => id !== null && UUID.test(id)),
    ),
  ];
  const [questions, linked] = await Promise.all([
    questionIds.length
      ? db
          .select({
            id: teacherQuestions.id,
            text: teacherQuestions.text,
            status: teacherQuestions.status,
          })
          .from(teacherQuestions)
          .where(
            and(eq(teacherQuestions.userId, userId), inArray(teacherQuestions.id, questionIds)),
          )
      : [],
    topicIds.length
      ? db
          .select({ id: topics.id, title: topics.title })
          .from(topics)
          .where(and(eq(topics.userId, userId), inArray(topics.id, topicIds)))
      : [],
  ]);
  return { ...lesson, questions, topics: linked };
}

export async function draftView(db: Database, draft: typeof llmDrafts.$inferSelect) {
  return {
    id: draft.id,
    kind: draft.kind,
    subjectType: draft.subjectType,
    subjectId: draft.subjectId,
    status: draft.status,
    error: draft.error,
    instruction: draft.instruction,
    payload: draft.payload,
    review: draft.review,
    skippedFiles: draft.skippedFiles,
    current: await currentValues(db, draft),
  };
}
