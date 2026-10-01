export const PLAN_ID = "0190f0e0-0000-7000-8000-0000000000f1";
const T1 = "0190f0e0-0000-7000-8000-0000000000b1";
const T2 = "0190f0e0-0000-7000-8000-0000000000b2";
export const TOPICS = [
  { id: T1, title: "Tríadas de dórico" },
  { id: T2, title: "Escala menor melódica" },
];

const dates = [
  "2026-10-01",
  "2026-10-02",
  "2026-10-03",
  "2026-10-04",
  "2026-10-05",
  "2026-10-06",
  "2026-10-07",
];

export function planView(
  overrides: Record<string, unknown> = {},
  dayOverrides: (i: number) => Record<string, unknown> = () => ({}),
) {
  return {
    id: PLAN_ID,
    cycleStart: "2026-10-01",
    cycleEnd: "2026-10-07",
    status: "draft",
    ended: false,
    weekNote: "Semana para asentar las tríadas.",
    source: "claude",
    llmStatus: "done",
    llmError: null,
    days: dates.map((date, i) => ({
      id: `day-${i + 1}`,
      date,
      targetMinutes: 30,
      focusNote: i === 0 ? "Tríadas limpias a 80" : "",
      past: false,
      today: i === 0,
      minutesPracticed: 0,
      items: [
        {
          id: `w${i}`,
          topicId: null,
          label: "Calentamiento",
          title: "Calentamiento",
          targetBpm: null,
          minutes: 5,
          practiced: false,
        },
        {
          id: `a${i}`,
          topicId: T1,
          label: null,
          title: "Tríadas de dórico",
          targetBpm: 90,
          minutes: 15,
          practiced: false,
        },
        {
          id: `b${i}`,
          topicId: i % 2 ? null : T2,
          label: i % 2 ? "Libre" : null,
          title: i % 2 ? "Libre" : "Escala menor melódica",
          targetBpm: null,
          minutes: 10,
          practiced: false,
        },
      ],
      ...dayOverrides(i),
    })),
    ...overrides,
  };
}
