import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { es } from "@/i18n/es";
import { carlos, fakeApi, renderApp } from "@/test/render-app";

const LABELS = [es.nav.today, es.nav.lessons, es.nav.topics, es.nav.history, es.nav.settings];

describe("app shell", () => {
  it("AC-6: a bottom bar with Hoy, Clases, Temas, Historial and Ajustes, hidden from 1024 px", async () => {
    fakeApi({ me: carlos });
    renderApp("/today");
    const bottomNav = await screen.findByTestId("bottom-nav");
    expect(bottomNav.className).toContain("lg:hidden");
    expect(bottomNav.className).toContain("env(safe-area-inset-bottom)");
    const links = within(bottomNav).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(LABELS);
  });

  it("AC-6: a sidebar with the same items, shown only from 1024 px", async () => {
    fakeApi({ me: carlos });
    renderApp("/today");
    const sidebar = await screen.findByTestId("sidebar");
    expect(sidebar.className).toMatch(/(^|\s)hidden(\s|$)/);
    expect(sidebar.className).toContain("lg:flex");
    const links = within(sidebar).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(LABELS);
  });

  it("AC-6: marks the current section as active", async () => {
    fakeApi({ me: carlos });
    renderApp("/settings");
    const bottomNav = await screen.findByTestId("bottom-nav");
    const active = within(bottomNav).getByRole("link", { name: es.nav.settings });
    expect(active.getAttribute("aria-current")).toBe("page");
  });

  it.each([
    ["/today", es.today.title, es.today.progress(0, 30)],
    ["/lessons", es.lessons.title, es.lessonsPage.empty],
    ["/topics", es.topics.title, es.topicsPage.empty],
    ["/history", es.history.title, es.history.placeholder],
  ])("%s shows its page in Spanish", async (path, title, message) => {
    fakeApi({ me: carlos });
    renderApp(path);
    expect(await screen.findByRole("heading", { name: title })).toBeTruthy();
    expect(await screen.findByText(message)).toBeTruthy();
  });
});
