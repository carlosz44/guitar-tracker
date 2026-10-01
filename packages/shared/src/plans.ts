import { z } from "zod";

export const PLAN_STATUSES = ["draft", "active", "replaced"] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];
export const PLAN_SOURCES = ["rules", "claude"] as const;
export const PLAN_LLM_STATUSES = [
  "queued",
  "running",
  "done",
  "rejected",
  "failed",
  "skipped",
] as const;
export type PlanLlmStatus = (typeof PLAN_LLM_STATUSES)[number];
export const MAX_TOPICS_PER_DAY = 3;

export const planErrors = {
  locked: "plan.locked",
  pastDay: "plan.pastDay",
  day: "plan.day",
  items: "plan.items",
  minutes: "plan.minutes",
} as const;
export type PlanErrorKey = (typeof planErrors)[keyof typeof planErrors];

export const planItemSchema = z
  .strictObject({
    topicId: z.uuid().nullable().default(null),
    label: z.string().trim().min(1).max(80).nullable().default(null),
    minutes: z
      .number({ error: planErrors.minutes })
      .int({ error: planErrors.minutes })
      .min(5, { error: planErrors.minutes })
      .max(240, { error: planErrors.minutes })
      .multipleOf(5, { error: planErrors.minutes }),
  })
  .refine((item) => item.topicId !== null || item.label !== null, { error: planErrors.items });
export type PlanItem = z.infer<typeof planItemSchema>;

export const planDayItemsSchema = z.strictObject({
  date: z.iso.date({ error: planErrors.day }),
  items: z.array(planItemSchema).max(MAX_TOPICS_PER_DAY + 1, { error: planErrors.items }),
});

export const putPlanDaysSchema = z.strictObject({
  days: z.array(planDayItemsSchema).min(1).max(7),
});

export const createPlanSchema = z.strictObject({
  cycleStart: z.iso.date().optional(),
});

export const currentPlanQuerySchema = z.object({
  cycle: z.iso.date().optional(),
});

export const weeklyPlanOutputSchema = z.object({
  weekNote: z.string(),
  days: z.array(
    z.object({
      date: z.string(),
      focusNote: z.string(),
      items: z.array(
        z.object({
          topicId: z.string().nullable(),
          label: z.string().nullable(),
          minutes: z.number().int(),
        }),
      ),
    }),
  ),
});
export type WeeklyPlanOutput = z.infer<typeof weeklyPlanOutputSchema>;
