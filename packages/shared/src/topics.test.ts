import { describe, expect, it } from "vitest";
import { createTopicSchema, topicErrors, updateTopicSchema } from "./topics.ts";

function errors(input: unknown) {
  const parsed = createTopicSchema.safeParse(input);
  return parsed.success ? [] : parsed.error.issues.map((issue) => issue.message);
}

describe("createTopicSchema", () => {
  it("AC-11: needs a title and one of the eight categories, with sensible defaults", () => {
    expect(createTopicSchema.parse({ title: "Modo dórico", category: "scales_modes" })).toEqual({
      title: "Modo dórico",
      category: "scales_modes",
      description: "",
      practicePoints: [],
      successCriteria: "",
      targetBpm: null,
      priority: 2,
      defaultBlockMinutes: 10,
      parentId: null,
    });
    expect(errors({ title: "", category: "jazz" })).toEqual([
      topicErrors.title,
      topicErrors.category,
    ]);
  });

  it("AC-11: target BPM is optional, 20–400", () => {
    expect(errors({ title: "x", category: "technique", targetBpm: 19 })).toEqual([
      topicErrors.targetBpm,
    ]);
    expect(errors({ title: "x", category: "technique", targetBpm: 401 })).toEqual([
      topicErrors.targetBpm,
    ]);
    expect(errors({ title: "x", category: "technique", targetBpm: 400 })).toEqual([]);
  });

  it("AC-11: default block minutes are 5–60 and priority is 1–3", () => {
    expect(errors({ title: "x", category: "technique", defaultBlockMinutes: 4 })).toEqual([
      topicErrors.blockMinutes,
    ]);
    expect(errors({ title: "x", category: "technique", defaultBlockMinutes: 61 })).toEqual([
      topicErrors.blockMinutes,
    ]);
    expect(
      createTopicSchema.safeParse({ title: "x", category: "technique", priority: 4 }).success,
    ).toBe(false);
  });

  it("AC-13: an update can change the status to any of the four", () => {
    for (const status of ["new", "active", "maintenance", "archived"]) {
      expect(updateTopicSchema.safeParse({ status }).success).toBe(true);
    }
    expect(updateTopicSchema.safeParse({ status: "done" }).success).toBe(false);
  });
});
