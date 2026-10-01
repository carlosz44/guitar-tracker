import { describe, expect, it } from "vitest";
import { createTestApp, TEST_APP_URL } from "../test/app";
import { useTestDatabase } from "../test/db";
import { createSignedInUser } from "../test/session";

const { db } = useTestDatabase();
const { app, auth } = createTestApp({ db });

const PUBLIC_PATHS = [/^\/api\/health$/, /^\/api\/auth\//];

function apiRoutes() {
  const seen = new Set<string>();
  const routes: { method: string; path: string }[] = [];
  for (const route of app.routes) {
    if (route.method === "ALL" || !route.path.startsWith("/api/")) continue;
    const path = route.path.replace(/:[^/]+/g, "00000000-0000-7000-8000-000000000000");
    const key = `${route.method} ${path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    routes.push({ method: route.method, path });
  }
  return routes;
}

describe("session requirement", () => {
  it("AC-5: every /api route except health and auth returns 401 without a session", async () => {
    const protectedRoutes = apiRoutes().filter(
      ({ path }) => !PUBLIC_PATHS.some((pattern) => pattern.test(path)),
    );
    for (const { method, path } of [...protectedRoutes, { method: "GET", path: "/api/unknown" }]) {
      const response = await app.request(`${TEST_APP_URL}${path}`, {
        method,
        headers: { origin: TEST_APP_URL },
      });
      expect(response.status, `${method} ${path}`).toBe(401);
      expect(await response.json()).toEqual({ error: "unauthorized" });
    }
  });

  it("AC-5: /api/health is reachable without a session", async () => {
    expect((await app.request("/api/health")).status).not.toBe(401);
  });

  it("AC-5: /api/auth/* is reachable without a session", async () => {
    const response = await app.request(`${TEST_APP_URL}/api/auth/get-session`);
    expect(response.status).toBe(200);
  });

  it("signed-in requests to unknown /api routes get a JSON 404", async () => {
    const { cookie } = await createSignedInUser(db, auth);
    const response = await app.request(`${TEST_APP_URL}/api/unknown`, { headers: { cookie } });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not_found" });
  });
});
