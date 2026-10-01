import { loadConfig, migrateConfigSchema } from "./config";
import { createDatabase } from "./db/client";
import { runMigrations } from "./db/migrations";
import { createLogger } from "./logger";

const config = loadConfig(migrateConfigSchema);
const logger = createLogger({ service: "migrate", level: config.LOG_LEVEL });
const { db, pool } = createDatabase(config.DATABASE_URL, { max: 1 });

const started = performance.now();
try {
  await runMigrations(db);
  logger.info({ durationMs: Math.round(performance.now() - started) }, "migrations applied");
} catch (error) {
  logger.error({ err: error }, "migrations failed");
  process.exitCode = 1;
} finally {
  await pool.end();
}
