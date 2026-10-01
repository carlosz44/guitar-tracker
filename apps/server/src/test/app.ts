import { DEFAULT_TIMEZONE } from "@ds/shared";
import { createApp } from "../app";
import { createAuth } from "../auth/auth";
import { type Clock, systemClock } from "../clock";
import type { Database } from "../db/client";
import type { Logger } from "../logger";
import { validEnv } from "./env";
import { silentLogger } from "./logger";

export const TEST_APP_URL = validEnv.APP_URL;
export const ALLOWED_GITHUB_ID = "1001";
export const STRANGER_GITHUB_ID = "9999";

export function createTestApp(deps: {
  db: Database;
  clock?: Clock;
  logger?: Logger;
  staticRoot?: string;
  allowedGithubIds?: string[];
}) {
  const logger = deps.logger ?? silentLogger;
  const allowlist = new Set(deps.allowedGithubIds ?? [ALLOWED_GITHUB_ID]);
  const auth = createAuth({
    db: deps.db,
    logger,
    appUrl: TEST_APP_URL,
    secret: validEnv.BETTER_AUTH_SECRET,
    github: { clientId: validEnv.GITHUB_CLIENT_ID, clientSecret: validEnv.GITHUB_CLIENT_SECRET },
    allowlist,
    defaultTimezone: DEFAULT_TIMEZONE,
  });
  const app = createApp({
    db: deps.db,
    clock: deps.clock ?? systemClock,
    logger,
    auth,
    allowlist,
    defaultTimezone: DEFAULT_TIMEZONE,
    staticRoot: deps.staticRoot,
  });
  return { app, auth, allowlist };
}
