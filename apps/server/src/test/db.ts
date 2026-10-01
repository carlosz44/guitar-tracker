import { sql } from "drizzle-orm";
import { afterAll, inject } from "vitest";
import { createDatabase } from "../db/client";

export function useTestDatabase() {
  const { db, pool } = createDatabase(inject("databaseUrl"), { max: 2 });
  afterAll(() => pool.end());

  return {
    db,
    pool,
    async truncateAll() {
      await db.execute(
        sql`TRUNCATE "user", "verification", "worker_heartbeat", "backup_runs" RESTART IDENTITY CASCADE`,
      );
    },
  };
}
