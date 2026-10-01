import { z } from "zod";
import { TOPIC_CATEGORIES } from "./constants.ts";
import { LESSON_RELATIONS, lessonErrors, practicePointsSchema } from "./lessons.ts";
import { questionErrors } from "./questions.ts";
import { topicErrors } from "./topics.ts";

export const LLM_FEATURES = [
  "lesson_enrichment",
  "weekly_plan",
  "weekly_review",
  "topic_improve",
  "log_parse",
] as const;
export type LlmFeature = (typeof LLM_FEATURES)[number];
export const LLM_RUN_STATUSES = ["ok", "error"] as const;

export const DRAFT_KINDS = ["lesson_enrichment", "topic_improve"] as const;
export type DraftKind = (typeof DRAFT_KINDS)[number];
export const DRAFT_SUBJECTS = ["lesson", "topic"] as const;
export type DraftSubject = (typeof DRAFT_SUBJECTS)[number];
export const DRAFT_STATUSES = [
  "queued",
  "running",
  "pending",
  "accepted",
  "discarded",
  "failed",
] as const;
export type DraftStatus = (typeof DRAFT_STATUSES)[number];
export const ACTIVE_DRAFT_STATUSES = ["queued", "running", "pending"] as const;
export const SECTION_STATES = ["pending", "accepted", "discarded"] as const;
export type SectionState = (typeof SECTION_STATES)[number];

export const LESSON_DRAFT_SECTIONS = [
  "title",
  "summary",
  "practicePoints",
  "homework",
  "topics",
  "answers",
  "questions",
] as const;
export type LessonDraftSection = (typeof LESSON_DRAFT_SECTIONS)[number];
export const TOPIC_DRAFT_SECTIONS = ["description", "practicePoints", "successCriteria"] as const;
export type TopicDraftSection = (typeof TOPIC_DRAFT_SECTIONS)[number];
export type DraftSection = LessonDraftSection | TopicDraftSection;

export const SKIP_REASONS = ["unsupported", "not_extracted", "too_large"] as const;
export type SkipReason = (typeof SKIP_REASONS)[number];

export const llmErrors = {
  disabled: "llm.disabled",
  budget: "llm.budget",
  running: "llm.running",
  notPending: "draft.notPending",
  resolved: "draft.resolved",
  section: "draft.section",
} as const;
export type LlmErrorKey = (typeof llmErrors)[keyof typeof llmErrors];

export const lessonEnrichmentOutputSchema = z.object({
  title: z.string(),
  summary: z.string(),
  practicePoints: z.array(z.string()),
  homework: z.string(),
  topics: z.array(
    z.object({
      ref: z.string(),
      kind: z.enum(["existing", "new"]),
      existingTopicId: z.string().nullable(),
      title: z.string(),
      category: z.enum(TOPIC_CATEGORIES).nullable(),
      parentRef: z.string().nullable(),
      description: z.string(),
      practicePoints: z.array(z.string()),
      successCriteria: z.string(),
      targetBpm: z.number().int().nullable(),
      relation: z.enum(LESSON_RELATIONS),
    }),
  ),
  answers: z.array(z.object({ questionId: z.string(), answer: z.string() })),
  questions: z.array(z.object({ text: z.string(), topicRef: z.string().nullable() })),
});
export type LessonEnrichmentOutput = z.infer<typeof lessonEnrichmentOutputSchema>;

export const topicImproveOutputSchema = z.object({
  description: z.string(),
  practicePoints: z.array(z.string()),
  successCriteria: z.string(),
});

const longText = z.string().trim().max(50_000, { error: lessonErrors.tooLong });
const lessonTitle = z
  .string()
  .trim()
  .min(1, { error: lessonErrors.title })
  .max(200, { error: lessonErrors.title });
const targetBpm = z
  .number({ error: topicErrors.targetBpm })
  .int({ error: topicErrors.targetBpm })
  .min(20, { error: topicErrors.targetBpm })
  .max(400, { error: topicErrors.targetBpm })
  .nullable();

export const suggestedTopicSchema = z
  .strictObject({
    ref: z.string().min(1).max(100),
    kind: z.enum(["existing", "new"]),
    topicId: z.uuid().nullable(),
    title: z
      .string()
      .trim()
      .min(1, { error: topicErrors.title })
      .max(200, { error: topicErrors.title }),
    category: z.enum(TOPIC_CATEGORIES, { error: topicErrors.category }).nullable(),
    parentRef: z.string().max(100).nullable(),
    description: longText,
    practicePoints: practicePointsSchema,
    successCriteria: z.string().trim().max(5_000),
    targetBpm,
    relation: z.enum(LESSON_RELATIONS),
  })
  .superRefine((topic, context) => {
    if (topic.kind === "existing" && !topic.topicId) {
      context.addIssue({ code: "custom", message: lessonErrors.unknownTopic, path: ["topicId"] });
    }
    if (topic.kind === "new" && !topic.category) {
      context.addIssue({ code: "custom", message: topicErrors.category, path: ["category"] });
    }
  });
export type SuggestedTopic = z.infer<typeof suggestedTopicSchema>;

const questionText = z
  .string()
  .trim()
  .min(1, { error: questionErrors.text })
  .max(1_000, { error: questionErrors.text });

export const suggestedAnswerSchema = z.strictObject({
  questionId: z.uuid(),
  answer: z.string().trim().min(1, { error: questionErrors.answer }).max(5_000),
});
export const suggestedQuestionSchema = z.strictObject({
  text: questionText,
  topicRef: z.string().max(100).nullable(),
});

export const lessonDraftPayloadSchema = z.strictObject({
  title: lessonTitle,
  summary: longText,
  practicePoints: practicePointsSchema,
  homework: longText,
  topics: z.array(suggestedTopicSchema).max(30),
  answers: z.array(suggestedAnswerSchema).max(50),
  questions: z.array(suggestedQuestionSchema).max(30),
});
export type LessonDraftPayload = z.infer<typeof lessonDraftPayloadSchema>;

export const topicDraftPayloadSchema = z.strictObject({
  description: longText,
  practicePoints: practicePointsSchema,
  successCriteria: z.string().trim().max(5_000),
});
export type TopicDraftPayload = z.infer<typeof topicDraftPayloadSchema>;

const checked = { checked: z.boolean() };
export const lessonSectionValueSchemas = {
  title: lessonTitle,
  summary: longText,
  practicePoints: practicePointsSchema,
  homework: longText,
  topics: z.array(z.intersection(suggestedTopicSchema, z.object(checked))).max(30),
  answers: z.array(suggestedAnswerSchema.extend(checked)).max(50),
  questions: z.array(suggestedQuestionSchema.extend(checked)).max(30),
} satisfies Record<LessonDraftSection, z.ZodType>;

export const topicSectionValueSchemas = {
  description: longText,
  practicePoints: practicePointsSchema,
  successCriteria: z.string().trim().max(5_000),
} satisfies Record<TopicDraftSection, z.ZodType>;

export const startDraftSchema = z.strictObject({
  instruction: z.string().trim().max(500).default(""),
});

export const sectionActionSchema = z.strictObject({
  action: z.enum(["accept", "discard"]),
  value: z.unknown().optional(),
});

export interface SectionReview {
  state: SectionState;
  value?: unknown;
  refs?: Record<string, string>;
}
export type DraftReview = Partial<Record<DraftSection, SectionReview>>;

export interface SkippedFile {
  fileId: string;
  name: string;
  reason: SkipReason;
}
