import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { Client } from "pg";
import { uuidv7 } from "uuidv7";
import { createAuth } from "../auth/auth";
import { apiConfigSchema, loadConfig } from "../config";
import { createDatabase } from "../db/client";
import { runMigrations } from "../db/migrations";
import { user, userSettings } from "../db/schema";
import { silentLogger } from "./logger";
import { SESSION_COOKIE_NAME, sessionCookie } from "./session";

const config = loadConfig(apiConfigSchema);
const stateFile = process.env.E2E_STATE_FILE;
if (!stateFile) throw new Error("E2E_STATE_FILE is required");
const databaseUrl = new URL(config.DATABASE_URL);
const name = databaseUrl.pathname.slice(1);
if (!/^[a-z_][a-z0-9_]*_e2e$/.test(name)) {
  throw new Error("DATABASE_URL must point to a database whose name ends in _e2e");
}

const admin = new Client({
  connectionString: Object.assign(new URL(databaseUrl), { pathname: "/postgres" }).toString(),
});
await admin.connect();
try {
  await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await admin.query(`CREATE DATABASE "${name}"`);
} finally {
  await admin.end();
}

const { db, pool } = createDatabase(config.DATABASE_URL, { max: 1 });
try {
  await runMigrations(db);
  const [githubId = ""] = config.ALLOWED_GITHUB_IDS;
  const userId = uuidv7();
  await db.insert(user).values({
    id: userId,
    name: "Carlos",
    email: `${githubId}@users.example.com`,
    githubId,
  });
  await db.insert(userSettings).values({ userId, timezone: config.DEFAULT_TIMEZONE });
  const auth = createAuth({
    db,
    logger: silentLogger,
    appUrl: config.APP_URL,
    secret: config.BETTER_AUTH_SECRET,
    github: { clientId: config.GITHUB_CLIENT_ID, clientSecret: config.GITHUB_CLIENT_SECRET },
    allowlist: new Set([githubId]),
    defaultTimezone: config.DEFAULT_TIMEZONE,
  });
  const session = await (await auth.$context).internalAdapter.createSession(userId);
  const cookie = await sessionCookie(session.token, config.BETTER_AUTH_SECRET);
  const state = {
    cookies: [
      {
        name: SESSION_COOKIE_NAME,
        value: cookie.slice(SESSION_COOKIE_NAME.length + 1),
        domain: new URL(config.APP_URL).hostname,
        path: "/",
        expires: -1,
        httpOnly: true,
        secure: false,
        sameSite: "Lax",
      },
    ],
    origins: [],
  };
  await mkdir(dirname(stateFile), { recursive: true });
  await writeFile(stateFile, JSON.stringify(state));
} finally {
  await pool.end();
}

await import("../api");
