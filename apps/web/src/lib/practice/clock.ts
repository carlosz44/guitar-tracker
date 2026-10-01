const OFFSET_KEY = "ds.clockOffset";

let offset = (() => {
  try {
    return Number(localStorage.getItem(OFFSET_KEY)) || 0;
  } catch {
    return 0;
  }
})();

export function syncClock(serverNow: string, requestStartedAt = Date.now()) {
  const received = Date.now();
  offset = Date.parse(serverNow) - (requestStartedAt + received) / 2;
  try {
    localStorage.setItem(OFFSET_KEY, String(offset));
  } catch {}
}

export function serverTime() {
  return Date.now() + offset;
}

export function resetClockForTests() {
  offset = 0;
}
