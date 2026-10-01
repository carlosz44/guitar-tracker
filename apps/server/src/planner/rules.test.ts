import { describe, expect, it } from "vitest";
import { dayTarget } from "./rules";

describe("dayTarget", () => {
  it("006 AC-1: uses the weekday's target, or the daily target when none is set", () => {
    const week = { dailyTargetMinutes: 30, dayTargets: [30, 30, 30, 30, 30, 45, 60] };
    expect(dayTarget(week, "2026-10-04")).toBe(60);
    expect(dayTarget(week, "2026-10-03")).toBe(45);
    expect(dayTarget({ dailyTargetMinutes: 40, dayTargets: null }, "2026-10-04")).toBe(40);
  });
});
