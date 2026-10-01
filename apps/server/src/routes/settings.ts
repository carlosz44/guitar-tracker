import { updateSettingsSchema } from "@ds/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { SessionVariables } from "../auth/require-session";
import type { Database } from "../db/client";
import { userSettings } from "../db/schema";
import { validate } from "../http/validate";
import { getOrCreateSettings, toSettings } from "../settings";

export function createSettingsRoutes(deps: { db: Database; defaultTimezone: string }) {
  return new Hono<{ Variables: SessionVariables }>().patch(
    "/",
    validate("json", updateSettingsSchema),
    async (c) => {
      const userId = c.get("user").id;
      const changes = c.req.valid("json");
      await getOrCreateSettings(deps.db, userId, deps.defaultTimezone);
      const [row] = await deps.db
        .update(userSettings)
        .set(changes)
        .where(eq(userSettings.userId, userId))
        .returning();
      if (!row) throw new Error("user_settings row missing on update");
      return c.json({ settings: toSettings(row) }, 200);
    },
  );
}
