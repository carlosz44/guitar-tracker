import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";

export function todayIn(timezone: string, now: Date = new Date()) {
  return format(new TZDate(now, timezone), "yyyy-MM-dd");
}
