import { describe, expect, it } from "vitest";
import { planErrors, putPlanDaysSchema } from "./plans.ts";

const day = (items: unknown[]) => ({ days: [{ date: "2026-10-01", items }] });

describe("putPlanDaysSchema", () => {
  it("AC-7: blocks need a topic or a label, minutes in steps of 5, at most 3 topics plus warm-up", () => {
    const warmUp = { label: "Calentamiento", minutes: 5 };
    const topic = { topicId: "0199a000-0000-7000-8000-000000000001", minutes: 10 };
    expect(putPlanDaysSchema.safeParse(day([warmUp, topic, topic, topic])).success).toBe(true);
    expect(putPlanDaysSchema.safeParse(day([warmUp, topic, topic, topic, topic])).success).toBe(
      false,
    );
    const noTopic = putPlanDaysSchema.safeParse(day([{ minutes: 10 }]));
    expect(noTopic.success).toBe(false);
    expect(noTopic.error?.issues[0]?.message).toBe(planErrors.items);
    expect(putPlanDaysSchema.safeParse(day([{ ...topic, minutes: 12 }])).success).toBe(false);
  });
});
