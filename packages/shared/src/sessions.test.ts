import { describe, expect, it } from "vitest";
import {
  blockActionSchema,
  manualSessionSchema,
  sessionErrors,
  startSessionSchema,
} from "./sessions.ts";

const topicId = "0190f0e0-0000-7000-8000-00000000000a";
const message = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.success ? null : result.error?.issues[0]?.message;

describe("startSessionSchema", () => {
  it("AC-3: blocks are a topic or a labelled free block, in steps of at least 5 minutes", () => {
    expect(
      startSessionSchema.safeParse({
        blocks: [
          { label: "Calentamiento", plannedSeconds: 300 },
          { topicId, plannedSeconds: 900 },
        ],
      }).success,
    ).toBe(true);
    expect(message(startSessionSchema.safeParse({ blocks: [{ plannedSeconds: 300 }] }))).toBe(
      sessionErrors.blockLabel,
    );
    expect(
      message(startSessionSchema.safeParse({ blocks: [{ topicId, plannedSeconds: 60 }] })),
    ).toBe(sessionErrors.plannedMinutes);
    expect(message(startSessionSchema.safeParse({ blocks: [] }))).toBe(sessionErrors.blocks);
  });
});

describe("blockActionSchema", () => {
  it("AC-11: completing carries optional BPM, rating, note and client timestamps", () => {
    expect(
      blockActionSchema.safeParse({
        action: "complete",
        endedAt: "2026-10-01T16:10:00.000Z",
        nextStartsAt: "2026-10-01T16:10:20.000Z",
        cleanBpm: 90,
        rating: 4,
        notes: "Limpio",
      }).success,
    ).toBe(true);
    expect(
      blockActionSchema.safeParse({ action: "complete", cleanBpm: null, rating: null }).success,
    ).toBe(true);
    expect(blockActionSchema.safeParse({ action: "skip", rating: 6 }).success).toBe(false);
    expect(blockActionSchema.safeParse({ action: "extend" }).success).toBe(true);
    expect(blockActionSchema.safeParse({ action: "rewind" }).success).toBe(false);
  });
});

describe("manualSessionSchema", () => {
  it("AC-17: takes a date, duration, topics or labels with optional minutes and BPM, and notes", () => {
    expect(
      manualSessionSchema.safeParse({
        date: "2026-10-01",
        minutes: 35,
        items: [
          { topicId, cleanBpm: 90 },
          { label: "Cromática", minutes: 10 },
        ],
        notes: "Sin app",
      }).success,
    ).toBe(true);
  });

  it("AC-17: per-topic minutes can't add up to more than the duration", () => {
    expect(
      message(
        manualSessionSchema.safeParse({
          date: "2026-10-01",
          minutes: 20,
          items: [
            { topicId, minutes: 15 },
            { label: "Cromática", minutes: 10 },
          ],
        }),
      ),
    ).toBe(sessionErrors.itemMinutes);
  });
});
