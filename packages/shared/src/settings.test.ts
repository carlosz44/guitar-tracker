import { describe, expect, it } from "vitest";
import {
  dailyTargetMinutesSchema,
  dayTargetsSchema,
  settingsErrors,
  updateSettingsSchema,
} from "./settings.ts";

function firstError(value: unknown) {
  const result = dailyTargetMinutesSchema.safeParse(value);
  return result.success ? undefined : result.error.issues[0]?.message;
}

describe("dailyTargetMinutesSchema", () => {
  it("AC-8: accepts 10 to 240 minutes in steps of 5", () => {
    for (const value of [10, 15, 30, 235, 240]) {
      expect(dailyTargetMinutesSchema.safeParse(value).success).toBe(true);
    }
  });

  it("AC-8: rejects values outside 10–240 with the range key", () => {
    expect(firstError(5)).toBe(settingsErrors.dailyTargetRange);
    expect(firstError(9)).toBe(settingsErrors.dailyTargetRange);
    expect(firstError(245)).toBe(settingsErrors.dailyTargetRange);
  });

  it("AC-8: rejects values that are not multiples of 5 with the step key", () => {
    expect(firstError(33)).toBe(settingsErrors.dailyTargetStep);
    expect(firstError(32.5)).toBe(settingsErrors.dailyTargetStep);
  });

  it("AC-8: rejects non-numbers with the invalid key", () => {
    expect(firstError("30")).toBe(settingsErrors.dailyTargetInvalid);
    expect(firstError(Number.NaN)).toBe(settingsErrors.dailyTargetInvalid);
    expect(firstError(undefined)).toBe(settingsErrors.dailyTargetInvalid);
  });
});

describe("updateSettingsSchema", () => {
  it("AC-8: rejects unknown fields so only the daily target is editable", () => {
    expect(updateSettingsSchema.safeParse({ dailyTargetMinutes: 30 }).success).toBe(true);
    expect(
      updateSettingsSchema.safeParse({ dailyTargetMinutes: 30, timezone: "UTC" }).success,
    ).toBe(false);
  });
});

describe("dayTargetsSchema", () => {
  it("006 AC-1: needs one target per weekday, each 10–240 in steps of 5", () => {
    expect(dayTargetsSchema.safeParse([30, 30, 30, 30, 30, 30, 60]).success).toBe(true);
    expect(dayTargetsSchema.safeParse([30, 30, 30, 30, 30, 30]).success).toBe(false);
    expect(dayTargetsSchema.safeParse([30, 30, 30, 30, 30, 30, 33]).success).toBe(false);
    expect(updateSettingsSchema.safeParse({ dayTargets: null }).success).toBe(true);
  });
});
