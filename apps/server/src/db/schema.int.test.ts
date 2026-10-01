import {
  DEFAULT_DAILY_TARGET_MINUTES,
  DEFAULT_LESSON_WEEKDAY,
  DEFAULT_REMINDER_TIMES,
  DEFAULT_TIMEZONE,
} from "@ds/shared";
import { eq, sql } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import { beforeEach, describe, expect, it } from "vitest";
import { useTestDatabase } from "../test/db";
import { backupRuns, user, userSettings, workerHeartbeat } from "./schema";

const { db, truncateAll } = useTestDatabase();

async function insertUser() {
  const id = uuidv7();
  await db
    .insert(user)
    .values({ id, name: "Carlos", email: "carlos@example.com", githubId: "1001" });
  return id;
}

async function failureCode(run: () => Promise<unknown>) {
  try {
    await run();
  } catch (error) {
    return (error as { cause?: { code?: string } }).cause?.code;
  }
  return undefined;
}

const CHECK_VIOLATION = "23514";

beforeEach(truncateAll);

describe("migrations", () => {
  it("creates the foundation tables", async () => {
    const result = await db.execute<{ table_name: string }>(
      sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`,
    );
    expect(result.rows.map((row) => row.table_name)).toEqual([
      "account",
      "backup_runs",
      "lesson_files",
      "lesson_topics",
      "lessons",
      "llm_drafts",
      "llm_runs",
      "practice_days",
      "practice_sessions",
      "session",
      "session_blocks",
      "teacher_questions",
      "topics",
      "user",
      "user_settings",
      "verification",
      "worker_heartbeat",
    ]);
  });

  it("gives user_settings the defaults from docs/domain.md", async () => {
    const userId = await insertUser();
    await db.insert(userSettings).values({ userId });
    const [row] = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
    expect(row).toMatchObject({
      timezone: DEFAULT_TIMEZONE,
      dailyTargetMinutes: DEFAULT_DAILY_TARGET_MINUTES,
      lessonWeekday: DEFAULT_LESSON_WEEKDAY,
      reminderTimes: [...DEFAULT_REMINDER_TIMES],
      telegramChatId: null,
    });
  });

  it("rejects a daily target outside 10–240 or not a multiple of 5", async () => {
    const userId = await insertUser();
    for (const dailyTargetMinutes of [5, 33, 245]) {
      expect(
        await failureCode(() => db.insert(userSettings).values({ userId, dailyTargetMinutes })),
      ).toBe(CHECK_VIOLATION);
    }
  });

  it("rejects a lesson weekday outside 1–7", async () => {
    const userId = await insertUser();
    expect(
      await failureCode(() => db.insert(userSettings).values({ userId, lessonWeekday: 8 })),
    ).toBe(CHECK_VIOLATION);
  });

  it("keeps worker_heartbeat to a single row", async () => {
    await db.insert(workerHeartbeat).values({ beatAt: new Date() });
    expect(
      await failureCode(() => db.insert(workerHeartbeat).values({ id: 2, beatAt: new Date() })),
    ).toBe(CHECK_VIOLATION);
  });

  it("only accepts known backup statuses", async () => {
    expect(
      await failureCode(() =>
        db.insert(backupRuns).values({
          id: uuidv7(),
          startedAt: new Date(),
          r2Key: "db-backups/x.dump",
          status: "weird" as "running",
        }),
      ),
    ).toBe(CHECK_VIOLATION);
  });

  it("deletes a user's settings with the user", async () => {
    const userId = await insertUser();
    await db.insert(userSettings).values({ userId });
    await db.delete(user).where(eq(user.id, userId));
    expect(await db.select().from(userSettings)).toEqual([]);
  });
});
