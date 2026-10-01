import { describe, expect, it } from "vitest";
import { createQuestionSchema, questionErrors, updateQuestionSchema } from "./questions.ts";

describe("question schemas", () => {
  it("AC-16: a question needs text and may name a topic", () => {
    expect(createQuestionSchema.parse({ text: "¿Digitación del compás 3?" })).toEqual({
      text: "¿Digitación del compás 3?",
      topicId: null,
    });
    expect(createQuestionSchema.safeParse({ text: " " }).success).toBe(false);
  });

  it("AC-17: answering needs the answer text; dismissing doesn't", () => {
    const parsed = updateQuestionSchema.safeParse({ status: "answered" });
    expect(parsed.success ? null : parsed.error.issues[0]?.message).toBe(questionErrors.answer);
    expect(
      updateQuestionSchema.safeParse({ status: "answered", answer: "Con 1-2-4" }).success,
    ).toBe(true);
    expect(updateQuestionSchema.safeParse({ status: "dismissed" }).success).toBe(true);
  });
});
