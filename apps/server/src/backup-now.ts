import { systemClock } from "./clock";
import { loadConfig, workerConfigSchema } from "./config";
import { createDatabase } from "./db/client";
import { describeError, pgDumpSpawner, runBackup } from "./jobs/backup";
import { createLogger } from "./logger";
import { createR2Storage } from "./storage/r2";

const config = loadConfig(workerConfigSchema);
const logger = createLogger({ service: "worker", level: config.LOG_LEVEL });
const { db, pool } = createDatabase(config.DATABASE_URL, { max: 1 });

try {
  await runBackup({
    db,
    clock: systemClock,
    logger,
    storage: createR2Storage({
      accountId: config.R2_ACCOUNT_ID,
      accessKeyId: config.R2_ACCESS_KEY_ID,
      secretAccessKey: config.R2_SECRET_ACCESS_KEY,
      bucket: config.R2_BUCKET,
      endpoint: config.R2_ENDPOINT,
    }),
    dump: pgDumpSpawner(config.DATABASE_URL),
  });
} catch (error) {
  logger.error({ error: describeError(error) }, "backup failed");
  process.exitCode = 1;
} finally {
  await pool.end();
}
