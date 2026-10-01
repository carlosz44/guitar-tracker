import { DEFAULT_TIMEZONE } from "@ds/shared";
import { createApp } from "../app";
import { createAuth } from "../auth/auth";
import { type Clock, systemClock } from "../clock";
import type { Database } from "../db/client";
import type { LlmSettings } from "../llm/usage";
import type { Logger } from "../logger";
import type { ObjectStorage } from "../storage/r2";
import { validEnv } from "./env";
import { silentLogger } from "./logger";
import { memoryQueue } from "./memory-queue";
import { memoryStorage } from "./memory-storage";

export const TEST_APP_URL = validEnv.APP_URL;
export const ALLOWED_GITHUB_ID = "1001";
export const STRANGER_GITHUB_ID = "9999";
export const TEST_STORAGE_ORIGIN = "https://storage.test";

export function createTestApp(deps: {
  db: Database;
  clock?: Clock;
  logger?: Logger;
  staticRoot?: string;
  allowedGithubIds?: string[];
  storage?: ObjectStorage;
  llm?: Partial<LlmSettings>;
}) {
  const memory = memoryStorage();
  const jobs = memoryQueue();
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
    storage: deps.storage ?? memory.storage,
    queue: jobs.queue,
    llm: { enabled: true, model: "claude-sonnet-5-5", budgetUsd: 10, ...deps.llm },
    storageOrigin: TEST_STORAGE_ORIGIN,
    staticRoot: deps.staticRoot,
  });
  return { app, auth, allowlist, storage: memory, jobs };
}

// biome-ignore lint/suspicious/noExplicitAny: tests assert response bodies structurally.
export async function bodyOf(response: Response | Promise<Response>): Promise<any> {
  return (await response).json();
}
