import type { InferResponseType } from "hono/client";
import type { api } from "@/lib/api";

export type SessionView = InferResponseType<(typeof api.sessions)[":id"]["$get"], 200>["session"];
export type SessionBlock = SessionView["blocks"][number];

export interface BlockLog {
  cleanBpm: number | null;
  rating: number | null;
  notes: string;
}

export type SessionOp =
  | { kind: "pause"; at: string }
  | { kind: "resume"; at: string }
  | { kind: "extend"; blockId: string }
  | {
      kind: "complete";
      blockId: string;
      action: "complete" | "skip";
      endedAt: string;
      nextStartsAt: string;
      log: BlockLog;
    }
  | { kind: "finish"; notes: string };
