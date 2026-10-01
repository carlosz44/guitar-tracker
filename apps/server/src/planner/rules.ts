import { isoWeekday } from "../practice/rules";

export interface TargetSettings {
  dailyTargetMinutes: number;
  dayTargets: readonly number[] | null;
}

export function dayTarget(settings: TargetSettings, date: string) {
  return settings.dayTargets?.[isoWeekday(date) - 1] ?? settings.dailyTargetMinutes;
}
