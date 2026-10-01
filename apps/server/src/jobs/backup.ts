import { spawn } from "node:child_process";
import { PassThrough, type Readable } from "node:stream";
import { S3ServiceException } from "@aws-sdk/client-s3";
import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import { eq } from "drizzle-orm";
import type { JobWithMetadata } from "pg-boss";
import { uuidv7 } from "uuidv7";
import type { Clock } from "../clock";
import type { Database } from "../db/client";
import { backupRuns } from "../db/schema";
import type { Logger } from "../logger";
import { backupKey, backupKeyDate, backupPrefix } from "../storage/keys";
import type { ObjectStorage } from "../storage/r2";
import { type Boss, QUEUES } from "./boss";

export const BACKUP_CRON = "30 3 * * *";
export const BACKUP_TIMEZONE = "America/Lima";
export const BACKUP_RETENTION_DAYS = 30;
export const BACKUP_QUEUE_OPTIONS = {
  retryLimit: 3,
  retryBackoff: true,
  retryDelay: 60,
  expireInSeconds: 30 * 60,
} as const;

export interface DumpProcess {
  stdout: Readable;
  exited: Promise<void>;
  kill(): void;
}
export type DumpSpawner = () => DumpProcess;

export class BackupError extends Error {
  override name = "BackupError";
}

export function spawnDump(command: string, args: string[], env: NodeJS.ProcessEnv): DumpProcess {
  const child = spawn(command, args, { env, stdio: ["ignore", "pipe", "ignore"] });
  const exited = new Promise<void>((resolve, reject) => {
    child.once("error", (error: NodeJS.ErrnoException) =>
      reject(new BackupError(`${command} could not start (${error.code ?? "unknown"})`)),
    );
    child.once("close", (code, signal) => {
      if (code === 0) resolve();
      else reject(new BackupError(`${command} exited with ${code ?? signal}`));
    });
  });
  return { stdout: child.stdout, exited, kill: () => child.kill("SIGTERM") };
}

export function pgDumpSpawner(databaseUrl: string): DumpSpawner {
  const url = new URL(databaseUrl);
  const env = {
    PATH: process.env.PATH,
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: url.pathname.slice(1),
  };
  return () => spawnDump("pg_dump", ["--format=custom", "--no-owner"], env);
}

export function limaDate(instant: Date) {
  return format(new TZDate(instant, BACKUP_TIMEZONE), "yyyy-MM-dd");
}

function subtractDays(date: string, days: number) {
  const utc = new Date(`${date}T00:00:00Z`);
  utc.setUTCDate(utc.getUTCDate() - days);
  return utc.toISOString().slice(0, 10);
}

export function describeError(error: unknown): string {
  if (error instanceof BackupError) return error.message;
  if (error instanceof S3ServiceException) {
    return `storage ${error.name} (${error.$metadata.httpStatusCode ?? "no status"})`;
  }
  const code = (error as { code?: unknown }).code;
  if (typeof code === "string") return `${(error as Error).name ?? "Error"} ${code}`;
  return error instanceof Error ? error.name : "unknown error";
}

export interface BackupDeps {
  db: Database;
  storage: ObjectStorage;
  clock: Clock;
  dump: DumpSpawner;
  logger: Logger;
}

export async function runBackup(deps: BackupDeps) {
  const startedAt = deps.clock.now();
  const date = limaDate(startedAt);
  const key = backupKey(date);
  const runId = uuidv7();
  await deps.db.insert(backupRuns).values({ id: runId, startedAt, status: "running", r2Key: key });

  let size = 0;
  try {
    const dump = deps.dump();
    const counted = new PassThrough();
    counted.on("data", (chunk: Buffer) => {
      size += chunk.length;
    });
    dump.stdout.pipe(counted);

    const [upload, exit] = await Promise.allSettled([
      deps.storage.uploadStream(key, counted, "application/octet-stream"),
      dump.exited,
    ]);
    if (exit.status === "rejected") {
      if (upload.status === "fulfilled") await deps.storage.delete(key).catch(() => undefined);
      throw exit.reason;
    }
    if (upload.status === "rejected") {
      dump.kill();
      throw upload.reason;
    }
    if (size === 0) throw new BackupError("dump was empty");
  } catch (error) {
    await deps.db
      .update(backupRuns)
      .set({ status: "failed", finishedAt: deps.clock.now(), error: describeError(error) })
      .where(eq(backupRuns.id, runId));
    throw error;
  }

  await deps.db
    .update(backupRuns)
    .set({ status: "succeeded", finishedAt: deps.clock.now(), sizeBytes: size })
    .where(eq(backupRuns.id, runId));
  deps.logger.info({ runId, key, sizeBytes: size }, "backup uploaded");

  await pruneBackups(deps, date);
  return { runId, key, sizeBytes: size };
}

export async function pruneBackups(deps: Pick<BackupDeps, "storage" | "logger">, today: string) {
  const cutoff = subtractDays(today, BACKUP_RETENTION_DAYS);
  try {
    const objects = await deps.storage.list(backupPrefix);
    const expired = objects.filter(({ key }) => {
      const date = backupKeyDate(key);
      return date !== null && date < cutoff;
    });
    for (const { key } of expired) await deps.storage.delete(key);
    if (expired.length > 0) deps.logger.info({ deleted: expired.length }, "old backups deleted");
  } catch (error) {
    deps.logger.warn({ error: describeError(error) }, "pruning old backups failed");
  }
}

export async function registerBackup(boss: Boss, deps: BackupDeps) {
  await boss.createQueue(QUEUES.backup, BACKUP_QUEUE_OPTIONS);
  await boss.schedule(QUEUES.backup, BACKUP_CRON, null, { tz: BACKUP_TIMEZONE, missed: "once" });
  await boss.work(QUEUES.backup, { includeMetadata: true }, ([job]) =>
    job ? handleBackupJob(deps, job) : Promise.resolve(),
  );
}

export async function handleBackupJob(
  deps: BackupDeps,
  job: Pick<JobWithMetadata, "id" | "retryCount" | "retryLimit">,
) {
  try {
    await runBackup(deps);
  } catch (error) {
    const final = job.retryCount >= job.retryLimit;
    const fields = {
      jobId: job.id,
      attempt: job.retryCount + 1,
      maxAttempts: job.retryLimit + 1,
      error: describeError(error),
    };
    if (final) deps.logger.error(fields, "backup failed");
    else deps.logger.warn(fields, "backup attempt failed, will retry");
    throw new BackupError(fields.error);
  }
}
