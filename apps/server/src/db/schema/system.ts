import { sql } from "drizzle-orm";
import { bigint, check, index, pgTable, smallint, text, uuid } from "drizzle-orm/pg-core";
import { instant } from "./columns";

export const workerHeartbeat = pgTable(
  "worker_heartbeat",
  {
    id: smallint().primaryKey().default(1),
    beatAt: instant().notNull(),
  },
  (table) => [check("worker_heartbeat_singleton_check", sql`${table.id} = 1`)],
);

export const BACKUP_STATUSES = ["running", "succeeded", "failed"] as const;
export type BackupStatus = (typeof BACKUP_STATUSES)[number];

export const backupRuns = pgTable(
  "backup_runs",
  {
    id: uuid().primaryKey(),
    startedAt: instant().notNull(),
    finishedAt: instant(),
    status: text().$type<BackupStatus>().notNull(),
    r2Key: text().notNull(),
    sizeBytes: bigint({ mode: "number" }),
    error: text(),
  },
  (table) => [
    check("backup_runs_status_check", sql`${table.status} IN ('running', 'succeeded', 'failed')`),
    index().on(table.status, table.finishedAt.desc()),
  ],
);
