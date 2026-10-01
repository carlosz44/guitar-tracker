import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { createAuth } from "./auth/auth";
import { systemClock } from "./clock";
import { apiConfigSchema, loadConfig } from "./config";
import { createDatabase } from "./db/client";
import { createLogger } from "./logger";

const config = loadConfig(apiConfigSchema);
const logger = createLogger({ service: "api", level: config.LOG_LEVEL });
const { db, pool } = createDatabase(config.DATABASE_URL, { max: 5 });

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
    pool.end().finally(() => process.exit(0));
  });
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
