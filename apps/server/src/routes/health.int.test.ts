import { healthResponseSchema } from "@ds/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { fakeClock } from "../clock";
import { createDatabase } from "../db/client";
import { workerHeartbeat } from "../db/schema";
import { createTestApp } from "../test/app";
import { useTestDatabase } from "../test/db";

const { db, truncateAll } = useTestDatabase();
const clock = fakeClock("2026-10-01T15:00:00Z");
const { app } = createTestApp({ db, clock });

async function getHealth(target: { request: typeof app.request } = app) {
  const response = await target.request("/api/health");
  return { status: response.status, body: healthResponseSchema.parse(await response.json()) };
}

async function beat(minutesAgo: number) {
  await db
    .insert(workerHeartbeat)
    .values({ beatAt: new Date(clock.now().getTime() - minutesAgo * 60_000) });
}

beforeEach(truncateAll);

describe("GET /api/health", () => {
  it("AC-10: reports ok when the database answers and the worker beat recently", async () => {
    await beat(1);
    expect(await getHealth()).toEqual({
      status: 200,
      body: { status: "ok", db: "ok", worker: "ok" },
    });
  });

  it("AC-10: reports the worker as stale when the last beat is older than 3 minutes", async () => {
    await beat(4);
    expect(await getHealth()).toEqual({
      status: 200,
      body: { status: "ok", db: "ok", worker: "stale" },
    });
  });

  it("AC-10: reports the worker as stale when it has never beaten", async () => {
    expect((await getHealth()).body.worker).toBe("stale");
  });

  it("AC-10: treats a beat exactly 3 minutes old as stale", async () => {
    await beat(3);
    expect((await getHealth()).body.worker).toBe("stale");
  });

  it("returns 503 when the database is unreachable", async () => {
    const unreachable = createDatabase("postgres://nobody:nothing@127.0.0.1:1/none", { max: 1 });
    const { app: brokenApp } = createTestApp({ db: unreachable.db, clock });
    expect(await getHealth(brokenApp)).toEqual({
      status: 503,
      body: { status: "error", db: "error", worker: "stale" },
    });
    await unreachable.pool.end();
  });

  it("needs no session", async () => {
    const response = await app.request("/api/health");
    expect(response.status).not.toBe(401);
  });
});
