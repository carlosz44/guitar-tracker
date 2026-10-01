import { MAX_TOPICS_PER_DAY, type TopicStatus, WARM_UP_SECONDS } from "@ds/shared";
import { es } from "../i18n/es";
import { addDays, isoWeekday, splitMinutes } from "../practice/rules";

export interface TargetSettings {
  dailyTargetMinutes: number;
  dayTargets: readonly number[] | null;
}

export function dayTarget(settings: TargetSettings, date: string) {
  return settings.dayTargets?.[isoWeekday(date) - 1] ?? settings.dailyTargetMinutes;
}

export function cycleDates(cycleStart: string) {
  return Array.from({ length: 7 }, (_, index) => addDays(cycleStart, index));
}

export interface PlannerTopic {
  id: string;
  title: string;
  status: TopicStatus;
  priority: number;
  lastPracticedDate: string | null;
  recentRatings: readonly number[];
}

export type ScoreReason = "priority" | "stale" | "lesson" | "lowRating" | "maintenance" | "missed";

export interface ScoredTopic {
  topic: PlannerTopic;
  score: number;
  reasons: ScoreReason[];
}

export interface ScoreContext {
  today: string;
  lessonTopicIds: ReadonlySet<string>;
  missedTopicIds?: ReadonlySet<string>;
}

const STALE_CAP_DAYS = 14;
const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

export function scoreTopics(topics: readonly PlannerTopic[], context: ScoreContext): ScoredTopic[] {
  return topics
    .filter((topic) => topic.status !== "archived")
    .map((topic) => {
      const reasons: ScoreReason[] = ["priority"];
      let score = topic.priority;
      if (topic.status === "maintenance") {
        score *= 0.3;
        reasons.push("maintenance");
      }
      const idle = topic.lastPracticedDate
        ? Math.min(STALE_CAP_DAYS, Math.max(0, daysBetween(topic.lastPracticedDate, context.today)))
        : STALE_CAP_DAYS;
      score += idle / 7;
      if (idle >= 7) reasons.push("stale");
      if (context.lessonTopicIds.has(topic.id)) {
        score += 3;
        reasons.push("lesson");
      }
      const ratings = topic.recentRatings.slice(0, 3);
      if (ratings.length > 0 && ratings.reduce((a, b) => a + b, 0) / ratings.length < 3) {
        score += 1.5;
        reasons.push("lowRating");
      }
      if (context.missedTopicIds?.has(topic.id)) {
        score += 2;
        reasons.push("missed");
      }
      return { topic, score, reasons };
    })
    .sort((a, b) => b.score - a.score || a.topic.title.localeCompare(b.topic.title));
}

export interface PlanDayInput {
  date: string;
  targetMinutes: number;
}

export interface PlannedItem {
  topicId: string | null;
  label: string | null;
  minutes: number;
}

export interface PlannedDay extends PlanDayInput {
  items: PlannedItem[];
}

export interface BuildOptions {
  lessonTopicIds: ReadonlySet<string>;
  maxDaysPerTopic?: number;
  usesSoFar?: ReadonlyMap<string, number>;
  previousDayTopicIds?: ReadonlySet<string>;
}

const WARM_UP_MINUTES = WARM_UP_SECONDS / 60;

export function topicsPerDay(restMinutes: number) {
  if (restMinutes < 5) return 0;
  const byLength = restMinutes <= 15 ? 1 : restMinutes <= 40 ? 2 : 3;
  return Math.min(byLength, MAX_TOPICS_PER_DAY, Math.floor(restMinutes / 5));
}

export function buildDays(
  scored: readonly ScoredTopic[],
  days: readonly PlanDayInput[],
  options: BuildOptions,
): PlannedDay[] {
  const maxDays = options.maxDaysPerTopic ?? 5;
  const uses = new Map(options.usesSoFar);
  const slots = days.map(() => [] as ScoredTopic[]);
  const caps = days.map((day) => topicsPerDay(day.targetMinutes - WARM_UP_MINUTES));
  const usesOf = (id: string) => uses.get(id) ?? 0;
  const place = (index: number, entry: ScoredTopic) => {
    const slot = slots[index];
    if (!slot || slot.length >= (caps[index] ?? 0)) return false;
    if (slot.some((placed) => placed.topic.id === entry.topic.id)) return false;
    if (usesOf(entry.topic.id) >= maxDays) return false;
    slot.push(entry);
    uses.set(entry.topic.id, usesOf(entry.topic.id) + 1);
    return true;
  };

  const lessonTopics = scored.filter((entry) => options.lessonTopicIds.has(entry.topic.id));
  const half = Math.ceil(days.length / 2);
  lessonTopics.forEach((entry, order) => {
    for (const offset of [0, half]) {
      if (usesOf(entry.topic.id) >= 2) break;
      for (let probe = 0; probe < days.length; probe++) {
        if (place((order + offset + probe) % days.length, entry)) break;
      }
    }
  });

  days.forEach((_, index) => {
    const previous =
      index === 0
        ? (options.previousDayTopicIds ?? new Set<string>())
        : new Set((slots[index - 1] ?? []).map((entry) => entry.topic.id));
    while ((slots[index]?.length ?? 0) < (caps[index] ?? 0)) {
      const best = scored
        .filter(
          (entry) =>
            usesOf(entry.topic.id) < maxDays &&
            !slots[index]?.some((placed) => placed.topic.id === entry.topic.id),
        )
        .map((entry) => ({
          entry,
          adjusted:
            entry.score - 1.5 * usesOf(entry.topic.id) - (previous.has(entry.topic.id) ? 1 : 0),
        }))
        .sort((a, b) => b.adjusted - a.adjusted)[0];
      if (!best) break;
      place(index, best.entry);
    }
  });

  return days.map((day, index) => {
    const picked = [...(slots[index] ?? [])].sort((a, b) => b.score - a.score);
    const minutes = splitMinutes(day.targetMinutes - WARM_UP_MINUTES, picked.length);
    return {
      ...day,
      items: [
        { topicId: null, label: es.plan.warmUp, minutes: WARM_UP_MINUTES },
        ...picked.map((entry, i) => ({
          topicId: entry.topic.id,
          label: null,
          minutes: minutes[i] ?? 0,
        })),
      ].filter((item) => item.minutes > 0),
    };
  });
}

export type PlanProblem =
  | "unknown_day"
  | "duplicate_day"
  | "unknown_topic"
  | "too_many_topics"
  | "duplicate_topic"
  | "bad_minutes"
  | "missing_topic_or_label"
  | "wrong_total";

export function validatePlanDays(
  days: readonly { date: string; items: readonly PlannedItem[] }[],
  context: { targets: ReadonlyMap<string, number>; topicIds: ReadonlySet<string> },
): { ok: true } | { ok: false; problem: PlanProblem; date: string } {
  const seen = new Set<string>();
  for (const day of days) {
    const fail = (problem: PlanProblem) => ({ ok: false as const, problem, date: day.date });
    const target = context.targets.get(day.date);
    if (target === undefined) return fail("unknown_day");
    if (seen.has(day.date)) return fail("duplicate_day");
    seen.add(day.date);
    const topicIds = day.items.flatMap((item) => (item.topicId ? [item.topicId] : []));
    if (topicIds.length > MAX_TOPICS_PER_DAY) return fail("too_many_topics");
    if (new Set(topicIds).size !== topicIds.length) return fail("duplicate_topic");
    for (const item of day.items) {
      if (!item.topicId && !item.label?.trim()) return fail("missing_topic_or_label");
      if (item.topicId && !context.topicIds.has(item.topicId)) return fail("unknown_topic");
      if (!Number.isInteger(item.minutes) || item.minutes < 5 || item.minutes % 5 !== 0) {
        return fail("bad_minutes");
      }
    }
    const total = day.items.reduce((sum, item) => sum + item.minutes, 0);
    if (topicIds.length > 0 && total !== target) return fail("wrong_total");
  }
  return { ok: true };
}

export function replanContext(
  pastDays: readonly {
    date: string;
    plannedTopicIds: readonly string[];
    practicedTopicIds: readonly string[];
  }[],
) {
  const missed = new Set<string>();
  const uses = new Map<string, number>();
  for (const day of pastDays) {
    const practiced = new Set(day.practicedTopicIds);
    for (const id of practiced) uses.set(id, (uses.get(id) ?? 0) + 1);
    for (const id of day.plannedTopicIds) if (!practiced.has(id)) missed.add(id);
  }
  for (const id of uses.keys()) missed.delete(id);
  return { missed, uses };
}
