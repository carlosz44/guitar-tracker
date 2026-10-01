import { z } from "zod";
import { DAILY_TARGET_MAX, DAILY_TARGET_MIN, DAILY_TARGET_STEP } from "./constants.ts";

export const settingsErrors = {
  dailyTargetInvalid: "settings.dailyTarget.invalid",
  dailyTargetRange: "settings.dailyTarget.range",
  dailyTargetStep: "settings.dailyTarget.step",
} as const;
export type SettingsErrorKey = (typeof settingsErrors)[keyof typeof settingsErrors];

export const dailyTargetMinutesSchema = z
  .number({ error: settingsErrors.dailyTargetInvalid })
  .int({ error: settingsErrors.dailyTargetStep })
  .min(DAILY_TARGET_MIN, { error: settingsErrors.dailyTargetRange })
  .max(DAILY_TARGET_MAX, { error: settingsErrors.dailyTargetRange })
  .multipleOf(DAILY_TARGET_STEP, { error: settingsErrors.dailyTargetStep });

export const dayTargetsSchema = z.array(dailyTargetMinutesSchema).length(7);

export const updateSettingsSchema = z.strictObject({
  dailyTargetMinutes: dailyTargetMinutesSchema.optional(),
  dayTargets: dayTargetsSchema.nullable().optional(),
});
export type UpdateSettings = z.infer<typeof updateSettingsSchema>;

export const settingsSchema = z.object({
  timezone: z.string(),
  dailyTargetMinutes: z.number().int(),
  dayTargets: z.array(z.number().int()).nullable(),
  lessonWeekday: z.number().int().min(1).max(7),
});
export type Settings = z.infer<typeof settingsSchema>;
