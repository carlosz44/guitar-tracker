import type { LessonDraftPayload } from "@ds/shared";
import { LESSON_ID } from "./lesson-fixtures";

export const DRAFT_ID = "0190f0e0-0000-7000-8000-0000000000d1";
export const QUESTION_ID = "0190f0e0-0000-7000-8000-0000000000e1";
export const EXISTING_TOPIC_ID = "0190f0e0-0000-7000-8000-0000000000c1";

export const lessonPayload: LessonDraftPayload = {
  title: "Modo dórico en tríadas",
  summary: "Vimos **tríadas** del modo dórico.",
  practicePoints: ["Tríadas en cuerdas 1–3", "Metrónomo a 80"],
  homework: "Grabar el riff a 90.",
  topics: [
    {
      ref: "n1",
      kind: "new",
      topicId: null,
      title: "Arpegios menores",
      category: "chords_arpeggios",
      parentRef: null,
      description: "Arpegios de tres notas.",
      practicePoints: ["Cuerdas 2–4"],
      successCriteria: "Limpio a 80",
      targetBpm: 80,
      relation: "introduced",
    },
    {
      ref: EXISTING_TOPIC_ID,
      kind: "existing",
      topicId: EXISTING_TOPIC_ID,
      title: "Modo dórico",
      category: null,
      parentRef: null,
      description: "",
      practicePoints: [],
      successCriteria: "",
      targetBpm: null,
      relation: "extended",
    },
  ],
  answers: [{ questionId: QUESTION_ID, answer: "La digitación 1-2-4." }],
  questions: [{ text: "¿Púa alternada en tríadas?", topicRef: "n1" }],
};

const pendingReview = Object.fromEntries(
  ["title", "summary", "practicePoints", "homework", "topics", "answers", "questions"].map(
    (section) => [section, { state: "pending" }],
  ),
);

export function draftView(overrides: Record<string, unknown> = {}) {
  return {
    id: DRAFT_ID,
    kind: "lesson_enrichment",
    subjectType: "lesson",
    subjectId: LESSON_ID,
    status: "pending",
    error: null,
    instruction: "",
    payload: lessonPayload,
    review: pendingReview,
    skippedFiles: [],
    current: {
      title: "Modo dórico",
      summary: "Dórico en *A*",
      practicePoints: ["Tríadas en cuerdas 1–3"],
      homework: "",
      status: "final",
      questions: [{ id: QUESTION_ID, text: "¿Qué digitación uso?", status: "open" }],
      topics: [{ id: EXISTING_TOPIC_ID, title: "Modo dórico" }],
    },
    ...overrides,
  };
}
