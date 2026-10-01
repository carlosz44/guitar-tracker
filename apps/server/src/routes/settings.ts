import { updateSettingsSchema } from "@ds/shared";
import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { SessionVariables } from "../auth/require-session";
import type { Database } from "../db/client";
import { userSettings } from "../db/schema";
import { getOrCreateSettings, toSettings } from "../settings";

export function createSettingsRoutes(deps: { db: Database; defaultTimezone: string }) {
  return new Hono<{ Variables: SessionVariables }>().patch(
    "/",
    zValidator("json", updateSettingsSchema, (result, c) => {
      if (!result.success) {
        const issues = result.error.issues.map(({ path, message }) => ({ path, message }));
        return c.json({ error: "invalid", issues }, 400);
      }
    }),
    async (c) => {
      const userId = c.get("user").id;
      const { dailyTargetMinutes } = c.req.valid("json");
      await getOrCreateSettings(deps.db, userId, deps.defaultTimezone);
      const [row] = await deps.db
        .update(userSettings)
        .set({ dailyTargetMinutes })
        .where(eq(userSettings.userId, userId))
        .returning();
      if (!row) throw new Error("user_settings row missing on update");
      return c.json({ settings: toSettings(row) }, 200);
    },
  );
}
