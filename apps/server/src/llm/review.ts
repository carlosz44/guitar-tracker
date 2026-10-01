import {
  type DraftReview,
  type DraftSection,
  LESSON_DRAFT_SECTIONS,
  type LessonDraftSection,
  lessonSectionValueSchemas,
  llmErrors,
  TOPIC_DRAFT_SECTIONS,
  type TopicDraftSection,
  topicSectionValueSchemas,
} from "@ds/shared";
import { and, eq, inArray } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import type { z } from "zod";
import type { Database, Tx } from "../db/client";
import { lessons, lessonTopics, llmDrafts, teacherQuestions, topics } from "../db/schema";
import type { Draft } from "./run";

type ReviewKey = typeof llmErrors.notPending | typeof llmErrors.resolved | typeof llmErrors.section;

export class ReviewError extends Error {
  constructor(readonly key: ReviewKey) {
    super(key);
  }
}

export class InvalidSection extends Error {
  constructor(readonly issues: z.core.$ZodIssue[]) {
    super("invalid section value");
  }
}

type TopicValue = z.infer<typeof lessonSectionValueSchemas.topics>;
type AnswerValue = z.infer<typeof lessonSectionValueSchemas.answers>;
type QuestionValue = z.infer<typeof lessonSectionValueSchemas.questions>;

const sectionsOf = (draft: Draft): readonly DraftSection[] =>
  draft.kind === "lesson_enrichment" ? LESSON_DRAFT_SECTIONS : TOPIC_DRAFT_SECTIONS;

const key = (text: string) => text.trim().toLocaleLowerCase("es");

async function lockDraft(tx: Tx, userId: string, draftId: string) {
  const [draft] = await tx
    .select()
    .from(llmDrafts)
    .where(and(eq(llmDrafts.userId, userId), eq(llmDrafts.id, draftId)))
    .for("update");
  return draft ?? null;
}

function parseValue<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new InvalidSection(parsed.error.issues);
  return parsed.data;
}

function defaultValue(draft: Draft, section: DraftSection): unknown {
  const value = (draft.payload as Record<string, unknown>)[section];
  return Array.isArray(value) && ["topics", "answers", "questions"].includes(section)
    ? value.map((item) => ({ ...(item as object), checked: true }))
    : value;
}

async function acceptTopics(tx: Tx, draft: Draft, items: TopicValue) {
  const { userId, subjectId: lessonId } = draft;
  const owned = await tx
    .select({ id: topics.id, title: topics.title })
    .from(topics)
    .where(eq(topics.userId, userId));
  const byId = new Map(owned.map((topic) => [topic.id, topic.id]));
  const byTitle = new Map(owned.map((topic) => [key(topic.title), topic.id]));
  const checked = items.filter((item) => item.checked);
  const newByRef = new Map(
    checked.filter((item) => item.kind === "new").map((item) => [item.ref, item]),
  );
  const created = new Map<string, string>();

  const resolveNew = async (ref: string, path: Set<string>): Promise<string | null> => {
    const done = created.get(ref);
    if (done) return done;
    const item = newByRef.get(ref);
    if (!item || path.has(ref)) return null;
    const existing = byTitle.get(key(item.title));
    if (existing) {
      created.set(ref, existing);
      return existing;
    }
    path.add(ref);
    const parentId = item.parentRef
      ? (byId.get(item.parentRef) ?? (await resolveNew(item.parentRef, path)))
      : null;
    const id = uuidv7();
    await tx.insert(topics).values({
      id,
      userId,
      title: item.title,
      category: item.category ?? "other",
      description: item.description,
      practicePoints: item.practicePoints,
      successCriteria: item.successCriteria,
      targetBpm: item.targetBpm,
      parentId,
    });
    created.set(ref, id);
    byTitle.set(key(item.title), id);
    return id;
  };

  const links = new Map<string, (typeof checked)[number]["relation"]>();
  for (const item of checked) {
    const topicId =
      item.kind === "existing"
        ? item.topicId && byId.get(item.topicId)
        : await resolveNew(item.ref, new Set());
    if (topicId) {
      links.set(topicId, item.relation);
      created.set(item.ref, topicId);
    }
  }
  for (const [topicId, relation] of links) {
    await tx
      .insert(lessonTopics)
      .values({ userId, lessonId, topicId, relation })
      .onConflictDoUpdate({
        target: [lessonTopics.lessonId, lessonTopics.topicId],
        set: { relation },
      });
  }
  return Object.fromEntries(created);
}

async function acceptAnswers(tx: Tx, draft: Draft, items: AnswerValue) {
  const checked = items.filter((item) => item.checked);
  if (checked.length === 0) return;
  const open = await tx
    .select({ id: teacherQuestions.id })
    .from(teacherQuestions)
    .where(
      and(
        eq(teacherQuestions.userId, draft.userId),
        eq(teacherQuestions.status, "open"),
        inArray(
          teacherQuestions.id,
          checked.map((item) => item.questionId),
        ),
      ),
    );
  if (open.length !== new Set(checked.map((item) => item.questionId)).size) {
    throw new ReviewError(llmErrors.resolved);
  }
  for (const item of checked) {
    await tx
      .update(teacherQuestions)
      .set({ status: "answered", answer: item.answer, answeredInLessonId: draft.subjectId })
      .where(
        and(eq(teacherQuestions.userId, draft.userId), eq(teacherQuestions.id, item.questionId)),
      );
  }
}

async function acceptQuestions(tx: Tx, draft: Draft, items: QuestionValue, review: DraftReview) {
  const refs = (review.topics?.state === "accepted" ? review.topics.refs : undefined) ?? {};
  const owned = new Set(
    (await tx.select({ id: topics.id }).from(topics).where(eq(topics.userId, draft.userId))).map(
      (topic) => topic.id,
    ),
  );
  for (const item of items.filter((question) => question.checked)) {
    const ref = item.topicRef;
    const topicId = ref ? (refs[ref] ?? (owned.has(ref) ? ref : null)) : null;
    await tx
      .insert(teacherQuestions)
      .values({ id: uuidv7(), userId: draft.userId, text: item.text, topicId });
  }
}

async function applyAccept(
  tx: Tx,
  draft: Draft,
  section: DraftSection,
  value: unknown,
  review: DraftReview,
) {
  const { userId, subjectId } = draft;
  if (draft.kind === "topic_improve") {
    const field = section as TopicDraftSection;
    const parsed = parseValue(topicSectionValueSchemas[field] as z.ZodType<unknown>, value);
    await tx
      .update(topics)
      .set({ [field]: parsed })
      .where(and(eq(topics.userId, userId), eq(topics.id, subjectId)));
    return {};
  }
  const field = section as LessonDraftSection;
  const parsed = parseValue(lessonSectionValueSchemas[field] as z.ZodType<unknown>, value);
  switch (field) {
    case "topics":
      return { refs: await acceptTopics(tx, draft, parsed as TopicValue) };
    case "answers":
      await acceptAnswers(tx, draft, parsed as AnswerValue);
      return {};
    case "questions":
      await acceptQuestions(tx, draft, parsed as QuestionValue, review);
      return {};
    default:
      await tx
        .update(lessons)
        .set({ [field]: parsed })
        .where(and(eq(lessons.userId, userId), eq(lessons.id, subjectId)));
      return {};
  }
}

async function settle(tx: Tx, draft: Draft, review: DraftReview) {
  const states = sectionsOf(draft).map((section) => review[section]?.state ?? "discarded");
  if (states.includes("pending")) {
    await tx.update(llmDrafts).set({ review }).where(eq(llmDrafts.id, draft.id));
    return;
  }
  await tx
    .update(llmDrafts)
    .set({ review, status: states.includes("accepted") ? "accepted" : "discarded" })
    .where(eq(llmDrafts.id, draft.id));
  if (draft.kind === "lesson_enrichment") {
    await tx
      .update(lessons)
      .set({ status: "final" })
      .where(and(eq(lessons.userId, draft.userId), eq(lessons.id, draft.subjectId)));
  }
}

async function reviewOne(
  tx: Tx,
  draft: Draft,
  review: DraftReview,
  section: DraftSection,
  action: "accept" | "discard",
  value: unknown,
) {
  if (!sectionsOf(draft).includes(section)) throw new ReviewError(llmErrors.section);
  if (review[section]?.state !== "pending") throw new ReviewError(llmErrors.notPending);
  if (action === "discard") {
    review[section] = { state: "discarded" };
    return;
  }
  const accepted = value === undefined ? defaultValue(draft, section) : value;
  const extra = await applyAccept(tx, draft, section, accepted, review);
  review[section] = { state: "accepted", value: accepted, ...extra };
}

export async function reviewSection(
  db: Database,
  userId: string,
  draftId: string,
  input: { section: DraftSection; action: "accept" | "discard"; value?: unknown },
) {
  return db.transaction(async (tx) => {
    const draft = await lockDraft(tx, userId, draftId);
    if (!draft) return null;
    if (draft.status !== "pending") throw new ReviewError(llmErrors.notPending);
    const review = structuredClone(draft.review);
    await reviewOne(tx, draft, review, input.section, input.action, input.value);
    await settle(tx, draft, review);
    return draft.id;
  });
}

export async function acceptAll(
  db: Database,
  userId: string,
  draftId: string,
  values: Partial<Record<DraftSection, unknown>> = {},
) {
  return db.transaction(async (tx) => {
    const draft = await lockDraft(tx, userId, draftId);
    if (!draft) return null;
    if (draft.status !== "pending") throw new ReviewError(llmErrors.notPending);
    const review = structuredClone(draft.review);
    for (const section of sectionsOf(draft)) {
      if (review[section]?.state === "pending") {
        await reviewOne(tx, draft, review, section, "accept", values[section]);
      }
    }
    await settle(tx, draft, review);
    return draft.id;
  });
}

export async function discardDraft(db: Database, userId: string, draftId: string) {
  return db.transaction(async (tx) => {
    const draft = await lockDraft(tx, userId, draftId);
    if (!draft) return null;
    if (draft.status !== "pending" && draft.status !== "failed") {
      throw new ReviewError(llmErrors.notPending);
    }
    const review = Object.fromEntries(
      Object.entries(draft.review).map(([section, entry]) => [
        section,
        entry?.state === "pending" ? { state: "discarded" } : entry,
      ]),
    );
    await tx
      .update(llmDrafts)
      .set({ review, status: "discarded" })
      .where(eq(llmDrafts.id, draft.id));
    return draft.id;
  });
}
