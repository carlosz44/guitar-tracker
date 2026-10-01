import type { HealthResponse } from "@ds/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { Clock } from "../clock";
import type { Database } from "../db/client";
import { workerHeartbeat } from "../db/schema";
import type { Logger } from "../logger";

export const HEARTBEAT_STALE_MS = 3 * 60 * 1000;

export function createHealthRoutes(deps: { db: Database; clock: Clock; logger: Logger }) {
  return new Hono().get("/", async (c) => {
    let beatAt: Date | undefined;
    try {
      const [row] = await deps.db
        .select({ beatAt: workerHeartbeat.beatAt })
        .from(workerHeartbeat)
        .where(eq(workerHeartbeat.id, 1));
      beatAt = row?.beatAt;
    } catch (error) {
      deps.logger.warn({ code: (error as { code?: string }).code }, "health: database unreachable");
      return c.json(
        { status: "error", db: "error", worker: "stale" } satisfies HealthResponse,
        503,
      );
    }

    const fresh =
      beatAt !== undefined && deps.clock.now().getTime() - beatAt.getTime() < HEARTBEAT_STALE_MS;
    return c.json(
      { status: "ok", db: "ok", worker: fresh ? "ok" : "stale" } satisfies HealthResponse,
      200,
    );
  });
}
