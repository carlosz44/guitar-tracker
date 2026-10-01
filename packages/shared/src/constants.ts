export const APP_NAME = "Daily Shed";

export const DEFAULT_TIMEZONE = "America/Lima";
export const DEFAULT_DAILY_TARGET_MINUTES = 30;
export const DEFAULT_LESSON_WEEKDAY = 4;
export const DEFAULT_REMINDER_TIMES = ["11:00", "16:00", "18:00"] as const;

export const DAILY_TARGET_MIN = 10;
export const DAILY_TARGET_MAX = 240;
export const DAILY_TARGET_STEP = 5;

export const TOPIC_CATEGORIES = [
  "technique",
  "scales_modes",
  "chords_arpeggios",
  "rhythm",
  "repertoire",
  "ear",
  "theory",
  "other",
] as const;
export type TopicCategory = (typeof TOPIC_CATEGORIES)[number];

export const AUTH_ERROR_NOT_ALLOWLISTED = "not_allowlisted";
