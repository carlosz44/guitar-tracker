import { useEffect, useState } from "react";

type Sentinel = { release(): Promise<void> };
type WakeLockApi = { request(type: "screen"): Promise<Sentinel> };

export function useWakeLock(active: boolean) {
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    const wakeLock = (navigator as Navigator & { wakeLock?: WakeLockApi }).wakeLock;
    if (!active) return;
    if (!wakeLock) {
      setUnavailable(true);
      return;
    }
    let sentinel: Sentinel | null = null;
    let cancelled = false;
    const request = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const next = await wakeLock.request("screen");
        if (cancelled) await next.release();
        else sentinel = next;
      } catch {
        setUnavailable(true);
      }
    };
    void request();
    document.addEventListener("visibilitychange", request);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", request);
      void sentinel?.release().catch(() => undefined);
    };
  }, [active]);

  return unavailable;
}
