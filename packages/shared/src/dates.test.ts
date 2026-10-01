import { describe, expect, it } from "vitest";
import { todayIn } from "./dates.ts";

describe("todayIn", () => {
  it("AC-1: gives the calendar date in Lima, not UTC", () => {
    expect(todayIn("America/Lima", new Date("2026-10-02T03:00:00Z"))).toBe("2026-10-01");
    expect(todayIn("America/Lima", new Date("2026-10-02T05:00:00Z"))).toBe("2026-10-02");
  });
});
