export const TOPIC_ID = "0190f0e0-0000-7000-8000-0000000000b1";
export const PARENT_ID = "0190f0e0-0000-7000-8000-0000000000b0";

const base = {
  description: "",
  practicePoints: [],
  successCriteria: "",
  targetBpm: null,
  defaultBlockMinutes: 10,
  parentId: null,
  createdAt: "2026-10-01T20:00:00.000Z",
  updatedAt: "2026-10-01T20:00:00.000Z",
};

export const topicList = {
  topics: [
    {
      ...base,
      id: PARENT_ID,
      title: "Modo dórico",
      category: "scales_modes",
      status: "active",
      priority: 3,
      parent: null,
    },
    {
      ...base,
      id: TOPIC_ID,
      title: "Tríadas de dórico",
      category: "chords_arpeggios",
      status: "new",
      priority: 2,
      parentId: PARENT_ID,
      parent: { id: PARENT_ID, title: "Modo dórico" },
    },
    {
      ...base,
      id: "c3",
      title: "Cromática",
      category: "technique",
      status: "maintenance",
      priority: 1,
      parent: null,
    },
    {
      ...base,
      id: "c4",
      title: "Escala de blues",
      category: "scales_modes",
      status: "archived",
      priority: 2,
      parent: null,
    },
  ],
};

export function topicDetail(overrides: Record<string, unknown> = {}) {
  return {
    topic: {
      ...base,
      id: TOPIC_ID,
      title: "Tríadas de dórico",
      category: "chords_arpeggios",
      status: "new",
      priority: 2,
      description: "En **A**",
      practicePoints: ["Cuerdas 1–3"],
      successCriteria: "3 veces limpias a 90",
      targetBpm: 90,
      parentId: PARENT_ID,
    },
    parent: { id: PARENT_ID, title: "Modo dórico" },
    children: [{ id: "child", title: "Inversiones", status: "new" }],
    lessons: [{ id: "l1", date: "2026-10-01", title: "Clase de dórico", relation: "introduced" }],
    openQuestions: [{ id: "q1", text: "¿Qué digitación uso?" }],
    ...overrides,
  };
}
