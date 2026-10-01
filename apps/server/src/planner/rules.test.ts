import { describe, expect, it } from "vitest";
import {
  buildDays,
  cycleDates,
  dayTarget,
  type PlannerTopic,
  replanContext,
  scoreTopics,
  topicsPerDay,
  validatePlanDays,
} from "./rules";

const TODAY = "2026-10-01";
let n = 0;
const topic = (values: Partial<PlannerTopic> = {}): PlannerTopic => ({
  id: `t${++n}`,
  title: `Tema ${n}`,
  status: "active",
  priority: 2,
  lastPracticedDate: TODAY,
  recentRatings: [],
  ...values,
});
const none = new Set<string>();
const ids = (scored: { topic: PlannerTopic }[]) => scored.map((entry) => entry.topic.id);
const week = (target = 30) => cycleDates(TODAY).map((date) => ({ date, targetMinutes: target }));
const topicIdsOf = (day: { items: { topicId: string | null }[] }) =>
  day.items.flatMap((item) => (item.topicId ? [item.topicId] : []));

describe("dayTarget", () => {
  it("AC-1: uses the weekday's target, or the daily target when none is set", () => {
    const settings = { dailyTargetMinutes: 30, dayTargets: [30, 30, 30, 30, 30, 45, 60] };
    expect(dayTarget(settings, "2026-10-04")).toBe(60);
    expect(dayTarget(settings, "2026-10-03")).toBe(45);
    expect(dayTarget({ dailyTargetMinutes: 40, dayTargets: null }, "2026-10-04")).toBe(40);
  });
});

describe("scoreTopics", () => {
  it("AC-3: higher priority ranks first, maintenance ranks low and archived is left out", () => {
    const high = topic({ priority: 3 });
    const low = topic({ priority: 1 });
    const maintenance = topic({ priority: 3, status: "maintenance" });
    const archived = topic({ status: "archived" });
    expect(
      ids(scoreTopics([low, maintenance, archived, high], { today: TODAY, lessonTopicIds: none })),
    ).toEqual([high.id, low.id, maintenance.id]);
  });

  it("AC-3: the longer since last practiced, the higher, capped at two weeks", () => {
    const recent = topic({ lastPracticedDate: "2026-09-30" });
    const stale = topic({ lastPracticedDate: "2026-09-10" });
    const never = topic({ lastPracticedDate: null });
    const scored = scoreTopics([recent, stale, never], { today: TODAY, lessonTopicIds: none });
    expect(ids(scored)[2]).toBe(recent.id);
    expect(scored.find((entry) => entry.topic.id === stale.id)?.score).toBe(
      scored.find((entry) => entry.topic.id === never.id)?.score,
    );
  });

  it("AC-3: boosts the cycle's lesson topics and topics with low recent ratings", () => {
    const plain = topic({ priority: 3 });
    const fromLesson = topic({ priority: 1 });
    const struggling = topic({ priority: 2, recentRatings: [2, 3, 2, 5] });
    const scored = scoreTopics([plain, fromLesson, struggling], {
      today: TODAY,
      lessonTopicIds: new Set([fromLesson.id]),
    });
    expect(ids(scored)[0]).toBe(fromLesson.id);
    expect(scored.find((entry) => entry.topic.id === struggling.id)?.reasons).toContain(
      "lowRating",
    );
    expect(scored.find((entry) => entry.topic.id === struggling.id)?.score).toBeGreaterThan(
      scored.find((entry) => entry.topic.id === plain.id)?.score ?? 0,
    );
  });

  it("AC-11: topics missed on past days rank higher when replanning", () => {
    const a = topic({ priority: 3 });
    const missed = topic({ priority: 2 });
    expect(
      ids(
        scoreTopics([a, missed], {
          today: TODAY,
          lessonTopicIds: none,
          missedTopicIds: new Set([missed.id]),
        }),
      )[0],
    ).toBe(missed.id);
  });
});

describe("buildDays", () => {
  it("AC-2: a 5-minute warm-up and 1–3 topics filling each day's target in 5-minute steps", () => {
    expect([15, 20, 30, 45, 60].map((target) => topicsPerDay(target - 5))).toEqual([1, 1, 2, 2, 3]);
    const topics = Array.from({ length: 6 }, () => topic());
    const targets = [20, 30, 30, 30, 30, 45, 60];
    const days = buildDays(
      scoreTopics(topics, { today: TODAY, lessonTopicIds: none }),
      cycleDates(TODAY).map((date, i) => ({ date, targetMinutes: targets[i] ?? 30 })),
      { lessonTopicIds: none },
    );
    for (const day of days) {
      expect(day.items[0]).toEqual({ topicId: null, label: "Calentamiento", minutes: 5 });
      expect(day.items.reduce((sum, item) => sum + item.minutes, 0)).toBe(day.targetMinutes);
      expect(day.items.every((item) => item.minutes % 5 === 0)).toBe(true);
      expect(topicIdsOf(day).length).toBeGreaterThanOrEqual(1);
      expect(topicIdsOf(day).length).toBeLessThanOrEqual(3);
    }
  });

  it("AC-3: places each lesson topic at least twice, no topic on more than 5 days or twice in a day", () => {
    const lesson = [topic({ priority: 1 }), topic({ priority: 1 })];
    const others = [topic({ priority: 3 }), topic({ priority: 3 }), topic({ priority: 3 })];
    const lessonIds = new Set(lesson.map((t) => t.id));
    const days = buildDays(
      scoreTopics([...lesson, ...others], { today: TODAY, lessonTopicIds: lessonIds }),
      week(60),
      { lessonTopicIds: lessonIds },
    );
    const count = (id: string) => days.filter((day) => topicIdsOf(day).includes(id)).length;
    for (const t of lesson) expect(count(t.id)).toBeGreaterThanOrEqual(2);
    for (const t of [...lesson, ...others]) expect(count(t.id)).toBeLessThanOrEqual(5);
    for (const day of days) expect(new Set(topicIdsOf(day)).size).toBe(topicIdsOf(day).length);
  });

  it("AC-15: fewer topics than slots repeats topics within the limits; no topics leaves only the warm-up", () => {
    const single = topic();
    const days = buildDays(
      scoreTopics([single], { today: TODAY, lessonTopicIds: none }),
      week(30),
      {
        lessonTopicIds: none,
      },
    );
    expect(days.filter((day) => topicIdsOf(day).includes(single.id))).toHaveLength(5);
    expect(days.every((day) => day.items.reduce((s, i) => s + i.minutes, 0) <= 30)).toBe(true);

    const empty = buildDays([], week(30), { lessonTopicIds: none });
    expect(
      empty.every((day) => day.items.length === 1 && day.items[0]?.label === "Calentamiento"),
    ).toBe(true);
  });

  it("AC-15: uneven targets split in 5-minute steps, extra minutes to the top-scored topic", () => {
    const [a, b] = [topic({ priority: 3 }), topic({ priority: 1 })];
    const [day] = buildDays(
      scoreTopics([a, b], { today: TODAY, lessonTopicIds: none }),
      [{ date: TODAY, targetMinutes: 35 }],
      { lessonTopicIds: none },
    );
    expect(day?.items.map((item) => item.minutes)).toEqual([5, 15, 15]);
    const [odd] = buildDays(
      scoreTopics([a, b], { today: TODAY, lessonTopicIds: none }),
      [{ date: TODAY, targetMinutes: 40 }],
      { lessonTopicIds: none },
    );
    expect(odd?.items.map((item) => item.minutes)).toEqual([5, 20, 15]);
  });

  it("AC-15: a cycle with no lesson still fills every day", () => {
    const days = buildDays(
      scoreTopics([topic(), topic(), topic()], { today: TODAY, lessonTopicIds: none }),
      week(30),
      { lessonTopicIds: none },
    );
    expect(days.every((day) => topicIdsOf(day).length === 2)).toBe(true);
  });
});

describe("validatePlanDays", () => {
  const targets = new Map([[TODAY, 30]]);
  const owned = new Set(["a", "b", "c", "d"]);
  const warm = { topicId: null, label: "Calentamiento", minutes: 5 };
  const check = (
    items: { topicId: string | null; label: string | null; minutes: number }[],
    date = TODAY,
  ) => validatePlanDays([{ date, items }], { targets, topicIds: owned });

  it("AC-4: accepts a day whose minutes add up with up to 3 known topics", () => {
    expect(
      check([
        warm,
        { topicId: "a", label: null, minutes: 15 },
        { topicId: "b", label: null, minutes: 10 },
      ]),
    ).toEqual({
      ok: true,
    });
  });

  it("AC-4: rejects unknown topics, wrong totals, more than 3 topics and odd minutes", () => {
    const t = (id: string, minutes: number) => ({ topicId: id, label: null, minutes });
    expect(check([warm, t("zzz", 25)])).toMatchObject({ ok: false, problem: "unknown_topic" });
    expect(check([warm, t("a", 20)])).toMatchObject({ ok: false, problem: "wrong_total" });
    expect(check([warm, t("a", 5), t("b", 5), t("c", 5), t("d", 10)])).toMatchObject({
      ok: false,
      problem: "too_many_topics",
    });
    expect(check([warm, t("a", 12), t("b", 13)])).toMatchObject({
      ok: false,
      problem: "bad_minutes",
    });
    expect(check([warm, t("a", 25)], "2026-12-25")).toMatchObject({
      ok: false,
      problem: "unknown_day",
    });
  });
});

describe("replanContext", () => {
  it("AC-11: topics planned on past days but never practiced this cycle count as missed", () => {
    const { missed, uses } = replanContext([
      { date: "2026-10-01", plannedTopicIds: ["a", "b"], practicedTopicIds: ["a"] },
      { date: "2026-10-02", plannedTopicIds: ["c"], practicedTopicIds: [] },
      { date: "2026-10-03", plannedTopicIds: ["d"], practicedTopicIds: ["b"] },
    ]);
    expect([...missed].sort()).toEqual(["c", "d"]);
    expect(Object.fromEntries(uses)).toEqual({ a: 1, b: 1 });
  });
});
