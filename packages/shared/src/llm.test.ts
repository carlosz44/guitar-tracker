import { describe, expect, it } from "vitest";
import {
  lessonDraftPayloadSchema,
  lessonEnrichmentOutputSchema,
  lessonSectionValueSchemas,
  suggestedTopicSchema,
} from "./llm.ts";

const newTopic = {
  ref: "n1",
  kind: "new",
  topicId: null,
  title: "Tríadas de dórico",
  category: "chords_arpeggios",
  parentRef: null,
  description: "",
  practicePoints: ["Cuerdas 1–3"],
  successCriteria: "",
  targetBpm: 90,
  relation: "introduced",
} as const;

describe("lesson draft schemas", () => {
  it("a new topic needs a category; an existing one needs its id", () => {
    expect(suggestedTopicSchema.safeParse(newTopic).success).toBe(true);
    expect(suggestedTopicSchema.safeParse({ ...newTopic, category: null }).success).toBe(false);
    expect(suggestedTopicSchema.safeParse({ ...newTopic, kind: "existing" }).success).toBe(false);
    expect(
      suggestedTopicSchema.safeParse({
        ...newTopic,
        kind: "existing",
        topicId: "0199a000-0000-7000-8000-000000000001",
      }).success,
    ).toBe(true);
  });

  it("AC-4: model output is checked against the stricter payload schema", () => {
    const output = {
      title: "",
      summary: "Resumen",
      practicePoints: [],
      homework: "",
      topics: [],
      answers: [],
      questions: [],
    };
    expect(lessonEnrichmentOutputSchema.safeParse(output).success).toBe(true);
    expect(lessonDraftPayloadSchema.safeParse(output).success).toBe(false);
    expect(lessonDraftPayloadSchema.safeParse({ ...output, title: "Modo dórico" }).success).toBe(
      true,
    );
  });

  it("AC-6: edited topic lists carry a checked flag", () => {
    expect(
      lessonSectionValueSchemas.topics.safeParse([{ ...newTopic, checked: true }]).success,
    ).toBe(true);
    expect(lessonSectionValueSchemas.topics.safeParse([newTopic]).success).toBe(false);
  });
});
