import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { at, sessionView } from "./fixtures";
import { createPracticeStore, type QueuedOp, type SendResult } from "./store";
import type { SessionView } from "./types";

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup(responses: (SendResult | Error)[] = []) {
  const storage = memoryStorage();
  const sent: QueuedOp[] = [];
  const server = { session: sessionView() as SessionView };
  const send = vi.fn(async (queued: QueuedOp): Promise<SendResult> => {
    sent.push(queued);
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return next ?? { ok: true, session: server.session };
  });
  const fetchSession = vi.fn(async () => server.session);
  const store = createPracticeStore({ send, fetchSession, storage });
  store.load(sessionView());
  return { store, storage, sent, send, fetchSession, server };
}

const complete = {
  kind: "complete" as const,
  blockId: "b1",
  action: "complete" as const,
  endedAt: at(300),
  nextStartsAt: at(310),
  log: { cleanBpm: 80, rating: 5, notes: "" },
};

describe("practice store", () => {
  it("AC-15: applies a write at once and sends writes in order", async () => {
    const { store, sent } = setup();
    store.dispatch({ kind: "pause", at: at(100) });
    store.dispatch({ kind: "resume", at: at(150) });
    expect(store.getState().session?.pausedSeconds).toBe(50);
    await vi.runAllTimersAsync();
    expect(sent.map((queued) => queued.op.kind)).toEqual(["pause", "resume"]);
    expect(store.getState().pending).toBe(0);
  });

  it("AC-15: offline, it keeps the entry, says so, moves on and retries until it gets through", async () => {
    const { store, sent } = setup([new TypeError("Failed to fetch"), { ok: false, retry: true }]);
    store.dispatch(complete);
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getState()).toMatchObject({ offline: true, pending: 1 });
    expect(store.getState().session?.blocks[1]?.startedAt).toBe(at(310));

    await vi.advanceTimersByTimeAsync(1_000);
    expect(store.getState().offline).toBe(true);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(store.getState()).toMatchObject({ offline: false, pending: 0 });
    expect(sent).toHaveLength(3);
  });

  it("AC-15: nothing logged is lost when the app reloads while offline", async () => {
    const { store, storage } = setup([new TypeError("offline")]);
    store.dispatch(complete);
    await vi.advanceTimersByTimeAsync(0);

    const sent: QueuedOp[] = [];
    const reloaded = createPracticeStore({
      send: async (queued) => {
        sent.push(queued);
        return { ok: true, session: sessionView() };
      },
      fetchSession: async () => sessionView(),
      storage,
    });
    expect(reloaded.getState()).toMatchObject({ pending: 1 });
    expect(reloaded.getState().session?.blocks[0]?.cleanBpm).toBe(80);
    reloaded.load(sessionView());
    expect(reloaded.getState().session?.blocks[0]?.cleanBpm).toBe(80);
    await reloaded.flush();
    expect(sent.map((queued) => queued.op)).toEqual([complete]);
  });

  it("drops a write the server rejects and resyncs from the server", async () => {
    const { store, fetchSession, server } = setup([{ ok: false, retry: false }]);
    server.session = sessionView({ pausedSeconds: 7 });
    store.dispatch({ kind: "pause", at: at(100) });
    await vi.runAllTimersAsync();
    expect(fetchSession).toHaveBeenCalledWith("s1");
    expect(store.getState()).toMatchObject({ pending: 0, offline: false });
    expect(store.getState().session?.pausedSeconds).toBe(7);
  });

  it("takes the server's state once everything is sent", async () => {
    const { store, server } = setup();
    server.session = sessionView({ notes: "del servidor" });
    store.dispatch({ kind: "extend", blockId: "b1" });
    await vi.runAllTimersAsync();
    expect(store.getState().session?.notes).toBe("del servidor");
  });
});
