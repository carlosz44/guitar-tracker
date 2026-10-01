import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { Database } from "./client";

export const MIGRATIONS_FOLDER = fileURLToPath(
  new URL(import.meta.url.includes("/dist/") ? "../drizzle" : "../../drizzle", import.meta.url),
);

export function runMigrations(db: Database) {
  return migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
}
