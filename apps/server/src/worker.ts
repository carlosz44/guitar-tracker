import { systemClock } from "./clock";
import { loadConfig, workerConfigSchema } from "./config";
import { createDatabase } from "./db/client";
import { pgDumpSpawner, registerBackup } from "./jobs/backup";
import { createBoss } from "./jobs/boss";
import { registerFileJobs } from "./jobs/file-jobs";
import { recordHeartbeat, registerHeartbeat } from "./jobs/heartbeat";
import { createLogger } from "./logger";
import { createR2Storage } from "./storage/r2";

const config = loadConfig(workerConfigSchema);
const logger = createLogger({ service: "worker", level: config.LOG_LEVEL });
const { db, pool } = createDatabase(config.DATABASE_URL, { max: 3 });
const boss = createBoss(config.DATABASE_URL);
const clock = systemClock;

boss.on("error", (error) => logger.error({ err: error }, "pg-boss error"));

await boss.start();
const storage = createR2Storage({
  accountId: config.R2_ACCOUNT_ID,
  accessKeyId: config.R2_ACCESS_KEY_ID,
  secretAccessKey: config.R2_SECRET_ACCESS_KEY,
  bucket: config.R2_BUCKET,
});
await registerHeartbeat(boss, { db, clock });
await registerBackup(boss, {
  db,
  clock,
  logger,
  storage,
  dump: pgDumpSpawner(config.DATABASE_URL),
});
await registerFileJobs(boss, { db, clock, logger, storage });
await recordHeartbeat(db, clock);
logger.info("worker started");

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  logger.info({ signal }, "worker shutting down");
  try {
    await boss.stop({ graceful: true, timeout: 30_000 });
  } finally {
    await pool.end();
    process.exit(0);
  }
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
