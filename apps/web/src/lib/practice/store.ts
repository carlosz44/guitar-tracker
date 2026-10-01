import { applyOp } from "./model";
import type { SessionOp, SessionView } from "./types";

const SESSION_KEY = "ds.activeSession";
const OUTBOX_KEY = "ds.outbox";
const RETRY_DELAYS = [1_000, 2_000, 5_000, 10_000, 30_000];

export interface QueuedOp {
  id: string;
  sessionId: string;
  op: SessionOp;
}

export interface PracticeState {
  session: SessionView | null;
  pending: number;
  offline: boolean;
}

export type SendResult = { ok: true; session: SessionView } | { ok: false; retry: boolean };

export interface StoreDeps {
  send: (queued: QueuedOp) => Promise<SendResult>;
  fetchSession: (sessionId: string) => Promise<SessionView | null>;
  storage?: Pick<Storage, "getItem" | "setItem" | "removeItem">;
}

function read<T>(storage: StoreDeps["storage"], key: string, fallback: T): T {
  try {
    const raw = storage?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

let counter = 0;

export function createPracticeStore(deps: StoreDeps) {
  const storage = deps.storage;
  let outbox = read<QueuedOp[]>(storage, OUTBOX_KEY, []);
  let state: PracticeState = {
    session: read<SessionView | null>(storage, SESSION_KEY, null),
    pending: outbox.length,
    offline: false,
  };
  const listeners = new Set<() => void>();
  let flushing = false;
  let failures = 0;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;

  const persist = () => {
    try {
      if (state.session) storage?.setItem(SESSION_KEY, JSON.stringify(state.session));
      else storage?.removeItem(SESSION_KEY);
      storage?.setItem(OUTBOX_KEY, JSON.stringify(outbox));
    } catch {}
  };

  const set = (next: Partial<PracticeState>) => {
    state = { ...state, ...next, pending: outbox.length };
    persist();
    for (const listener of listeners) listener();
  };

  const withPending = (session: SessionView) =>
    outbox
      .filter((queued) => queued.sessionId === session.id)
      .reduce((current, queued) => applyOp(current, queued.op), session);

  const scheduleRetry = () => {
    clearTimeout(retryTimer);
    const delay = RETRY_DELAYS[Math.min(failures, RETRY_DELAYS.length - 1)] ?? 30_000;
    failures += 1;
    retryTimer = setTimeout(() => void flush(), delay);
  };

  async function flush() {
    if (flushing) return;
    flushing = true;
    try {
      while (outbox.length > 0) {
        const queued = outbox[0] as QueuedOp;
        let result: SendResult;
        try {
          result = await deps.send(queued);
        } catch {
          result = { ok: false, retry: true };
        }
        if (!result.ok && result.retry) {
          set({ offline: true });
          scheduleRetry();
          return;
        }
        outbox = outbox.slice(1);
        failures = 0;
        if (result.ok) {
          if (outbox.length === 0) set({ session: result.session, offline: false });
          else set({ offline: false });
        } else {
          const fresh = await deps.fetchSession(queued.sessionId).catch(() => null);
          set({ session: fresh ? withPending(fresh) : state.session, offline: false });
        }
      }
    } finally {
      flushing = false;
    }
  }

  return {
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    load(session: SessionView) {
      set({ session: withPending(session) });
    },
    dispatch(op: SessionOp) {
      const session = state.session;
      if (!session) return;
      outbox = [...outbox, { id: `op-${Date.now()}-${++counter}`, sessionId: session.id, op }];
      set({ session: applyOp(session, op) });
      void flush();
    },
    flush,
    clear() {
      outbox = [];
      set({ session: null, offline: false });
    },
  };
}

export type PracticeStore = ReturnType<typeof createPracticeStore>;
