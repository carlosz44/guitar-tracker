import { PgBoss } from "pg-boss";

export const QUEUES = {
  heartbeat: "system.heartbeat",
  backup: "system.backup",
} as const;

export function createBoss(connectionString: string) {
  return new PgBoss({
    connectionString,
    schema: "pgboss",
    max: 3,
    application_name: "guitar-tracker-worker",
  });
}

export type Boss = PgBoss;
