export const LESSON_ID = "0190f0e0-0000-7000-8000-0000000000a1";

export function lessonDetail(overrides: Record<string, unknown> = {}) {
  return {
    lesson: {
      id: LESSON_ID,
      date: "2026-10-01",
      title: "Modo dórico",
      rawNotes: "Notas de **clase**",
      summary: "Dórico en *A*",
      practicePoints: ["Tríadas en cuerdas 1–3", "Arpegios"],
      homework: "Tríadas a 90 BPM",
      status: "final",
      source: "web",
      createdAt: "2026-10-01T20:00:00.000Z",
      updatedAt: "2026-10-01T20:00:00.000Z",
    },
    draft: null,
    cyclePlan: { cycleStart: "2026-10-01", ended: false, plan: null },
    topics: {
      introduced: [
        { id: "t1", title: "Tríadas de dórico", category: "chords_arpeggios", status: "new" },
      ],
      extended: [{ id: "t2", title: "Modo dórico", category: "scales_modes", status: "active" }],
      reviewed: [],
    },
    files: [
      {
        id: "f1",
        lessonId: LESSON_ID,
        kind: "guitar_pro",
        originalName: "triadas.gp",
        sizeBytes: 20480,
        uploadStatus: "uploaded",
        extractionStatus: "done",
        extractionError: null,
        duplicateOf: null,
        createdAt: "2026-10-01T20:00:00.000Z",
      },
      {
        id: "f2",
        lessonId: LESSON_ID,
        kind: "pdf",
        originalName: "ejercicios.pdf",
        sizeBytes: 3_145_728,
        uploadStatus: "uploaded",
        extractionStatus: "not_applicable",
        extractionError: null,
        duplicateOf: null,
        createdAt: "2026-10-01T20:00:00.000Z",
      },
      {
        id: "f3",
        lessonId: LESSON_ID,
        kind: "docx",
        originalName: "notas.docx",
        sizeBytes: 9000,
        uploadStatus: "uploaded",
        extractionStatus: "done",
        extractionError: null,
        duplicateOf: null,
        createdAt: "2026-10-01T20:00:00.000Z",
      },
    ],
    isLatest: true,
    openQuestionsCount: 2,
    openQuestions: [],
    ...overrides,
  };
}

export const lessonList = {
  lessons: [
    {
      id: LESSON_ID,
      date: "2026-10-01",
      title: "Modo dórico",
      status: "final",
      fileCount: 3,
      topicCount: 2,
    },
    {
      id: "0190f0e0-0000-7000-8000-0000000000a0",
      date: "2026-09-24",
      title: "Jónico",
      status: "final",
      fileCount: 0,
      topicCount: 1,
    },
  ],
};
