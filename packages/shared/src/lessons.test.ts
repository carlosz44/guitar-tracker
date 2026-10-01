import { describe, expect, it } from "vitest";
import { createLessonSchema, lessonErrors, lessonTopicLinksSchema } from "./lessons.ts";

const topicA = "0190f0e0-0000-7000-8000-00000000000a";
const topicB = "0190f0e0-0000-7000-8000-00000000000b";

describe("createLessonSchema", () => {
  it("AC-1: needs a date and a title; the rest is optional", () => {
    expect(createLessonSchema.parse({ date: "2026-10-01", title: "Dórico" })).toEqual({
      date: "2026-10-01",
      title: "Dórico",
      rawNotes: "",
      summary: "",
      practicePoints: [],
      homework: "",
    });
  });

  it("AC-1: rejects a blank title and an invalid date with their keys", () => {
    const parsed = createLessonSchema.safeParse({ date: "2026-13-40", title: "  " });
    expect(parsed.success ? [] : parsed.error.issues.map((issue) => issue.message)).toEqual([
      lessonErrors.date,
      lessonErrors.title,
    ]);
  });

  it("AC-1: keeps practice points as a trimmed list", () => {
    const parsed = createLessonSchema.parse({
      date: "2026-10-01",
      title: "Dórico",
      practicePoints: ["  Tríadas en 1–3 ", "Arpegios"],
    });
    expect(parsed.practicePoints).toEqual(["Tríadas en 1–3", "Arpegios"]);
  });
});

describe("lessonTopicLinksSchema", () => {
  it("AC-15: accepts each topic once with a relation", () => {
    expect(
      lessonTopicLinksSchema.safeParse([
        { topicId: topicA, relation: "introduced" },
        { topicId: topicB, relation: "reviewed" },
      ]).success,
    ).toBe(true);
  });

  it("AC-15: rejects the same topic twice", () => {
    const parsed = lessonTopicLinksSchema.safeParse([
      { topicId: topicA, relation: "introduced" },
      { topicId: topicA, relation: "extended" },
    ]);
    expect(parsed.success ? null : parsed.error.issues[0]?.message).toBe(
      lessonErrors.duplicateTopic,
    );
  });
});
