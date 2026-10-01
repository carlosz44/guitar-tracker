import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { createAuth } from "./auth/auth";
import { systemClock } from "./clock";
import { apiConfigSchema, loadConfig } from "./config";
import { createDatabase } from "./db/client";
import { bossQueue, createBoss, ensureQueue, QUEUES } from "./jobs/boss";
import { createLogger } from "./logger";
import { createR2Storage, r2Origin } from "./storage/r2";

const config = loadConfig(apiConfigSchema);
const logger = createLogger({ service: "api", level: config.LOG_LEVEL });
const { db, pool } = createDatabase(config.DATABASE_URL, { max: 4 });
const boss = createBoss(config.DATABASE_URL, "api");
boss.on("error", (error) => logger.error({ err: error }, "pg-boss error"));
await boss.start();
await ensureQueue(boss, QUEUES.fileExtract);
await ensureQueue(boss, QUEUES.lessonEnrich);
await ensureQueue(boss, QUEUES.topicImprove);

const allowlist = new Set(config.ALLOWED_GITHUB_IDS);
const auth = createAuth({
  db,
  logger,
  appUrl: config.APP_URL,
  secret: config.BETTER_AUTH_SECRET,
  github: { clientId: config.GITHUB_CLIENT_ID, clientSecret: config.GITHUB_CLIENT_SECRET },
  allowlist,
  defaultTimezone: config.DEFAULT_TIMEZONE,
});

const app = createApp({
  db,
  clock: systemClock,
  logger,
  auth,
  allowlist,
  defaultTimezone: config.DEFAULT_TIMEZONE,
  storage: createR2Storage({
    accountId: config.R2_ACCOUNT_ID,
    accessKeyId: config.R2_ACCESS_KEY_ID,
    secretAccessKey: config.R2_SECRET_ACCESS_KEY,
    bucket: config.R2_BUCKET,
    endpoint: config.R2_ENDPOINT,
  }),
  queue: bossQueue(boss),
  llm: {
    enabled: Boolean(config.ANTHROPIC_API_KEY),
    model: config.LLM_MODEL_DEFAULT,
    budgetUsd: config.LLM_MONTHLY_BUDGET_USD,
  },
  storageOrigin: r2Origin(config.R2_ACCOUNT_ID, config.R2_ENDPOINT),
  staticRoot:
    config.NODE_ENV === "production"
      ? fileURLToPath(new URL("../../web/dist", import.meta.url))
      : undefined,
});

const server = serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  logger.info({ port: info.port }, "api listening");
});

function shutdown(signal: string) {
  logger.info({ signal }, "api shutting down");
  server.close(() => {
    boss
      .stop({ graceful: true, timeout: 10_000 })
      .then(() => pool.end())
      .finally(() => process.exit(0));
  });
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
