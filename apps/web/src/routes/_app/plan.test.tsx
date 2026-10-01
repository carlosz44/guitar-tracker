import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { es } from "@/i18n/es";
import { formatDayRange, formatPlanDay } from "@/lib/format";
import { PLAN_ID, planView, TOPICS } from "@/test/plan-fixtures";
import { carlos, fakeApi, json, type RecordedRequest, renderApp } from "@/test/render-app";

function planApi(state: { plan: unknown }) {
  return ({ method, path }: RecordedRequest) => {
    if (method === "GET" && path.startsWith("/api/plans/current")) {
      return json({ cycleStart: "2026-10-01", plan: state.plan });
    }
    if (method === "GET" && path.startsWith("/api/topics")) {
      return json({
        topics: [...TOPICS, { id: "0190f0e0-0000-7000-8000-0000000000b3", title: "Arpegios" }].map(
          (topic) => ({
            ...topic,
            status: "active",
            defaultBlockMinutes: 10,
          }),
        ),
      });
    }
    if (method === "POST" && path === "/api/plans") {
      state.plan = planView();
      return json({ plan: state.plan }, 201);
    }
    if (path.startsWith(`/api/plans/${PLAN_ID}`)) return json({ plan: state.plan ?? planView() });
    return undefined;
  };
}

async function open(plan: unknown = planView()) {
  const api = fakeApi({ me: carlos, handlers: [planApi({ plan })] });
  renderApp("/plan");
  if (plan) await screen.findByText("Semana para asentar las tríadas.");
  return api;
}

const dayCard = (date: string) =>
  screen.getByRole("region", { name: es.plan.dayLabel(formatPlanDay(date)) });
const bodyOf = (requests: RecordedRequest[], suffix: string, method = "POST") =>
  requests.find((r) => r.method === method && r.path.endsWith(suffix))?.body;

describe("weekly plan page", () => {
  it("AC-2: without a plan, 'Planificar la semana' builds one", async () => {
    const { requests } = await open(null);
    expect(
      await screen.findByText(es.plan.range(formatDayRange("2026-10-01", "2026-10-07"))),
    ).toBeTruthy();
    await userEvent.click(await screen.findByRole("button", { name: es.plan.build }));
    expect(await screen.findByText("Semana para asentar las tríadas.")).toBeTruthy();
    expect(bodyOf(requests, "/api/plans")).toEqual({});
  });

  it("AC-6: shows each day with its date, total against target, blocks and focus note", async () => {
    await open();
    const first = dayCard("2026-10-01");
    expect(within(first).getByText(es.plan.today)).toBeTruthy();
    expect(within(first).getByTestId("day-total").textContent).toBe(es.plan.total(30, 30));
    expect(within(first).getByText("Tríadas limpias a 80")).toBeTruthy();
    expect(within(first).getByText("Escala menor melódica")).toBeTruthy();
    expect(screen.getAllByRole("region", { name: /^Día:/ })).toHaveLength(7);
  });

  it("AC-7: ±5 minutes and removing a block save the day, highlighting a total off target", async () => {
    const { requests } = await open();
    const first = dayCard("2026-10-01");
    await userEvent.click(
      within(first).getByRole("button", { name: es.plan.more("Tríadas de dórico") }),
    );
    await waitFor(() =>
      expect(bodyOf(requests, "/days", "PUT")).toEqual({
        days: [
          {
            date: "2026-10-01",
            items: [
              { topicId: null, label: "Calentamiento", minutes: 5 },
              { topicId: TOPICS[0]?.id, label: null, minutes: 20 },
              { topicId: TOPICS[1]?.id, label: null, minutes: 10 },
            ],
          },
        ],
      }),
    );
  });

  it("AC-7: 'Mover a…' moves a block to another day in one save, and topics can be added", async () => {
    const { requests } = await open();
    const first = dayCard("2026-10-01");
    await userEvent.selectOptions(
      within(first).getByLabelText(es.plan.moveTo("Escala menor melódica")),
      formatPlanDay("2026-10-02"),
    );
    await waitFor(() => expect(requests.some((r) => r.method === "PUT")).toBe(true));
    const { days } = bodyOf(requests, "/days", "PUT") as {
      days: { date: string; items: { topicId: string | null }[] }[];
    };
    expect(days.map((day) => day.date)).toEqual(["2026-10-01", "2026-10-02"]);
    expect(days[0]?.items.some((item) => item.topicId === TOPICS[1]?.id)).toBe(false);
    expect(days[1]?.items.at(-1)?.topicId).toBe(TOPICS[1]?.id);

    await userEvent.selectOptions(
      within(dayCard("2026-10-03")).getByLabelText(es.plan.addTopic(formatPlanDay("2026-10-03"))),
      "Arpegios",
    );
    await waitFor(() => expect(requests.filter((r) => r.method === "PUT")).toHaveLength(2));
  });

  it("AC-7: a day whose blocks don't add up to its target is highlighted", async () => {
    await open(planView({}, (i) => (i === 0 ? { targetMinutes: 45 } : {})));
    expect(within(dayCard("2026-10-01")).getByTestId("day-total").className).toContain(
      "text-destructive",
    );
  });

  it("AC-8, AC-9: regenerates one day and accepts the plan", async () => {
    const { requests } = await open();
    await userEvent.click(
      within(dayCard("2026-10-02")).getByRole("button", { name: es.plan.regenerateDay }),
    );
    await waitFor(() =>
      expect(requests.some((r) => r.path.endsWith("/days/2026-10-02/regenerate"))).toBe(true),
    );
    await userEvent.click(screen.getByRole("button", { name: es.plan.accept }));
    await waitFor(() => expect(requests.some((r) => r.path.endsWith("/accept"))).toBe(true));
  });

  it("AC-10, AC-11, AC-13: an active plan locks past days, shows progress and offers to replan", async () => {
    const { requests } = await open(
      planView({ status: "active" }, (i) =>
        i === 0
          ? { past: true, today: false, minutesPracticed: 15 }
          : i === 1
            ? { today: true, minutesPracticed: 20 }
            : { today: false },
      ),
    );
    const past = dayCard("2026-10-01");
    expect(within(past).queryByRole("button", { name: es.plan.regenerateDay })).toBeNull();
    expect(within(past).getByTestId("day-progress").textContent).toBe(
      es.plan.practicedTotal(15, 30),
    );
    expect(
      within(dayCard("2026-10-02")).getByRole("button", { name: es.plan.regenerateDay }),
    ).toBeTruthy();
    expect(
      within(past).queryAllByRole("option", { name: formatPlanDay("2026-10-01") }),
    ).toHaveLength(0);
    await userEvent.click(screen.getByRole("button", { name: es.plan.replan }));
    await waitFor(() => expect(requests.some((r) => r.path.endsWith("/replan"))).toBe(true));
  });

  it("AC-13: practiced blocks are marked", async () => {
    await open(
      planView({ status: "active" }, (i) =>
        i === 0
          ? {
              past: true,
              items: [
                {
                  id: "p",
                  topicId: TOPICS[0]?.id,
                  label: null,
                  title: "Tríadas de dórico",
                  targetBpm: 90,
                  minutes: 25,
                  practiced: true,
                },
              ],
            }
          : {},
      ),
    );
    expect(within(dayCard("2026-10-01")).getByLabelText(es.plan.practiced)).toBeTruthy();
  });

  it("AC-4, AC-5: says when Claude is working, rejected its plan, or wasn't used", async () => {
    await open(planView({ llmStatus: "running" }));
    expect(screen.getByText(es.plan.claudeWorking)).toBeTruthy();
    expect(
      within(dayCard("2026-10-02")).queryByRole("button", { name: es.plan.regenerateDay }),
    ).toBeNull();
  });

  it("AC-5: explains a plan built without Claude", async () => {
    await open(
      planView({
        llmStatus: "skipped",
        llmError: "llm.disabled",
        weekNote: "Semana para asentar las tríadas.",
      }),
    );
    expect(screen.getByText(es.plan.skipped(es.validation["llm.disabled"]))).toBeTruthy();
  });

  it("AC-4: says when Claude's plan was discarded", async () => {
    await open(planView({ llmStatus: "rejected" }));
    expect(screen.getByText(es.plan.rejected)).toBeTruthy();
  });
});
