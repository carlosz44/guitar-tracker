import { describe, expect, it } from "vitest";
import {
  addDays,
  cycleStart,
  type DayTotal,
  isMet,
  practiceDate,
  type SuggestionTopic,
  splitManual,
  splitMinutes,
  streak,
  suggestBlocks,
} from "./rules";

const LIMA = "America/Lima";

describe("practiceDate", () => {
  it("AC-20: is the local date in Lima when the session starts", () => {
    expect(practiceDate(new Date("2026-10-01T16:00:00Z"), LIMA)).toBe("2026-10-01");
    expect(practiceDate(new Date("2026-10-02T02:00:00Z"), LIMA)).toBe("2026-10-01");
  });

  it("AC-20: a session started at 23:50 that ends after midnight counts for the day it started", () => {
    const started = new Date("2026-10-02T04:50:00Z");
    const ended = new Date("2026-10-02T05:20:00Z");
    expect(practiceDate(started, LIMA)).toBe("2026-10-01");
    expect(practiceDate(ended, LIMA)).toBe("2026-10-02");
  });
});

describe("cycleStart", () => {
  it("AC-20: the cycle starts on the most recent lesson weekday on or before the date", () => {
    expect(cycleStart("2026-10-01", 4)).toBe("2026-10-01");
    expect(cycleStart("2026-10-07", 4)).toBe("2026-10-01");
    expect(cycleStart("2026-10-08", 4)).toBe("2026-10-08");
    expect(cycleStart("2026-09-30", 4)).toBe("2026-09-24");
  });

  it("AC-20: works for any lesson weekday, across month and year ends", () => {
    expect(cycleStart("2027-01-02", 1)).toBe("2026-12-28");
    expect(cycleStart("2026-10-04", 7)).toBe("2026-10-04");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("today's minutes and the daily target", () => {
  it("AC-20: a day is met when its minutes reach that day's target", () => {
    expect(isMet(30 * 60, 30)).toBe(true);
    expect(isMet(30 * 60 - 1, 30)).toBe(false);
    expect(isMet(10_000, null)).toBe(false);
  });
});

describe("streak", () => {
  const day = (minutes: number, targetMinutes: number | null = 30): DayTotal => ({
    seconds: minutes * 60,
    targetMinutes,
  });

  it("AC-20: counts consecutive met days ending today when today is met", () => {
    const days = new Map([
      ["2026-09-29", day(30)],
      ["2026-09-30", day(45)],
      ["2026-10-01", day(30)],
    ]);
    expect(streak(days, "2026-10-01", 30)).toBe(3);
  });

  it("AC-20: ends yesterday while today's target isn't met yet", () => {
    const days = new Map([
      ["2026-09-29", day(30)],
      ["2026-09-30", day(30)],
      ["2026-10-01", day(10)],
    ]);
    expect(streak(days, "2026-10-01", 30)).toBe(2);
  });

  it("AC-20: a day under its own snapshot target breaks the streak; today uses the current target", () => {
    const days = new Map([
      ["2026-09-28", day(60)],
      ["2026-09-29", day(40, 60)],
      ["2026-09-30", day(30)],
      ["2026-10-01", day(20)],
    ]);
    expect(streak(days, "2026-10-01", 20)).toBe(2);
    expect(streak(days, "2026-10-01", 30)).toBe(1);
  });

  it("is zero with no practice", () => {
    expect(streak(new Map(), "2026-10-01", 30)).toBe(0);
  });
});

describe("suggestBlocks", () => {
  let id = 0;
  const topic = (values: Partial<SuggestionTopic>): SuggestionTopic => ({
    id: `t${++id}`,
    status: "active",
    priority: 2,
    title: `Tema ${id}`,
    lastPracticedDate: null,
    createdAt: new Date(`2026-09-${String(id).padStart(2, "0")}T00:00:00Z`),
    ...values,
  });

  it("AC-2: a 5-minute warm-up, then 2 topics splitting the rest in 5-minute steps (25 → 15 + 10)", () => {
    const a = topic({ priority: 3 });
    const b = topic({});
    const result = suggestBlocks({ targetMinutes: 30, latestLesson: null, topics: [a, b] });
    expect(result.warmUpMinutes).toBe(5);
    expect(result.topics.map((entry) => [entry.topic.id, entry.minutes])).toEqual([
      [a.id, 15],
      [b.id, 10],
    ]);
  });

  it("AC-2: latest-lesson topics not practiced since that lesson come first", () => {
    const fromLesson = topic({ status: "new", priority: 1 });
    const practicedSince = topic({ priority: 3, lastPracticedDate: "2026-10-02" });
    const highActive = topic({ priority: 3, lastPracticedDate: "2026-09-20" });
    const result = suggestBlocks({
      targetMinutes: 30,
      latestLesson: { date: "2026-10-01", topicIds: [fromLesson.id, practicedSince.id] },
      topics: [highActive, practicedSince, fromLesson],
    });
    expect(result.topics.map((entry) => entry.topic.id)).toEqual([fromLesson.id, highActive.id]);
  });

  it("AC-2: then active topics by priority, then least recently practiced", () => {
    const low = topic({ priority: 1 });
    const recent = topic({ priority: 3, lastPracticedDate: "2026-09-30" });
    const stale = topic({ priority: 3, lastPracticedDate: "2026-09-10" });
    const result = suggestBlocks({
      targetMinutes: 30,
      latestLesson: null,
      topics: [low, recent, stale],
    });
    expect(result.topics.map((entry) => entry.topic.id)).toEqual([stale.id, recent.id]);
  });

  it("falls back to never-practiced new topics from older lessons before maintenance (Carlos's choice)", () => {
    const maintenance = topic({ status: "maintenance" });
    const forgotten = topic({ status: "new" });
    const result = suggestBlocks({
      targetMinutes: 30,
      latestLesson: null,
      topics: [maintenance, forgotten],
    });
    expect(result.topics.map((entry) => entry.topic.id)).toEqual([forgotten.id, maintenance.id]);
  });

  it("AC-2: maintenance topics only fill in when fewer than 2 were found", () => {
    const a = topic({});
    const b = topic({});
    const maintenance = topic({ status: "maintenance" });
    expect(
      suggestBlocks({
        targetMinutes: 30,
        latestLesson: null,
        topics: [maintenance, a, b],
      }).topics.map((entry) => entry.topic.id),
    ).toEqual([a.id, b.id]);
  });

  it("AC-2: never suggests archived topics; with no topics, only the warm-up", () => {
    const archived = topic({ status: "archived" });
    expect(
      suggestBlocks({ targetMinutes: 30, latestLesson: null, topics: [archived] }).topics,
    ).toEqual([]);
  });

  it("AC-2: a single topic takes the whole rest; small targets drop topics that get no time", () => {
    expect(splitMinutes(25, 1)).toEqual([25]);
    expect(splitMinutes(40, 2)).toEqual([20, 20]);
    expect(splitMinutes(5, 2)).toEqual([5, 0]);
    const a = topic({});
    const b = topic({});
    expect(
      suggestBlocks({ targetMinutes: 10, latestLesson: null, topics: [a, b] }).topics,
    ).toHaveLength(1);
  });
});

describe("splitManual", () => {
  it("AC-17: splits the duration evenly when per-topic minutes are omitted, remainder to the first", () => {
    expect(splitManual(35 * 60, [null, null])).toEqual([1050, 1050]);
    expect(splitManual(10 * 60 + 1, [null, null, null])).toEqual([201, 200, 200]);
  });

  it("AC-17: keeps given minutes and shares what's left among the rest", () => {
    expect(splitManual(30 * 60, [10 * 60, null, null])).toEqual([600, 600, 600]);
    expect(splitManual(30 * 60, [20 * 60, 10 * 60])).toEqual([1200, 600]);
  });
});
