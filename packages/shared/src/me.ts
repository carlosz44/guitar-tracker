import { z } from "zod";
import { settingsSchema } from "./settings.ts";

export const meResponseSchema = z.object({
  user: z.object({
    id: z.string(),
    name: z.string(),
    image: z.string().nullable(),
  }),
  settings: settingsSchema,
  lastBackupAt: z.iso.datetime().nullable(),
  llm: z.object({ enabled: z.boolean() }),
});
export type MeResponse = z.infer<typeof meResponseSchema>;
