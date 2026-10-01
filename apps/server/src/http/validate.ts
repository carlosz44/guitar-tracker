import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

type Target = "json" | "query";

export function validate<T extends z.ZodType, K extends Target>(target: K, schema: T) {
  return zValidator(target, schema, (result, c) => {
    if (!result.success) {
      const issues = result.error.issues.map(({ path, message }) => ({ path, message }));
      return c.json({ error: "invalid" as const, issues }, 400);
    }
  });
}

export const idParam = zValidator("param", z.object({ id: z.uuid() }), (result, c) => {
  if (!result.success) return c.json({ error: "not_found" as const }, 404);
});
