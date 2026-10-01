import { z } from "zod";
import { TOPIC_CATEGORIES } from "./constants.ts";
import { practicePointsSchema } from "./lessons.ts";

export const TOPIC_STATUSES = ["new", "active", "maintenance", "archived"] as const;
export type TopicStatus = (typeof TOPIC_STATUSES)[number];
export const TOPIC_PRIORITIES = [1, 2, 3] as const;

export const topicErrors = {
  title: "topic.title",
  category: "topic.category",
  targetBpm: "topic.targetBpm",
  blockMinutes: "topic.blockMinutes",
  cycle: "topic.cycle",
  parent: "topic.parent",
  hasLessons: "topic.hasLessons",
  hasPractice: "topic.hasPractice",
} as const;

export const createTopicSchema = z.strictObject({
  title: z
    .string()
    .trim()
    .min(1, { error: topicErrors.title })
    .max(200, { error: topicErrors.title }),
  category: z.enum(TOPIC_CATEGORIES, { error: topicErrors.category }),
  description: z.string().max(50_000).default(""),
  practicePoints: practicePointsSchema.default([]),
  successCriteria: z.string().max(5_000).default(""),
  targetBpm: z
    .number({ error: topicErrors.targetBpm })
    .int({ error: topicErrors.targetBpm })
    .min(20, { error: topicErrors.targetBpm })
    .max(400, { error: topicErrors.targetBpm })
    .nullable()
    .default(null),
  priority: z.number().int().min(1).max(3).default(2),
  defaultBlockMinutes: z
    .number({ error: topicErrors.blockMinutes })
    .int({ error: topicErrors.blockMinutes })
    .min(5, { error: topicErrors.blockMinutes })
    .max(60, { error: topicErrors.blockMinutes })
    .default(10),
  parentId: z.uuid().nullable().default(null),
});
export type CreateTopic = z.input<typeof createTopicSchema>;

export const updateTopicSchema = createTopicSchema
  .partial()
  .extend({ status: z.enum(TOPIC_STATUSES).optional() });

export const topicListQuerySchema = z.object({
  status: z.enum(TOPIC_STATUSES).optional(),
  category: z.enum(TOPIC_CATEGORIES).optional(),
});
export type TopicErrorKey = (typeof topicErrors)[keyof typeof topicErrors];
