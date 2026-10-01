import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { es } from "@/i18n/es";
import { formatUsd } from "@/lib/format";
import { carlos, fakeApi, json, renderApp } from "@/test/render-app";

function patchHandler() {
  return ({ method, path, body }: { method: string; path: string; body: unknown }) =>
    method === "PATCH" && path === "/api/settings"
      ? json({ settings: { ...carlos.settings, ...(body as object) } })
      : undefined;
}

async function setTarget(value: string) {
  const input = await screen.findByLabelText(es.settings.dailyTarget);
  await userEvent.clear(input);
  if (value) await userEvent.type(input, value);
  await userEvent.click(screen.getByRole("button", { name: es.settings.save }));
}

describe("Ajustes", () => {
  it("shows the GitHub name and the read-only timezone", async () => {
    fakeApi({ me: carlos });
    renderApp("/settings");
    expect(await screen.findByText("Carlos Amorós")).toBeTruthy();
    expect(screen.getByTestId("timezone").textContent).toBe("America/Lima");
    expect(screen.queryByRole("textbox", { name: es.settings.timezone })).toBeNull();
  });

  it("AC-8: saves a new daily target", async () => {
    const { requests } = fakeApi({ me: carlos, handlers: [patchHandler()] });
    renderApp("/settings");
    await setTarget("45");
    await waitFor(() =>
      expect(requests.find((r) => r.method === "PATCH")?.body).toEqual({ dailyTargetMinutes: 45 }),
    );
    expect(await screen.findByText(es.settings.saved)).toBeTruthy();
  });

  it.each([
    ["33", es.validation["settings.dailyTarget.step"]],
    ["5", es.validation["settings.dailyTarget.range"]],
    ["245", es.validation["settings.dailyTarget.range"]],
    ["", es.validation["settings.dailyTarget.invalid"]],
  ])("AC-8: %s shows a Spanish validation message and isn't sent", async (value, message) => {
    const { requests } = fakeApi({ me: carlos, handlers: [patchHandler()] });
    renderApp("/settings");
    await setTarget(value);
    expect(await screen.findByText(message)).toBeTruthy();
    expect(requests.some((r) => r.method === "PATCH")).toBe(false);
  });

  it("AC-14: says there are no backups yet", async () => {
    fakeApi({ me: carlos });
    renderApp("/settings");
    expect((await screen.findByTestId("last-backup")).textContent).toBe(es.settings.noBackups);
  });

  it("AC-14: shows the last successful backup in Lima time", async () => {
    fakeApi({ me: { ...carlos, lastBackupAt: "2026-10-01T08:31:00.000Z" } });
    renderApp("/settings");
    const text = (await screen.findByTestId("last-backup")).textContent ?? "";
    expect(text).toContain("1 de octubre de 2026");
    expect(text).toMatch(/3:31/);
  });

  it("005 AC-14: shows this month's Claude spend against the budget", async () => {
    fakeApi({
      me: carlos,
      handlers: [
        ({ path }) =>
          path === "/api/llm/usage"
            ? json({ enabled: true, monthSpendUsd: 0.4234, monthCalls: 3, budgetUsd: 10 })
            : undefined,
      ],
    });
    renderApp("/settings");
    expect((await screen.findByTestId("llm-usage")).textContent).toBe(
      es.settings.claudeSpend(formatUsd(0.4234), formatUsd(10), 3),
    );
    expect(formatUsd(0.4234)).toContain("0.42");
  });

  it("005 AC-16: says Claude isn't configured", async () => {
    fakeApi({ me: { ...carlos, llm: { enabled: false } } });
    renderApp("/settings");
    expect(await screen.findByText(es.validation["llm.disabled"])).toBeTruthy();
  });

  it("006 AC-1: sets a different target per weekday, and back to the same every day", async () => {
    const { requests } = fakeApi({ me: carlos, handlers: [patchHandler()] });
    renderApp("/settings");
    await userEvent.click(await screen.findByText(es.settings.dayTargets));
    const sunday = es.settings.weekdays[6] ?? "";
    await userEvent.click(screen.getByRole("button", { name: es.settings.moreMinutes(sunday) }));
    await userEvent.click(screen.getByRole("button", { name: es.settings.moreMinutes(sunday) }));
    expect(screen.getByTestId("day-target-7").textContent).toBe(es.settings.dayMinutes(40));
    await userEvent.click(screen.getByRole("button", { name: es.settings.saveDayTargets }));
    await waitFor(() =>
      expect(requests.find((r) => r.method === "PATCH")?.body).toEqual({
        dayTargets: [30, 30, 30, 30, 30, 30, 40],
      }),
    );
    await userEvent.click(await screen.findByRole("button", { name: es.settings.sameEveryDay }));
    await waitFor(() =>
      expect(requests.filter((r) => r.method === "PATCH").at(-1)?.body).toEqual({
        dayTargets: null,
      }),
    );
  });

  it("AC-4: “Cerrar sesión” signs me out and returns to the login page", async () => {
    const { requests } = fakeApi({ me: carlos });
    const { router } = renderApp("/settings");
    await userEvent.click(await screen.findByRole("button", { name: es.settings.signOut }));
    expect(await screen.findByRole("button", { name: es.login.signIn })).toBeTruthy();
    expect(requests.some((r) => r.method === "POST" && r.path === "/api/auth/sign-out")).toBe(true);
    expect(router.state.location.pathname).toBe("/login");
  });
});
