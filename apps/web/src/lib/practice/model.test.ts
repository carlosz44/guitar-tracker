import { describe, expect, it } from "vitest";
import { at, sessionView } from "./fixtures";
import { applyOp, progress } from "./model";

const now = (seconds: number) => Date.parse(at(seconds));

describe("progress", () => {
  it("AC-6: elapsed and remaining come from timestamps alone, so a reload shows the same time", () => {
    const session = sessionView();
    expect(progress(session, now(120))).toMatchObject({
      index: 0,
      elapsed: 120,
      remaining: 180,
      totalElapsed: 120,
    });
    const reloaded = JSON.parse(JSON.stringify(session));
    expect(progress(reloaded, now(120))).toEqual(progress(session, now(120)));
  });

  it("AC-10: past zero, the remaining time stops at 0 and overtime counts up", () => {
    expect(progress(sessionView(), now(345))).toMatchObject({ remaining: 0, overtime: 45 });
  });

  it("AC-8: while paused, time stands still at the pause", () => {
    const paused = applyOp(sessionView(), { kind: "pause", at: at(100) });
    expect(progress(paused, now(500))).toMatchObject({
      elapsed: 100,
      paused: true,
      totalElapsed: 100,
    });
    const resumed = applyOp(paused, { kind: "resume", at: at(160) });
    expect(progress(resumed, now(200))).toMatchObject({
      elapsed: 140,
      paused: false,
      totalElapsed: 140,
    });
  });
});

describe("applyOp", () => {
  it("AC-11: completing records actual seconds without pauses, saves the log and starts the next block", () => {
    const paused = applyOp(applyOp(sessionView(), { kind: "pause", at: at(60) }), {
      kind: "resume",
      at: at(90),
    });
    const done = applyOp(paused, {
      kind: "complete",
      blockId: "b1",
      action: "complete",
      endedAt: at(330),
      nextStartsAt: at(345),
      log: { cleanBpm: 70, rating: 4, notes: "Bien" },
    });
    expect(done.blocks[0]).toMatchObject({
      endedAt: at(330),
      actualSeconds: 300,
      cleanBpm: 70,
      rating: 4,
      notes: "Bien",
    });
    expect(done.blocks[1]?.startedAt).toBe(at(345));
    expect(progress(done, now(400))).toMatchObject({ index: 1, elapsed: 55 });
  });

  it("AC-9: +5 min adds five minutes to the block", () => {
    expect(
      applyOp(sessionView(), { kind: "extend", blockId: "b1" }).blocks[0]?.plannedSeconds,
    ).toBe(600);
  });

  it("knows when every block is done", () => {
    let session = applyOp(sessionView(), {
      kind: "complete",
      blockId: "b1",
      action: "complete",
      endedAt: at(300),
      nextStartsAt: at(300),
      log: { cleanBpm: null, rating: null, notes: "" },
    });
    session = applyOp(session, {
      kind: "complete",
      blockId: "b2",
      action: "skip",
      endedAt: at(900),
      nextStartsAt: at(900),
      log: { cleanBpm: null, rating: null, notes: "" },
    });
    expect(progress(session, now(901)).finishedBlocks).toBe(true);
  });
});
