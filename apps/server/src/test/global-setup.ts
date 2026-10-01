import { Client } from "pg";
import type { TestProject } from "vitest/node";
import { createDatabase } from "../db/client";
import { runMigrations } from "../db/migrations";

const DEFAULT_TEST_DATABASE_URL =
  "postgres://guitartracker:guitartracker@localhost:5433/guitartracker_test";

declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

export default async function setup(project: TestProject) {
  const databaseUrl = process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL;
  const url = new URL(databaseUrl);
  const name = url.pathname.slice(1);
  if (!/^[a-z_][a-z0-9_]*_test$/.test(name)) {
    throw new Error("TEST_DATABASE_URL must point to a database whose name ends in _test");
  }

  const admin = new Client({
    connectionString: Object.assign(new URL(url), { pathname: "/postgres" }).toString(),
  });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${name}"`);
  } finally {
    await admin.end();
  }

  const { db, pool } = createDatabase(databaseUrl, { max: 1 });
  try {
    await runMigrations(db);
  } finally {
    await pool.end();
  }

  project.provide("databaseUrl", databaseUrl);
}
