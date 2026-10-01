import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { es } from "@/i18n/es";
import { sessionView } from "@/lib/practice/fixtures";
import {
  carlos,
  emptyToday,
  fakeApi,
  json,
  type RecordedRequest,
  renderApp,
} from "@/test/render-app";

const today = {
  ...emptyToday,
  seconds: 900,
  minutes: 15,
  streak: 3,
  latestLesson: { id: "l1", title: "Modo dórico", date: "2026-10-01" },
  openQuestionsCount: 2,
  suggestion: {
    warmUpMinutes: 5,
    topics: [
      { topicId: "t1", title: "Tríadas de dórico", minutes: 15, targetBpm: 90, lastCleanBpm: 80 },
      { topicId: "t2", title: "Modo dórico", minutes: 10, targetBpm: null, lastCleanBpm: null },
    ],
  },
};

function api(overrides: Record<string, unknown> = {}) {
  return ({ method, path }: RecordedRequest) => {
    if (method === "GET" && path === "/api/today") return json({ ...today, ...overrides });
    if (method === "GET" && path === "/api/topics") {
      return json({
        topics: [{ id: "t3", title: "Cromática", status: "active", defaultBlockMinutes: 12 }],
      });
    }
    if (method === "POST" && path === "/api/sessions")
      return json({ session: sessionView({ id: "new-session" }) }, 201);
    if (method === "GET" && path.startsWith("/api/sessions/"))
      return json({ session: sessionView({ id: "new-session" }) });
    return undefined;
  };
}

const rows = () =>
  screen.getAllByRole("listitem").filter((item) => item.textContent?.includes("min"));

describe("Hoy", () => {
  it("AC-1: shows today's minutes against the target, streak, latest lesson, open questions and blocks", async () => {
    fakeApi({ me: carlos, handlers: [api()] });
    renderApp("/today");
    expect(await screen.findByRole("img", { name: es.today.progress(15, 30) })).toBeTruthy();
    expect(screen.getByText(es.today.streak(3))).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /Última clase: Modo dórico/ }).getAttribute("href"),
    ).toBe("/lessons/l1");
    expect(screen.getByRole("link", { name: es.today.openQuestions(2) }).getAttribute("href")).toBe(
      "/lessons/l1#next-class",
    );
    expect(rows().map((row) => row.textContent)).toEqual([
      expect.stringContaining(es.today.warmUp),
      expect.stringContaining("Tríadas de dórico"),
      expect.stringContaining("Modo dórico"),
    ]);
    expect(screen.getByTestId("plan-total").textContent).toBe(es.today.total(30));
    expect(screen.getByRole("button", { name: es.today.start })).toBeTruthy();
  });

  it("AC-3: blocks can be removed, reordered, resized in steps of 5 and added, with a live total", async () => {
    const { requests } = fakeApi({ me: carlos, handlers: [api()] });
    const { router } = renderApp("/today");
    await screen.findByRole("button", { name: es.today.start });

    await userEvent.click(screen.getByRole("button", { name: es.today.remove("Modo dórico") }));
    expect(screen.getByTestId("plan-total").textContent).toBe(es.today.total(20));
    await userEvent.click(
      screen.getByRole("button", { name: es.today.moreMinutes("Tríadas de dórico") }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: es.today.moveUp("Tríadas de dórico") }),
    );
    expect(screen.getByTestId("plan-total").textContent).toBe(es.today.total(25));

    await userEvent.click(screen.getByRole("button", { name: es.today.addBlock }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText(es.today.label), "Improvisación");
    await userEvent.click(within(dialog).getByRole("button", { name: es.today.add }));
    await userEvent.click(screen.getByRole("button", { name: es.today.addBlock }));
    await waitFor(() => expect(screen.getByRole("option", { name: "Cromática" })).toBeTruthy());
    await userEvent.selectOptions(screen.getByLabelText(es.today.topic), "Cromática");
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: es.today.add }),
    );
    expect(screen.getByTestId("plan-total").textContent).toBe(es.today.total(45));

    await userEvent.click(screen.getByRole("button", { name: es.today.start }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/practice/new-session"));
    expect(requests.find((r) => r.method === "POST" && r.path === "/api/sessions")?.body).toEqual({
      blocks: [
        { topicId: "t1", plannedSeconds: 1200 },
        { topicId: null, label: es.today.warmUp, plannedSeconds: 300 },
        { topicId: null, label: "Improvisación", plannedSeconds: 600 },
        { topicId: "t3", plannedSeconds: 600 },
      ],
    });
  });

  it("AC-2: with no topics, offers only the warm-up and a prompt to create topics", async () => {
    fakeApi({ me: carlos, handlers: [api({ suggestion: { warmUpMinutes: 5, topics: [] } })] });
    renderApp("/today");
    expect(await screen.findByText(es.today.noTopics, { exact: false })).toBeTruthy();
    expect(rows()).toHaveLength(1);
  });

  it("AC-4: inside the app, a session in progress shows 'Sesión en curso · Continuar' instead of the plan", async () => {
    fakeApi({ me: carlos, handlers: [api({ activeSession: { id: "running" } })] });
    const { router } = renderApp("/lessons");
    await screen.findByRole("heading", { name: es.lessons.title });
    await router.navigate({ to: "/today" });
    expect(await screen.findByRole("heading", { name: es.today.activeTitle })).toBeTruthy();
    expect(screen.getByRole("link", { name: es.today.continue }).getAttribute("href")).toBe(
      "/practice/running",
    );
    expect(screen.queryByRole("button", { name: es.today.start })).toBeNull();
  });

  it("AC-4: opening the app with a session in progress resumes it", async () => {
    fakeApi({ me: carlos, handlers: [api({ activeSession: { id: "running" } })] });
    const { router } = renderApp("/today");
    await waitFor(() => expect(router.state.location.pathname).toBe("/practice/running"));
  });

  it("asks to continue or discard when another session is already running", async () => {
    const { requests } = fakeApi({
      me: carlos,
      handlers: [
        ({ method, path }) =>
          method === "POST" &&
          path === "/api/sessions" &&
          !requests.some((r) => r.path.endsWith("/abandon"))
            ? json({ error: "session.active", activeSessionId: "other" }, 409)
            : undefined,
        ({ method, path }) =>
          method === "POST" && path === "/api/sessions/other/abandon"
            ? json({ session: sessionView() })
            : undefined,
        api(),
      ],
    });
    const { router } = renderApp("/today");
    await userEvent.click(await screen.findByRole("button", { name: es.today.start }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(es.today.activeExists)).toBeTruthy();
    await userEvent.click(within(dialog).getByRole("button", { name: es.today.discardAndStart }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/practice/new-session"));
  });
});
