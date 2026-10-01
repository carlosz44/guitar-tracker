import { useSyncExternalStore } from "react";
import { api, ensureOk } from "@/lib/api";
import { syncClock } from "./clock";
import { createPracticeStore, type QueuedOp, type SendResult } from "./store";
import type { SessionView } from "./types";

async function toResult(
  request: () => Promise<Response & { json(): Promise<unknown> }>,
): Promise<SendResult> {
  const startedAt = Date.now();
  const response = await request();
  if (response.ok) {
    const { session } = (await response.json()) as { session: SessionView };
    syncClock(session.serverNow, startedAt);
    return { ok: true, session };
  }
  return {
    ok: false,
    retry: response.status >= 500 || response.status === 401 || response.status === 408,
  };
}

function send({ sessionId, op }: QueuedOp): Promise<SendResult> {
  const param = { id: sessionId };
  switch (op.kind) {
    case "pause":
      return toResult(() => api.sessions[":id"].pause.$post({ param, json: { at: op.at } }));
    case "resume":
      return toResult(() => api.sessions[":id"].resume.$post({ param, json: { at: op.at } }));
    case "extend":
      return toResult(() =>
        api.sessions[":id"].blocks[":blockId"].$patch({
          param: { id: sessionId, blockId: op.blockId },
          json: { action: "extend" },
        }),
      );
    case "complete":
      return toResult(() =>
        api.sessions[":id"].blocks[":blockId"].$patch({
          param: { id: sessionId, blockId: op.blockId },
          json: {
            action: op.action,
            endedAt: op.endedAt,
            nextStartsAt: op.nextStartsAt,
            cleanBpm: op.log.cleanBpm,
            rating: op.log.rating,
            notes: op.log.notes,
          },
        }),
      );
    case "finish":
      return toResult(() => api.sessions[":id"].finish.$post({ param, json: { notes: op.notes } }));
  }
}

async function fetchSession(sessionId: string) {
  const startedAt = Date.now();
  const { session } = await (
    await ensureOk(await api.sessions[":id"].$get({ param: { id: sessionId } }))
  ).json();
  syncClock(session.serverNow, startedAt);
  return session;
}

export const practiceStore = createPracticeStore({
  send,
  fetchSession,
  storage: typeof localStorage === "undefined" ? undefined : localStorage,
});

if (typeof window !== "undefined") {
  window.addEventListener("online", () => void practiceStore.flush());
}

export function usePractice() {
  return useSyncExternalStore(practiceStore.subscribe, practiceStore.getState);
}

export { fetchSession };
