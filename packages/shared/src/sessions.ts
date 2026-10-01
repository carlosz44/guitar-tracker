import { z } from "zod";

export const SESSION_STATUSES = ["in_progress", "completed", "abandoned"] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];
export const SESSION_SOURCES = ["timer", "manual", "telegram"] as const;

export const BLOCK_STEP_SECONDS = 5 * 60;
export const WARM_UP_SECONDS = 5 * 60;

export const sessionErrors = {
  blocks: "session.blocks",
  blockLabel: "session.blockLabel",
  plannedMinutes: "session.plannedMinutes",
  active: "session.active",
  notActive: "session.notActive",
  notCurrent: "session.notCurrent",
  bpm: "session.bpm",
  rating: "session.rating",
  duration: "session.duration",
  itemMinutes: "session.itemMinutes",
  unknownTopic: "session.unknownTopic",
} as const;
export type SessionErrorKey = (typeof sessionErrors)[keyof typeof sessionErrors];

const instant = z.iso.datetime({ offset: true });
const label = z.string().trim().max(100);
const hasTopicOrLabel = (block: { topicId?: string | null; label?: string }) =>
  Boolean(block.topicId) || Boolean(block.label);

export const cleanBpmSchema = z
  .number({ error: sessionErrors.bpm })
  .int({ error: sessionErrors.bpm })
  .min(20, { error: sessionErrors.bpm })
  .max(400, { error: sessionErrors.bpm })
  .nullable();
export const ratingSchema = z
  .number({ error: sessionErrors.rating })
  .int({ error: sessionErrors.rating })
  .min(1, { error: sessionErrors.rating })
  .max(5, { error: sessionErrors.rating })
  .nullable();

export const plannedBlockSchema = z
  .strictObject({
    topicId: z.uuid().nullable().optional(),
    label: label.optional(),
    plannedSeconds: z
      .number()
      .int()
      .min(BLOCK_STEP_SECONDS, { error: sessionErrors.plannedMinutes })
      .max(4 * 60 * 60, { error: sessionErrors.plannedMinutes }),
  })
  .refine(hasTopicOrLabel, { error: sessionErrors.blockLabel });
export type PlannedBlock = z.infer<typeof plannedBlockSchema>;

export const startSessionSchema = z.strictObject({
  blocks: z.array(plannedBlockSchema).min(1, { error: sessionErrors.blocks }).max(20),
  planDayId: z.uuid().optional(),
});

export const pauseSchema = z.strictObject({ at: instant.optional() });

export const blockActionSchema = z.union([
  z.strictObject({ action: z.literal("extend") }),
  z.strictObject({
    action: z.enum(["complete", "skip"]),
    endedAt: instant.optional(),
    nextStartsAt: instant.optional(),
    cleanBpm: cleanBpmSchema.optional(),
    rating: ratingSchema.optional(),
    notes: z.string().max(2_000).optional(),
  }),
]);
export type BlockAction = z.infer<typeof blockActionSchema>;

export const finishSessionSchema = z.strictObject({ notes: z.string().max(5_000).optional() });

export const manualSessionSchema = z
  .strictObject({
    date: z.iso.date(),
    minutes: z
      .number({ error: sessionErrors.duration })
      .int({ error: sessionErrors.duration })
      .min(1, { error: sessionErrors.duration })
      .max(600, { error: sessionErrors.duration }),
    items: z
      .array(
        z
          .strictObject({
            topicId: z.uuid().nullable().optional(),
            label: label.optional(),
            minutes: z.number().int().min(1).max(600).nullable().optional(),
            cleanBpm: cleanBpmSchema.optional(),
          })
          .refine(hasTopicOrLabel, { error: sessionErrors.blockLabel }),
      )
      .min(1, { error: sessionErrors.blocks })
      .max(10),
    notes: z.string().max(5_000).default(""),
  })
  .superRefine((value, context) => {
    const given = value.items.reduce((sum, item) => sum + (item.minutes ?? 0), 0);
    if (given > value.minutes) {
      context.addIssue({ code: "custom", message: sessionErrors.itemMinutes, path: ["items"] });
    }
  });
export type ManualSession = z.input<typeof manualSessionSchema>;

export const updateSessionSchema = z.strictObject({
  notes: z.string().max(5_000).optional(),
  blocks: z
    .array(
      z.strictObject({
        id: z.uuid(),
        actualMinutes: z.number().int().min(0).max(600).optional(),
        cleanBpm: cleanBpmSchema.optional(),
        rating: ratingSchema.optional(),
        notes: z.string().max(2_000).optional(),
      }),
    )
    .optional(),
});

export const historyQuerySchema = z.object({
  before: z.iso.date().optional(),
  cycles: z.coerce.number().int().min(1).max(26).default(8),
});
