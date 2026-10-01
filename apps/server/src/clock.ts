export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

export function fakeClock(start: Date | string) {
  let current = new Date(start);
  return {
    now: () => new Date(current),
    set(next: Date | string) {
      current = new Date(next);
    },
    advance(ms: number) {
      current = new Date(current.getTime() + ms);
    },
  } satisfies Clock & Record<string, unknown>;
}
