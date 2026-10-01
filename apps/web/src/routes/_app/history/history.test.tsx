import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { es } from "@/i18n/es";
import { formatDayRange } from "@/lib/format";
import { at, sessionView } from "@/lib/practice/fixtures";
import { todayQuery } from "@/lib/queries";
import {
  carlos,
  emptyToday,
  fakeApi,
  json,
  type RecordedRequest,
  renderApp,
} from "@/test/render-app";

const session = (id: string, minutes: number, extra: Record<string, unknown> = {}) => ({
  id,
  date: "2026-10-02",
  startedAt: "2026-10-02T23:00:00.000Z",
  source: "timer",
  status: "completed",
  seconds: minutes * 60,
  topics: ["Tríadas de dórico"],
  averageRating: 4,
  ...extra,
});

const page = {
  cycles: [
    {
      start: "2026-10-01",
      end: "2026-10-07",
      seconds: 50 * 60,
      daysPracticed: 2,
      days: [
        {
          date: "2026-10-02",
          seconds: 35 * 60,
          targetMinutes: 30,
          met: true,
          sessions: [
            session("s1", 20),
            session("s2", 15, { source: "manual", averageRating: null }),
          ],
        },
        {
          date: "2026-10-01",
          seconds: 15 * 60,
          targetMinutes: 30,
          met: false,
          sessions: [session("s3", 15)],
        },
      ],
    },
    { start: "2026-09-24", end: "2026-09-30", seconds: 0, daysPracticed: 0, days: [] },
  ],
  nextBefore: "2026-09-24",
};

const older = {
  cycles: [
    {
      start: "2026-09-17",
      end: "2026-09-23",
      seconds: 1800,
      daysPracticed: 1,
      days: [
        {
          date: "2026-09-18",
          seconds: 1800,
          targetMinutes: 30,
          met: true,
          sessions: [session("s9", 30)],
        },
      ],
    },
  ],
  nextBefore: "2026-09-17",
};

function historyApi({ method, path }: RecordedRequest) {
  if (method === "GET" && path.startsWith("/api/sessions?")) {
    return json(path.includes("before=2026-09-24") ? older : page);
  }
  return undefined;
}

const completed = sessionView({
  status: "completed",
  endedAt: at(1500),
  notes: "Buen día",
  blocks: sessionView().blocks.map((block, index) => ({
    ...block,
    startedAt: at(index * 300),
    endedAt: at(index * 300 + 300),
    actualSeconds: index === 0 ? 300 : 1200,
    cleanBpm: index === 0 ? null : 85,
    rating: index === 0 ? null : 3,
  })),
});

function sessionApi({ method, path }: RecordedRequest) {
  if (path !== "/api/sessions/s1") return undefined;
  if (method === "GET") return json({ session: completed });
  if (method === "PATCH") return json({ session: completed });
  if (method === "DELETE") return new Response(null, { status: 204 });
  return undefined;
}

describe("Historial", () => {
  it("AC-18: groups by cycle, then day, with minutes, a check when met and cycle totals", async () => {
    fakeApi({ me: carlos, handlers: [historyApi] });
    renderApp("/history");
    const cycle = await screen.findByRole("region", {
      name: es.history.cycle(formatDayRange("2026-10-01", "2026-10-07")),
    });
    expect(within(cycle).getByTestId("cycle-summary").textContent).toBe(
      es.history.cycleSummary(50, 2),
    );
    const days = within(cycle).getAllByTestId("history-day");
    expect(days).toHaveLength(2);
    const [first, second] = days as [HTMLElement, HTMLElement];
    expect(within(first).getByText(es.history.dayMinutes(35))).toBeTruthy();
    expect(within(first).getByLabelText(es.history.met)).toBeTruthy();
    expect(within(second).queryByLabelText(es.history.met)).toBeNull();
    expect(
      within(first).getByText(`${es.history.manual} · ${es.history.dayMinutes(15)}`),
    ).toBeTruthy();
    expect(screen.getByText(es.history.noPractice)).toBeTruthy();
  });

  it("AC-18: on a laptop, a table with date, minutes, topics and average rating", async () => {
    fakeApi({ me: carlos, handlers: [historyApi] });
    renderApp("/history");
    const [table] = (await screen.findAllByTestId("history-table")) as [HTMLElement];
    const [header, row, manual] = within(table).getAllByRole("row") as [
      HTMLElement,
      HTMLElement,
      HTMLElement,
    ];
    expect(
      within(header)
        .getAllByRole("columnheader")
        .map((cell) => cell.textContent),
    ).toEqual([
      es.history.columns.date,
      es.history.columns.minutes,
      es.history.columns.topics,
      es.history.columns.rating,
    ]);
    expect(
      within(row)
        .getAllByRole("cell")
        .map((cell) => cell.textContent),
    ).toEqual([
      expect.stringContaining("2"),
      es.history.dayMinutes(20),
      "Tríadas de dórico",
      es.history.rating(4),
    ]);
    expect(within(manual).getAllByRole("cell").at(-1)?.textContent).toBe("—");
  });

  it("AC-18: 'Ver ciclos anteriores' loads older cycles", async () => {
    fakeApi({ me: carlos, handlers: [historyApi] });
    renderApp("/history");
    await userEvent.click(await screen.findByRole("button", { name: es.history.more }));
    expect(
      await screen.findByRole("region", {
        name: es.history.cycle(formatDayRange("2026-09-17", "2026-09-23")),
      }),
    ).toBeTruthy();
  });

  it("shows an empty state with no practice", async () => {
    fakeApi({ me: carlos });
    renderApp("/history");
    expect(await screen.findByText(es.history.empty)).toBeTruthy();
  });
});

describe("session page", () => {
  it("AC-19: edits block minutes, BPM, rating and notes, and refreshes today", async () => {
    const { requests } = fakeApi({ me: carlos, handlers: [sessionApi, historyApi] });
    const { queryClient } = renderApp("/history/s1");
    queryClient.setQueryData(todayQuery.queryKey, emptyToday);
    const minutes = await screen.findByLabelText(es.sessionEdit.minutes("Tríadas de dórico"));
    expect((minutes as HTMLInputElement).value).toBe("20");
    await userEvent.clear(minutes);
    await userEvent.type(minutes, "25");
    const bpm = screen.getByLabelText(es.sessionEdit.bpm("Tríadas de dórico"));
    await userEvent.clear(bpm);
    await userEvent.type(bpm, "90");
    await userEvent.selectOptions(
      screen.getByLabelText(es.sessionEdit.rating("Calentamiento")),
      "5",
    );
    await userEvent.type(screen.getByLabelText(es.sessionEdit.notes("Calentamiento")), "Suelto");
    await userEvent.click(screen.getByRole("button", { name: es.sessionEdit.save }));

    await waitFor(() =>
      expect(requests.find((r) => r.method === "PATCH")?.body).toEqual({
        notes: "Buen día",
        blocks: [
          { id: "b1", actualMinutes: 5, cleanBpm: null, rating: 5, notes: "Suelto" },
          { id: "b2", actualMinutes: 25, cleanBpm: 90, rating: 3, notes: "" },
        ],
      }),
    );
    expect(await screen.findByText(es.sessionEdit.saved)).toBeTruthy();
    expect(queryClient.getQueryState(todayQuery.queryKey)?.isInvalidated).toBe(true);
  });

  it("AC-19: deletes the session after confirmation and returns to Historial", async () => {
    const { requests } = fakeApi({ me: carlos, handlers: [sessionApi, historyApi] });
    const { router } = renderApp("/history/s1");
    await userEvent.click(await screen.findByRole("button", { name: es.sessionEdit.delete }));
    const dialog = await screen.findByRole("alertdialog");
    expect(requests.some((r) => r.method === "DELETE")).toBe(false);
    await userEvent.click(
      within(dialog).getByRole("button", { name: es.sessionEdit.deleteConfirm }),
    );
    await waitFor(() => expect(router.state.location.pathname).toBe("/history"));
    expect(requests.some((r) => r.method === "DELETE" && r.path === "/api/sessions/s1")).toBe(true);
  });

  it("a running session links back to the practice screen", async () => {
    fakeApi({
      me: carlos,
      handlers: [
        ({ path }) => (path === "/api/sessions/s1" ? json({ session: sessionView() }) : undefined),
      ],
    });
    renderApp("/history/s1");
    expect(
      (await screen.findByRole("link", { name: es.sessionEdit.open })).getAttribute("href"),
    ).toBe("/practice/s1");
  });
});
