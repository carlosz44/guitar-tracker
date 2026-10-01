import { z } from "zod";

export const QUESTION_STATUSES = ["open", "answered", "dismissed"] as const;

export const questionErrors = {
  text: "question.text",
  answer: "question.answer",
  topic: "question.topic",
  lesson: "question.lesson",
} as const;

const text = z
  .string()
  .trim()
  .min(1, { error: questionErrors.text })
  .max(1_000, { error: questionErrors.text });

export const createQuestionSchema = z.strictObject({
  text,
  topicId: z.uuid().nullable().default(null),
});

export const updateQuestionSchema = z
  .strictObject({
    text: text.optional(),
    status: z.enum(QUESTION_STATUSES).optional(),
    answer: z.string().trim().max(5_000).nullable().optional(),
    answeredInLessonId: z.uuid().nullable().optional(),
  })
  .superRefine((value, context) => {
    if (value.status === "answered" && !value.answer) {
      context.addIssue({ code: "custom", message: questionErrors.answer, path: ["answer"] });
    }
  });

export const questionListQuerySchema = z.object({
  status: z.enum(QUESTION_STATUSES).optional(),
  topicId: z.uuid().optional(),
});
export type QuestionErrorKey = (typeof questionErrors)[keyof typeof questionErrors];
