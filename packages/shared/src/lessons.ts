import { z } from "zod";

export const LESSON_STATUSES = ["draft", "final"] as const;
export const LESSON_SOURCES = ["web", "telegram"] as const;
export const LESSON_RELATIONS = ["introduced", "extended", "reviewed"] as const;
export type LessonRelation = (typeof LESSON_RELATIONS)[number];

export const lessonErrors = {
  title: "lesson.title",
  date: "lesson.date",
  tooLong: "lesson.tooLong",
  practicePoint: "lesson.practicePoint",
  duplicateTopic: "lesson.duplicateTopic",
  unknownTopic: "lesson.unknownTopic",
} as const;

const longText = z.string().max(50_000, { error: lessonErrors.tooLong });

export const practicePointsSchema = z
  .array(z.string().trim().min(1, { error: lessonErrors.practicePoint }).max(500))
  .max(50);

export const createLessonSchema = z.strictObject({
  date: z.iso.date({ error: lessonErrors.date }),
  title: z
    .string()
    .trim()
    .min(1, { error: lessonErrors.title })
    .max(200, { error: lessonErrors.title }),
  rawNotes: longText.default(""),
  summary: longText.default(""),
  practicePoints: practicePointsSchema.default([]),
  homework: longText.default(""),
});
export type CreateLesson = z.input<typeof createLessonSchema>;

export const updateLessonSchema = createLessonSchema.partial();

export const lessonTopicLinksSchema = z
  .array(z.strictObject({ topicId: z.uuid(), relation: z.enum(LESSON_RELATIONS) }))
  .max(100)
  .superRefine((links, context) => {
    const seen = new Set<string>();
    for (const link of links) {
      if (seen.has(link.topicId)) {
        context.addIssue({ code: "custom", message: lessonErrors.duplicateTopic });
        return;
      }
      seen.add(link.topicId);
    }
  });
export type LessonTopicLinks = z.infer<typeof lessonTopicLinksSchema>;
