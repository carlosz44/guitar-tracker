import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { es } from "@/i18n/es";
import { at, sessionView, T0 } from "@/lib/practice/fixtures";
import { applyOp } from "@/lib/practice/model";
import type { SessionView } from "@/lib/practice/types";
import {
  carlos,
  emptyToday,
  fakeApi,
  json,
  type RecordedRequest,
  renderApp,
} from "@/test/render-app";

let server: SessionView;
let failWrites = false;

function sessionApi({ method, path, body }: RecordedRequest) {
  const b = body as Record<string, unknown> | undefined;
  if (path === "/api/today") {
    return json({
      ...emptyToday,
      activeSession: server.status === "in_progress" || failWrites ? { id: "s1" } : null,
    });
  }
  if (!path.startsWith("/api/sessions/s1")) return undefined;
  if (method !== "GET" && failWrites) throw new TypeError("Failed to fetch");
  if (method === "POST" && path.endsWith("/pause"))
    server = applyOp(server, { kind: "pause", at: String(b?.at) });
  if (method === "POST" && path.endsWith("/resume"))
    server = applyOp(server, { kind: "resume", at: String(b?.at) });
  if (method === "POST" && path.endsWith("/finish"))
    server = applyOp(server, { kind: "finish", notes: String(b?.notes ?? "") });
  if (method === "PATCH") {
    const blockId = path.split("/").at(-1) ?? "";
    server =
      b?.action === "extend"
        ? applyOp(server, { kind: "extend", blockId })
        : applyOp(server, {
            kind: "complete",
            blockId,
            action: b?.action as "complete",
            endedAt: String(b?.endedAt),
            nextStartsAt: String(b?.nextStartsAt),
            log: {
              cleanBpm: (b?.cleanBpm as number) ?? null,
              rating: (b?.rating as number) ?? null,
              notes: String(b?.notes ?? ""),
            },
          });
  }
  return json({ session: { ...server, serverNow: new Date().toISOString() } });
}

function questionApi({ method, path }: RecordedRequest) {
  if (method === "GET" && path === "/api/topics")
    return json({ topics: [{ id: "t1", title: "Tríadas de dórico", status: "active" }] });
  if (method === "POST" && path === "/api/questions") return json({ question: {} }, 201);
  return undefined;
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ["Date"] });
  vi.setSystemTime(new Date(T0));
  server = sessionView();
  failWrites = false;
});
afterEach(() => vi.useRealTimers());

const user = () => userEvent.setup();
const setTime = (seconds: number) => act(() => vi.setSystemTime(new Date(at(seconds))));

async function open() {
  const api = fakeApi({ me: carlos, handlers: [sessionApi, questionApi] });
  const view = renderApp("/practice/s1");
  await screen.findByTestId("practice-screen");
  return { ...api, ...view };
}

async function logCurrentBlock(log?: (sheet: HTMLElement) => Promise<void>) {
  await user().click(screen.getByRole("button", { name: es.practice.skip }));
  const sheet = await screen.findByRole("dialog");
  await log?.(sheet);
  await user().click(within(sheet).getByRole("button", { name: es.blockLog.save }));
}

describe("practice screen", () => {
  it("AC-5: shows the current block, a countdown, the next block and total time, without the nav bar", async () => {
    await open();
    expect(screen.getByTestId("block-title").textContent).toBe("Calentamiento");
    expect(screen.getByTestId("countdown").textContent).toBe("05:00");
    expect(screen.getByTestId("next-block").textContent).toBe(
      es.practice.next("Tríadas de dórico"),
    );
    expect(screen.getByTestId("total-elapsed").textContent).toBe(es.practice.total("00:00"));
    expect(screen.queryByTestId("bottom-nav")).toBeNull();
  });

  it("AC-5: shows the topic's target and last clean BPM", async () => {
    await open();
    await logCurrentBlock();
    await waitFor(() =>
      expect(screen.getByTestId("block-title").textContent).toBe("Tríadas de dórico"),
    );
    expect(screen.getByTestId("bpm-info").textContent).toBe(
      `${es.practice.targetBpm(90)} · ${es.practice.lastBpm(80)}`,
    );
    expect(screen.getByTestId("next-block").textContent).toBe(es.practice.lastBlock);
  });

  it("AC-6: time comes from timestamps, so reopening mid-block shows the right time", async () => {
    vi.setSystemTime(new Date(at(125)));
    const { unmount } = await open();
    await waitFor(() => expect(screen.getByTestId("countdown").textContent).toBe("02:55"));
    unmount();
    vi.setSystemTime(new Date(at(200)));
    await open();
    await waitFor(() => expect(screen.getByTestId("countdown").textContent).toBe("01:40"));
    expect(screen.getByTestId("total-elapsed").textContent).toBe(es.practice.total("03:20"));
  });

  it("AC-8: pausing freezes the clock and survives reopening", async () => {
    const { requests, unmount } = await open();
    setTime(60);
    await user().click(screen.getByRole("button", { name: es.practice.pause }));
    expect(await screen.findByText(es.practice.paused)).toBeTruthy();
    setTime(200);
    await waitFor(() => expect(screen.getByTestId("countdown").textContent).toBe("04:00"));
    await waitFor(() =>
      expect(requests.some((r) => r.path === "/api/sessions/s1/pause")).toBe(true),
    );
    unmount();

    await open();
    expect(screen.getByText(es.practice.paused)).toBeTruthy();
    await user().click(screen.getByRole("button", { name: es.practice.resume }));
    setTime(260);
    await waitFor(() => expect(screen.getByTestId("countdown").textContent).toBe("03:00"));
  });

  it("AC-9: +5 min extends the block", async () => {
    const { requests } = await open();
    await user().click(screen.getByRole("button", { name: es.practice.extend }));
    await waitFor(() => expect(screen.getByTestId("countdown").textContent).toBe("10:00"));
    await waitFor(() =>
      expect(requests.find((r) => r.method === "PATCH")?.body).toEqual({ action: "extend" }),
    );
  });

  it("AC-10: at zero the whole screen turns the accent colour with an overtime counter, and nothing advances", async () => {
    await open();
    setTime(330);
    await waitFor(() => expect(screen.getByTestId("practice-screen").dataset.timeUp).toBe("true"));
    expect(screen.getByText(es.practice.timeUp)).toBeTruthy();
    expect(screen.getByTestId("overtime").textContent).toBe(es.practice.overtime("00:30"));
    expect(screen.getByTestId("block-title").textContent).toBe("Calentamiento");
    expect(screen.getByRole("button", { name: es.practice.logAndContinue })).toBeTruthy();
  });

  it("AC-11: the log prefills BPM from the last clean BPM, then the target, then 60", async () => {
    await open();
    await user().click(screen.getByRole("button", { name: es.practice.skip }));
    expect(within(await screen.findByRole("dialog")).getByTestId("bpm-value").textContent).toBe(
      "—",
    );
    await user().click(
      within(screen.getByRole("dialog")).getByRole("button", { name: es.blockLog.save }),
    );
    await waitFor(() =>
      expect(screen.getByTestId("block-title").textContent).toBe("Tríadas de dórico"),
    );
    await user().click(screen.getByRole("button", { name: es.practice.skip }));
    expect(within(await screen.findByRole("dialog")).getByTestId("bpm-value").textContent).toBe(
      "80",
    );
  });

  it("AC-11: saves BPM (±5), rating and note with the time the block ended, and starts the next block", async () => {
    server = sessionView({
      blocks: sessionView().blocks.map((block, index) =>
        index === 0 ? { ...block, topicId: "t9", lastCleanBpm: null, targetBpm: 70 } : block,
      ),
    });
    const { requests } = await open();
    setTime(320);
    await user().click(await screen.findByRole("button", { name: es.practice.logAndContinue }));
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByTestId("bpm-value").textContent).toBe("70");
    await user().click(within(sheet).getByRole("button", { name: es.blockLog.more }));
    await user().click(within(sheet).getByRole("button", { name: es.blockLog.rate(4) }));
    await user().type(within(sheet).getByLabelText(es.blockLog.note), "Limpio");
    setTime(340);
    await user().click(within(sheet).getByRole("button", { name: es.blockLog.save }));

    await waitFor(() =>
      expect(requests.find((r) => r.method === "PATCH")?.body).toEqual({
        action: "complete",
        endedAt: expect.stringMatching(new RegExp(`^${at(320).slice(0, 19)}`)),
        nextStartsAt: expect.stringMatching(new RegExp(`^${at(340).slice(0, 19)}`)),
        cleanBpm: 75,
        rating: 4,
        notes: "Limpio",
      }),
    );
    expect(screen.getByTestId("block-title").textContent).toBe("Tríadas de dórico");
  });

  it("AC-12: 'Anotar pregunta' links the question to the current topic without leaving the session", async () => {
    const { requests, router } = await open();
    await logCurrentBlock();
    await user().click(await screen.findByRole("button", { name: es.practice.question }));
    const dialog = await screen.findByRole("dialog");
    await user().type(within(dialog).getByLabelText(es.questions.text), "¿Cuerdas al aire?");
    await user().click(within(dialog).getByRole("button", { name: es.questions.save }));
    await waitFor(() =>
      expect(requests.find((r) => r.path === "/api/questions")?.body).toEqual({
        text: "¿Cuerdas al aire?",
        topicId: "t1",
      }),
    );
    expect(router.state.location.pathname).toBe("/practice/s1");
  });

  it("AC-13: after the last block, a summary and Terminar complete the session", async () => {
    const { requests, router } = await open();
    setTime(300);
    await logCurrentBlock();
    setTime(1200);
    await logCurrentBlock(async (sheet) => {
      await user().click(within(sheet).getByRole("button", { name: es.blockLog.rate(5) }));
    });
    expect(await screen.findByRole("heading", { name: es.summary.title })).toBeTruthy();
    expect(screen.getByText(es.summary.total(20))).toBeTruthy();
    expect(screen.getByText(es.summary.bpm("Tríadas de dórico", 80))).toBeTruthy();
    await user().type(screen.getByLabelText(es.summary.note), "Buen día");
    await user().click(screen.getByRole("button", { name: es.summary.finish }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/today"));
    await waitFor(() =>
      expect(requests.find((r) => r.path === "/api/sessions/s1/finish")?.body).toEqual({
        notes: "Buen día",
      }),
    );
  });

  it("AC-13: Terminar while offline returns to Hoy without offering to continue the finished session", async () => {
    await open();
    setTime(300);
    await logCurrentBlock();
    await logCurrentBlock();
    await screen.findByRole("heading", { name: es.summary.title });
    failWrites = true;
    server = { ...server, id: "s1" };
    await user().click(screen.getByRole("button", { name: es.summary.finish }));
    expect(await screen.findByRole("button", { name: es.today.start })).toBeTruthy();
    expect(screen.queryByRole("link", { name: es.today.continue })).toBeNull();
    failWrites = false;
  });

  it("AC-15: when a save fails it says so, keeps the entry and still moves on", async () => {
    await open();
    failWrites = true;
    await logCurrentBlock();
    expect(await screen.findByText(es.practice.offline)).toBeTruthy();
    expect(screen.getByTestId("block-title").textContent).toBe("Tríadas de dórico");
    failWrites = false;
  });
});

describe("wake lock", () => {
  afterEach(() => {
    delete (navigator as { wakeLock?: unknown }).wakeLock;
  });

  it("AC-7: keeps the screen awake while a block runs and asks again when the page is visible again", async () => {
    const request = vi.fn(async () => ({ release: vi.fn(async () => undefined) }));
    Object.defineProperty(navigator, "wakeLock", { value: { request }, configurable: true });
    await open();
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(es.practice.wakeTip)).toBeNull();
  });

  it("AC-7: without Wake Lock, shows a dismissible tip about Auto-Lock", async () => {
    const { unmount } = await open();
    expect(await screen.findByText(es.practice.wakeTip)).toBeTruthy();
    await user().click(screen.getByRole("button", { name: es.practice.dismiss }));
    expect(screen.queryByText(es.practice.wakeTip)).toBeNull();
    unmount();
    await open();
    expect(screen.queryByText(es.practice.wakeTip)).toBeNull();
  });
});
