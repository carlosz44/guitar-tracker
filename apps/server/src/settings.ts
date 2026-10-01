import type { Settings } from "@ds/shared";
import { eq } from "drizzle-orm";
import type { Database } from "./db/client";
import { userSettings } from "./db/schema";

type SettingsRow = typeof userSettings.$inferSelect;

export function toSettings(row: SettingsRow): Settings {
  return {
    timezone: row.timezone,
    dailyTargetMinutes: row.dailyTargetMinutes,
    lessonWeekday: row.lessonWeekday,
  };
}

export async function getOrCreateSettings(db: Database, userId: string, defaultTimezone: string) {
  await db.insert(userSettings).values({ userId, timezone: defaultTimezone }).onConflictDoNothing();
  const [row] = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
  if (!row) throw new Error("user_settings row missing after insert");
  return row;
}
