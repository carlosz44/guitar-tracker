import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type Database = ReturnType<typeof createDatabase>["db"];
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export function createDatabase(connectionString: string, options: { max: number }) {
  const pool = new Pool({ connectionString, max: options.max, connectionTimeoutMillis: 5_000 });
  const db = drizzle({ client: pool, schema, casing: "snake_case" });
  return { db, pool };
}
