import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { es } from "@/i18n/es";
import { carlos, fakeApi, json, renderApp } from "@/test/render-app";

describe("signed out", () => {
  it.each(["/today", "/settings", "/lessons", "/no/such/page", "/"])(
    "AC-1: opening %s sends me to /login with “Entrar con GitHub”",
    async (path) => {
      fakeApi({ me: null });
      const { router } = renderApp(path);
      expect(await screen.findByRole("button", { name: es.login.signIn })).toBeTruthy();
      expect(router.state.location.pathname).toBe("/login");
    },
  );

  it("AC-1: the login page shows the app name and a one-line description", async () => {
    fakeApi({ me: null });
    renderApp("/login");
    expect(await screen.findByRole("heading", { name: es.app.name })).toBeTruthy();
    expect(screen.getByText(es.app.tagline)).toBeTruthy();
  });

  it("AC-2: “Entrar con GitHub” starts the GitHub flow, returning to /today", async () => {
    const { requests } = fakeApi({
      me: null,
      handlers: [
        ({ path }) =>
          path.startsWith("/api/auth/sign-in/social")
            ? json({ url: "https://github.com/login/oauth/authorize", redirect: false })
            : undefined,
      ],
    });
    renderApp("/login");
    await userEvent.click(await screen.findByRole("button", { name: es.login.signIn }));
    await waitFor(() =>
      expect(requests.find((r) => r.path.startsWith("/api/auth/sign-in/social"))?.body).toEqual({
        provider: "github",
        callbackURL: "/today",
        errorCallbackURL: "/login",
      }),
    );
  });

  it("AC-3: a rejected account lands on /access-denied with a Spanish message", async () => {
    fakeApi({ me: null });
    const { router } = renderApp("/login?error=not_allowlisted");
    expect(await screen.findByRole("heading", { name: es.accessDenied.title })).toBeTruthy();
    expect(screen.getByText(es.accessDenied.body)).toBeTruthy();
    expect(router.state.location.pathname).toBe("/access-denied");
  });

  it("shows a generic error for other sign-in failures", async () => {
    fakeApi({ me: null });
    renderApp("/login?error=access_denied");
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", es.login.error);
  });
});

describe("signed in", () => {
  it("AC-2: / and /login go to /today", async () => {
    fakeApi({ me: carlos });
    const { router } = renderApp("/login");
    expect(await screen.findByRole("heading", { name: es.today.title })).toBeTruthy();
    expect(router.state.location.pathname).toBe("/today");
  });

  it("shows a Spanish not-found page inside the app for unknown paths", async () => {
    fakeApi({ me: carlos });
    renderApp("/no/such/page");
    expect(await screen.findByRole("heading", { name: es.notFound.title })).toBeTruthy();
  });
});
