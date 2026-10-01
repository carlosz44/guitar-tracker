import { DEFAULT_TIMEZONE } from "@ds/shared";
import { z } from "zod";

const required = z.string().trim().min(1);

const timezone = required.refine(
  (value) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value });
      return true;
    } catch {
      return false;
    }
  },
  { error: "must be an IANA timezone" },
);

const base = {
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
};

const database = {
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/, error: "must be a postgres:// URL" }),
};

const r2 = {
  R2_ACCOUNT_ID: required,
  R2_ACCESS_KEY_ID: required,
  R2_SECRET_ACCESS_KEY: required,
  R2_BUCKET: required,
  R2_ENDPOINT: z.url({ protocol: /^https?$/, error: "must be an http(s) URL" }).optional(),
};

const llm = {
  ANTHROPIC_API_KEY: required.optional(),
  LLM_MODEL_DEFAULT: required.default("claude-sonnet-5-5"),
  LLM_MONTHLY_BUDGET_USD: z.coerce
    .number({ error: "must be a number" })
    .min(0, { error: "must be zero or more" })
    .default(10),
};

export const apiConfigSchema = z.object({
  ...base,
  ...database,
  ...r2,
  ...llm,
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  APP_URL: z.url({ protocol: /^https?$/, error: "must be an http(s) URL" }),
  BETTER_AUTH_SECRET: z.string().min(32, { error: "must be at least 32 characters" }),
  GITHUB_CLIENT_ID: required,
  GITHUB_CLIENT_SECRET: required,
  ALLOWED_GITHUB_IDS: required
    .transform((value) =>
      value
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean),
    )
    .pipe(
      z
        .array(z.string().regex(/^\d+$/, { error: "must be comma-separated numeric GitHub ids" }))
        .min(1),
    ),
  DEFAULT_TIMEZONE: timezone.default(DEFAULT_TIMEZONE),
});
export type ApiConfig = z.infer<typeof apiConfigSchema>;

export const workerConfigSchema = z.object({ ...base, ...database, ...r2, ...llm });
export type WorkerConfig = z.infer<typeof workerConfigSchema>;

export const migrateConfigSchema = z.object({ ...base, ...database });
export type MigrateConfig = z.infer<typeof migrateConfigSchema>;

type Env = Record<string, string | undefined>;

export type ParseConfigResult<T> = { ok: true; config: T } | { ok: false; problems: string[] };

export function parseConfig<S extends z.ZodType>(
  schema: S,
  env: Env,
): ParseConfigResult<z.infer<S>> {
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, value]) => value !== ""));
  const result = schema.safeParse(cleaned);
  if (result.success) return { ok: true, config: result.data };

  const problems = new Map<string, string>();
  for (const issue of result.error.issues) {
    const name = String(issue.path[0] ?? "(root)");
    if (problems.has(name)) continue;
    problems.set(
      name,
      cleaned[name] === undefined ? `missing ${name}` : `invalid ${name}: ${issue.message}`,
    );
  }
  return { ok: false, problems: [...problems.values()] };
}

export function loadConfig<S extends z.ZodType>(
  schema: S,
  process_: Pick<NodeJS.Process, "env" | "exit" | "stderr"> = process,
): z.infer<S> {
  const result = parseConfig(schema, process_.env);
  if (result.ok) return result.config;
  process_.stderr.write(
    `Invalid configuration:\n${result.problems.map((problem) => `  - ${problem}`).join("\n")}\n`,
  );
  return process_.exit(1);
}
