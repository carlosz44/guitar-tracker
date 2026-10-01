import {
  AUTH_ERROR_NOT_ALLOWLISTED,
  DEFAULT_DAILY_TARGET_MINUTES,
  DEFAULT_LESSON_WEEKDAY,
  DEFAULT_TIMEZONE,
} from "@ds/shared";
import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { session, user, userSettings } from "../db/schema";
import { ALLOWED_GITHUB_ID, createTestApp, STRANGER_GITHUB_ID, TEST_APP_URL } from "../test/app";
import { useTestDatabase } from "../test/db";
import { signInWithGitHub, useFakeGitHub } from "../test/github";
import { createSignedInUser, SESSION_COOKIE_NAME } from "../test/session";

const { db, truncateAll } = useTestDatabase();
const github = useFakeGitHub();
const { app, auth } = createTestApp({ db });

const carlos = {
  id: Number(ALLOWED_GITHUB_ID),
  login: "carlos",
  name: "Carlos",
  email: "carlos@example.com",
};
const stranger = {
  id: Number(STRANGER_GITHUB_ID),
  login: "stranger",
  name: "Stranger",
  email: "stranger@example.com",
};

async function count(table: typeof user | typeof session) {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(table);
  return row?.n ?? 0;
}

beforeEach(truncateAll);

describe("GitHub sign-in", () => {
  it("AC-2: an allowlisted account lands on /today signed in, with default settings", async () => {
    github.signsInAs(carlos);
    const result = await signInWithGitHub(app);

    expect(result.status).toBe(302);
    expect(result.location).toBe("/today");
    expect(result.setCookies.some((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`))).toBe(true);

    const [created] = await db.select().from(user);
    expect(created).toMatchObject({ githubId: ALLOWED_GITHUB_ID, name: "Carlos" });
    const [settings] = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, created?.id ?? ""));
    expect(settings).toMatchObject({
      timezone: DEFAULT_TIMEZONE,
      dailyTargetMinutes: DEFAULT_DAILY_TARGET_MINUTES,
      lessonWeekday: DEFAULT_LESSON_WEEKDAY,
      reminderTimes: ["11:00", "16:00", "18:00"],
      telegramChatId: null,
    });

    const sessionResponse = await auth.api.getSession({
      headers: new Headers({ cookie: result.cookie }),
    });
    expect(sessionResponse?.user.githubId).toBe(ALLOWED_GITHUB_ID);
  });

  it("AC-2: signing in again reuses the same user and settings", async () => {
    github.signsInAs(carlos);
    await signInWithGitHub(app);
    const second = await signInWithGitHub(app);
    expect(second.location).toBe("/today");
    expect(await count(user)).toBe(1);
    expect(await db.select().from(userSettings)).toHaveLength(1);
  });

  it("AC-3: an account outside the allowlist is sent to the error page with no user or session", async () => {
    github.signsInAs(stranger);
    const result = await signInWithGitHub(app);

    expect(result.status).toBe(302);
    expect(result.location).toMatch(new RegExp(`^/login\\?error=${AUTH_ERROR_NOT_ALLOWLISTED}`));
    expect(result.setCookies.some((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`))).toBe(false);
    expect(await count(user)).toBe(0);
    expect(await count(session)).toBe(0);
  });

  it("AC-3: an account removed from the allowlist can't sign in again", async () => {
    github.signsInAs(carlos);
    await signInWithGitHub(app);

    const { app: lockedApp } = createTestApp({ db, allowedGithubIds: [] });
    await db.delete(session);
    const result = await signInWithGitHub(lockedApp);
    expect(result.location).toMatch(new RegExp(`^/login\\?error=${AUTH_ERROR_NOT_ALLOWLISTED}`));
    expect(await count(session)).toBe(0);
  });

  it("keeps the GitHub id immutable after sign-up", async () => {
    const { userId, cookie } = await createSignedInUser(db, auth);
    const response = await app.request(`${TEST_APP_URL}/api/auth/update-user`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: TEST_APP_URL, cookie },
      body: JSON.stringify({ name: "Carlos A.", githubId: STRANGER_GITHUB_ID }),
    });
    expect(response.status).toBe(400);
    const [row] = await db.select().from(user).where(eq(user.id, userId));
    expect(row).toMatchObject({ githubId: ALLOWED_GITHUB_ID, name: "Carlos" });
  });
});

describe("sessions", () => {
  const DAY = 24 * 60 * 60 * 1000;

  async function ageSession(sessionId: string, days: number) {
    const lastUsed = new Date(Date.now() - days * DAY);
    await db
      .update(session)
      .set({ updatedAt: lastUsed, expiresAt: new Date(lastUsed.getTime() + 90 * DAY) })
      .where(eq(session.id, sessionId));
  }

  async function protectedRequest(cookie: string) {
    return app.request(`${TEST_APP_URL}/api/session-probe`, { headers: { cookie } });
  }

  it("AC-4: a session unused for 89 days is still valid and is renewed for 90 more", async () => {
    const { session: created, cookie } = await createSignedInUser(db, auth);
    await ageSession(created.id, 89);

    const response = await protectedRequest(cookie);
    expect(response.status).toBe(404);

    const [renewed] = await db.select().from(session).where(eq(session.id, created.id));
    const remainingDays = ((renewed?.expiresAt.getTime() ?? 0) - Date.now()) / DAY;
    expect(remainingDays).toBeGreaterThan(89.9);
    const refreshed = response.headers
      .getSetCookie()
      .find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`));
    expect(refreshed).toMatch(/Max-Age=7776000/);
  });

  it("AC-4: a session unused for more than 90 days is no longer valid", async () => {
    const { session: created, cookie } = await createSignedInUser(db, auth);
    await ageSession(created.id, 91);
    expect((await protectedRequest(cookie)).status).toBe(401);
  });

  it("AC-4: signing out ends the session", async () => {
    const { cookie } = await createSignedInUser(db, auth);
    const signOut = await app.request(`${TEST_APP_URL}/api/auth/sign-out`, {
      method: "POST",
      headers: { origin: TEST_APP_URL, cookie },
    });
    expect(signOut.status).toBe(200);
    expect(await count(session)).toBe(0);
    expect((await protectedRequest(cookie)).status).toBe(401);
  });

  it("rejects a valid session whose GitHub id was removed from the allowlist", async () => {
    const { cookie } = await createSignedInUser(db, auth);
    const { app: lockedApp } = createTestApp({ db, allowedGithubIds: [] });
    const response = await lockedApp.request(`${TEST_APP_URL}/api/session-probe`, {
      headers: { cookie },
    });
    expect(response.status).toBe(401);
  });

  it("rejects a cookie with a forged signature", async () => {
    const { session: created } = await createSignedInUser(db, auth);
    const forged = `${SESSION_COOKIE_NAME}=${encodeURIComponent(`${created.token}.AAAA`)}`;
    expect((await protectedRequest(forged)).status).toBe(401);
  });
});
