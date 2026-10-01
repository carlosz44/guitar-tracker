import { BLOCK_STEP_SECONDS } from "@ds/shared";
import type { SessionOp, SessionView } from "./types";

const ms = (iso: string | null) => (iso ? Date.parse(iso) : 0);
const seconds = (millis: number) => Math.max(0, Math.floor(millis / 1000));

export function currentIndex(session: SessionView) {
  return session.blocks.findIndex((block) => block.startedAt && !block.endedAt);
}

export interface Progress {
  index: number;
  elapsed: number;
  remaining: number;
  overtime: number;
  totalElapsed: number;
  paused: boolean;
  finishedBlocks: boolean;
}

export function progress(session: SessionView, now: number): Progress {
  const clockAt = session.pausedAt
    ? ms(session.pausedAt)
    : session.endedAt
      ? ms(session.endedAt)
      : now;
  const index = currentIndex(session);
  const block = session.blocks[index];
  const elapsed = block ? seconds(clockAt - ms(block.startedAt)) - block.pausedSeconds : 0;
  const remaining = block ? block.plannedSeconds - Math.max(0, elapsed) : 0;
  return {
    index,
    elapsed: Math.max(0, elapsed),
    remaining: Math.max(0, remaining),
    overtime: Math.max(0, -remaining),
    totalElapsed: Math.max(0, seconds(clockAt - ms(session.startedAt)) - session.pausedSeconds),
    paused: Boolean(session.pausedAt),
    finishedBlocks: index === -1 && session.blocks.every((candidate) => candidate.endedAt),
  };
}

function resumeAt(session: SessionView, at: string): SessionView {
  if (!session.pausedAt) return session;
  const span = seconds(Math.max(ms(at), ms(session.pausedAt)) - ms(session.pausedAt));
  const index = currentIndex(session);
  return {
    ...session,
    pausedAt: null,
    pausedSeconds: session.pausedSeconds + span,
    blocks: session.blocks.map((block, i) =>
      i === index ? { ...block, pausedSeconds: block.pausedSeconds + span } : block,
    ),
  };
}

export function applyOp(session: SessionView, op: SessionOp): SessionView {
  switch (op.kind) {
    case "pause":
      return session.pausedAt ? session : { ...session, pausedAt: op.at };
    case "resume":
      return resumeAt(session, op.at);
    case "extend":
      return {
        ...session,
        blocks: session.blocks.map((block) =>
          block.id === op.blockId
            ? { ...block, plannedSeconds: block.plannedSeconds + BLOCK_STEP_SECONDS }
            : block,
        ),
      };
    case "complete": {
      const resumed = resumeAt(session, op.endedAt);
      const index = resumed.blocks.findIndex((block) => block.id === op.blockId);
      const block = resumed.blocks[index];
      if (!block?.startedAt || block.endedAt) return resumed;
      const actualSeconds = Math.max(
        0,
        seconds(ms(op.endedAt) - ms(block.startedAt)) - block.pausedSeconds,
      );
      return {
        ...resumed,
        blocks: resumed.blocks.map((candidate, i) => {
          if (i === index) {
            return { ...candidate, endedAt: op.endedAt, actualSeconds, ...op.log };
          }
          if (i === index + 1) return { ...candidate, startedAt: op.nextStartsAt };
          return candidate;
        }),
      };
    }
    case "finish":
      return { ...session, status: "completed", notes: op.notes };
  }
}
