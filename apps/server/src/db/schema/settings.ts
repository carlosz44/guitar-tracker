import {
  DEFAULT_DAILY_TARGET_MINUTES,
  DEFAULT_LESSON_WEEKDAY,
  DEFAULT_REMINDER_TIMES,
  DEFAULT_TIMEZONE,
} from "@ds/shared";
import { sql } from "drizzle-orm";
import { bigint, check, pgTable, smallint, text, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { timestamps } from "./columns";

export const userSettings = pgTable(
  "user_settings",
  {
    userId: uuid()
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    timezone: text().notNull().default(DEFAULT_TIMEZONE),
    dailyTargetMinutes: smallint().notNull().default(DEFAULT_DAILY_TARGET_MINUTES),
    lessonWeekday: smallint().notNull().default(DEFAULT_LESSON_WEEKDAY),
    reminderTimes: text()
      .array()
      .notNull()
      .default([...DEFAULT_REMINDER_TIMES]),
    telegramChatId: bigint({ mode: "number" }),
    ...timestamps,
  },
  (table) => [
    check(
      "user_settings_daily_target_minutes_check",
      sql`${table.dailyTargetMinutes} BETWEEN 10 AND 240 AND ${table.dailyTargetMinutes} % 5 = 0`,
    ),
    check("user_settings_lesson_weekday_check", sql`${table.lessonWeekday} BETWEEN 1 AND 7`),
  ],
);
