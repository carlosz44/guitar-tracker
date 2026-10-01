import { meResponseSchema, settingsErrors } from "@ds/shared";
import { eq } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import { beforeEach, describe, expect, it } from "vitest";
import { backupRuns, user, userSettings } from "../db/schema";
import { createTestApp, TEST_APP_URL } from "../test/app";
import { useTestDatabase } from "../test/db";
import { createSignedInUser } from "../test/session";

const { db, truncateAll } = useTestDatabase();
const { app, auth } = createTestApp({ db });

beforeEach(truncateAll);

async function getMe(cookie: string) {
  const response = await app.request(`${TEST_APP_URL}/api/me`, { headers: { cookie } });
  expect(response.status).toBe(200);
  return meResponseSchema.parse(await response.json());
}

function patchSettings(cookie: string, body: unknown) {
  return app.request(`${TEST_APP_URL}/api/settings`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(body),
  });
}

async function addBackupRun(status: "running" | "succeeded" | "failed", finishedAt: string | null) {
  await db.insert(backupRuns).values({
    id: uuidv7(),
    startedAt: new Date(finishedAt ?? "2026-10-01T08:30:00Z"),
    finishedAt: finishedAt ? new Date(finishedAt) : null,
    status,
    r2Key: "db-backups/guitartracker-2026-10-01.dump",
  });
}

describe("GET /api/me", () => {
  it("returns the GitHub name, avatar and settings", async () => {
    const { userId, cookie } = await createSignedInUser(db, auth, { name: "Carlos" });
    expect(await getMe(cookie)).toEqual({
      user: { id: userId, name: "Carlos", image: "https://avatars.example.com/u/1001" },
      settings: { timezone: "America/Lima", dailyTargetMinutes: 30, lessonWeekday: 4 },
      lastBackupAt: null,
      llm: { enabled: true },
    });
  });

  it("creates missing settings with defaults", async () => {
    const { userId, cookie } = await createSignedInUser(db, auth);
    await db.delete(userSettings).where(eq(userSettings.userId, userId));
    expect((await getMe(cookie)).settings.dailyTargetMinutes).toBe(30);
  });

  it("AC-14: lastBackupAt is null when no backup has succeeded yet", async () => {
    const { cookie } = await createSignedInUser(db, auth);
    await addBackupRun("failed", "2026-10-01T08:31:00Z");
    await addBackupRun("running", null);
    expect((await getMe(cookie)).lastBackupAt).toBeNull();
  });

  it("AC-14: lastBackupAt is the latest successful backup, ignoring later failures", async () => {
    const { cookie } = await createSignedInUser(db, auth);
    await addBackupRun("succeeded", "2026-09-29T08:31:00Z");
    await addBackupRun("succeeded", "2026-09-30T08:32:00Z");
    await addBackupRun("failed", "2026-10-01T08:31:00Z");
    expect((await getMe(cookie)).lastBackupAt).toBe("2026-09-30T08:32:00.000Z");
  });
});

describe("PATCH /api/settings", () => {
  it("AC-8: saves a valid daily target and returns it", async () => {
    const { cookie } = await createSignedInUser(db, auth);
    const response = await patchSettings(cookie, { dailyTargetMinutes: 45 });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      settings: { timezone: "America/Lima", dailyTargetMinutes: 45, lessonWeekday: 4 },
    });
    expect((await getMe(cookie)).settings.dailyTargetMinutes).toBe(45);
  });

  it("AC-8: rejects invalid targets with a 400 and the validation key", async () => {
    const { cookie } = await createSignedInUser(db, auth);
    const cases = [
      { value: 33, key: settingsErrors.dailyTargetStep },
      { value: 5, key: settingsErrors.dailyTargetRange },
      { value: 245, key: settingsErrors.dailyTargetRange },
      { value: "30", key: settingsErrors.dailyTargetInvalid },
    ];
    for (const { value, key } of cases) {
      const response = await patchSettings(cookie, { dailyTargetMinutes: value });
      expect(response.status, String(value)).toBe(400);
      expect(await response.json()).toEqual({
        error: "invalid",
        issues: [{ path: ["dailyTargetMinutes"], message: key }],
      });
    }
    expect((await getMe(cookie)).settings.dailyTargetMinutes).toBe(30);
  });

  it("AC-8: rejects fields other than the daily target", async () => {
    const { cookie } = await createSignedInUser(db, auth);
    const response = await patchSettings(cookie, { dailyTargetMinutes: 30, timezone: "UTC" });
    expect(response.status).toBe(400);
  });

  it("only changes the signed-in user's settings", async () => {
    const carlos = await createSignedInUser(db, auth);
    const otherId = uuidv7();
    await db.insert(user).values({
      id: otherId,
      name: "Other",
      email: "other@example.com",
      githubId: "2002",
    });
    await db.insert(userSettings).values({ userId: otherId });

    await patchSettings(carlos.cookie, { dailyTargetMinutes: 60 });

    const [other] = await db.select().from(userSettings).where(eq(userSettings.userId, otherId));
    expect(other?.dailyTargetMinutes).toBe(30);
  });
});
