import { useEffect, useState } from "react";
import { serverTime } from "@/lib/practice/clock";

export function useNow(intervalMs = 250) {
  const [now, setNow] = useState(serverTime);
  useEffect(() => {
    const tick = () => setNow(serverTime());
    const timer = setInterval(tick, intervalMs);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [intervalMs]);
  return now;
}
