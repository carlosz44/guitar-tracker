import type { MeResponse } from "@ds/shared";
import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import type { SessionVariables } from "../auth/require-session";
import type { Database } from "../db/client";
import { backupRuns } from "../db/schema";
import { getOrCreateSettings, toSettings } from "../settings";

export function createMeRoutes(deps: {
  db: Database;
  defaultTimezone: string;
  llm: { enabled: boolean };
}) {
  return new Hono<{ Variables: SessionVariables }>().get("/", async (c) => {
    const current = c.get("user");
    const settings = await getOrCreateSettings(deps.db, current.id, deps.defaultTimezone);
    const [lastBackup] = await deps.db
      .select({ finishedAt: backupRuns.finishedAt })
      .from(backupRuns)
      .where(eq(backupRuns.status, "succeeded"))
      .orderBy(desc(backupRuns.finishedAt))
      .limit(1);

    return c.json(
      {
        user: { id: current.id, name: current.name, image: current.image ?? null },
        settings: toSettings(settings),
        lastBackupAt: lastBackup?.finishedAt?.toISOString() ?? null,
        llm: { enabled: deps.llm.enabled },
      } satisfies MeResponse,
      200,
    );
  });
}
