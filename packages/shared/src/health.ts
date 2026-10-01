import { z } from "zod";

export const healthResponseSchema = z.object({
  status: z.enum(["ok", "error"]),
  db: z.enum(["ok", "error"]),
  worker: z.enum(["ok", "stale"]),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;
