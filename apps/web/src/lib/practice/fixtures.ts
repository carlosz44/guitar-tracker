import type { SessionView } from "./types";

export const T0 = "2026-10-01T16:00:00.000Z";
export const at = (seconds: number) => new Date(Date.parse(T0) + seconds * 1000).toISOString();

export function sessionView(overrides: Partial<SessionView> = {}): SessionView {
  return {
    id: "s1",
    status: "in_progress",
    source: "timer",
    practiceDate: "2026-10-01",
    startedAt: T0,
    endedAt: null,
    pausedAt: null,
    pausedSeconds: 0,
    notes: "",
    serverNow: T0,
    blocks: [
      {
        id: "b1",
        position: 0,
        topicId: null,
        label: "Calentamiento",
        title: "Calentamiento",
        targetBpm: null,
        lastCleanBpm: null,
        plannedSeconds: 300,
        startedAt: T0,
        endedAt: null,
        pausedSeconds: 0,
        actualSeconds: null,
        cleanBpm: null,
        rating: null,
        notes: "",
      },
      {
        id: "b2",
        position: 1,
        topicId: "t1",
        label: null,
        title: "Tríadas de dórico",
        targetBpm: 90,
        lastCleanBpm: 80,
        plannedSeconds: 900,
        startedAt: null,
        endedAt: null,
        pausedSeconds: 0,
        actualSeconds: null,
        cleanBpm: null,
        rating: null,
        notes: "",
      },
    ],
    ...overrides,
  };
}
