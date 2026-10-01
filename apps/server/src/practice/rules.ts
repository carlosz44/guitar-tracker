import { BLOCK_STEP_SECONDS, todayIn, WARM_UP_SECONDS } from "@ds/shared";

export function practiceDate(instant: Date, timezone: string) {
  return todayIn(timezone, instant);
}

export function addDays(date: string, days: number) {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
}

export function isoWeekday(date: string) {
  return ((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
}

export function cycleStart(date: string, lessonWeekday: number) {
  return addDays(date, -((isoWeekday(date) - lessonWeekday + 7) % 7));
}

export interface DayTotal {
  seconds: number;
  targetMinutes: number | null;
}

export function isMet(seconds: number, targetMinutes: number | null) {
  return targetMinutes !== null && seconds >= targetMinutes * 60;
}

export function streak(
  days: ReadonlyMap<string, DayTotal>,
  today: string,
  todayTargetMinutes: number,
) {
  const metOn = (date: string) => {
    const day = days.get(date);
    if (!day) return false;
    return isMet(day.seconds, date === today ? todayTargetMinutes : day.targetMinutes);
  };
  let date = metOn(today) ? today : addDays(today, -1);
  let count = 0;
  while (metOn(date)) {
    count += 1;
    date = addDays(date, -1);
  }
  return count;
}

export interface SuggestionTopic {
  id: string;
  status: "new" | "active" | "maintenance" | "archived";
  priority: number;
  title: string;
  lastPracticedDate: string | null;
  createdAt: Date;
}

export interface SuggestionInput<T extends SuggestionTopic> {
  targetMinutes: number;
  latestLesson: { date: string; topicIds: readonly string[] } | null;
  topics: readonly T[];
}

const byPriorityThenTitle = (a: SuggestionTopic, b: SuggestionTopic) =>
  b.priority - a.priority || a.title.localeCompare(b.title);
const leastRecent = (a: SuggestionTopic, b: SuggestionTopic) =>
  (a.lastPracticedDate ?? "").localeCompare(b.lastPracticedDate ?? "");

export function pickTopics<T extends SuggestionTopic>(
  { latestLesson, topics }: SuggestionInput<T>,
  count = 2,
) {
  const picked: T[] = [];
  const add = (candidates: T[]) => {
    for (const topic of candidates) {
      if (picked.length >= count) return;
      if (!picked.includes(topic)) picked.push(topic);
    }
  };

  if (latestLesson) {
    const linked = new Set(latestLesson.topicIds);
    add(
      topics
        .filter(
          (topic) =>
            linked.has(topic.id) &&
            (topic.status === "new" || topic.status === "active") &&
            (topic.lastPracticedDate === null || topic.lastPracticedDate < latestLesson.date),
        )
        .sort(byPriorityThenTitle),
    );
  }
  add(
    topics
      .filter((topic) => topic.status === "active")
      .sort((a, b) => b.priority - a.priority || leastRecent(a, b)),
  );
  add(
    topics
      .filter((topic) => topic.status === "new" && topic.lastPracticedDate === null)
      .sort((a, b) => b.priority - a.priority || a.createdAt.getTime() - b.createdAt.getTime()),
  );
  if (picked.length < count) {
    add(topics.filter((topic) => topic.status === "maintenance").sort(leastRecent));
  }
  return picked;
}

export function splitMinutes(totalMinutes: number, parts: number) {
  if (parts === 0) return [];
  const steps = Math.max(0, Math.floor((totalMinutes * 60) / BLOCK_STEP_SECONDS));
  const each = Math.floor(steps / parts);
  const extra = steps % parts;
  return Array.from(
    { length: parts },
    (_, index) => ((each + (index < extra ? 1 : 0)) * BLOCK_STEP_SECONDS) / 60,
  );
}

export function suggestBlocks<T extends SuggestionTopic>(input: SuggestionInput<T>) {
  const warmUpMinutes = WARM_UP_SECONDS / 60;
  const picked = pickTopics(input);
  const minutes = splitMinutes(input.targetMinutes - warmUpMinutes, picked.length);
  return {
    warmUpMinutes,
    topics: picked
      .map((topic, index) => ({ topic, minutes: minutes[index] ?? 0 }))
      .filter((entry) => entry.minutes > 0),
  };
}

export function splitManual(totalSeconds: number, given: readonly (number | null | undefined)[]) {
  const fixed = given.reduce<number>((sum, seconds) => sum + (seconds ?? 0), 0);
  const open = given.filter((seconds) => seconds == null).length;
  const remaining = Math.max(0, totalSeconds - fixed);
  const each = open ? Math.floor(remaining / open) : 0;
  let leftover = open ? remaining - each * open : 0;
  return given.map((seconds) => {
    if (seconds != null) return seconds;
    const share = each + leftover;
    leftover = 0;
    return share;
  });
}
