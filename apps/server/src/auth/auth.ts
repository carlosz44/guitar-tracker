import { AUTH_ERROR_NOT_ALLOWLISTED } from "@ds/shared";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { eq } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import type { Database } from "../db/client";
import { account, session, user, userSettings, verification } from "../db/schema";
import type { Logger } from "../logger";

const DAY_SECONDS = 24 * 60 * 60;
export const SESSION_EXPIRES_IN_SECONDS = 90 * DAY_SECONDS;
export const SESSION_UPDATE_AGE_SECONDS = DAY_SECONDS;

export type Allowlist = ReadonlySet<string>;

export interface AuthOptions {
  db: Database;
  logger: Logger;
  appUrl: string;
  secret: string;
  github: { clientId: string; clientSecret: string };
  allowlist: Allowlist;
  defaultTimezone: string;
}

function notAllowlisted() {
  return new APIError("FORBIDDEN", {
    code: AUTH_ERROR_NOT_ALLOWLISTED,
    message: "This GitHub account is not allowed to sign in",
  });
}

export function createAuth(options: AuthOptions) {
  const { db, logger, allowlist } = options;

  return betterAuth({
    appName: "Daily Shed",
    baseURL: options.appUrl,
    basePath: "/api/auth",
    secret: options.secret,
    trustedOrigins: [options.appUrl],
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: { user, session, account, verification },
      transaction: true,
    }),
    advanced: { database: { generateId: () => uuidv7() } },
    session: {
      expiresIn: SESSION_EXPIRES_IN_SECONDS,
      updateAge: SESSION_UPDATE_AGE_SECONDS,
    },
    account: { accountLinking: { enabled: false } },
    user: {
      additionalFields: {
        githubId: { type: "string", required: true },
      },
    },
    socialProviders: {
      github: {
        clientId: options.github.clientId,
        clientSecret: options.github.clientSecret,
        mapProfileToUser: (profile) => ({ githubId: String(profile.id) }),
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (data) => {
            if (!allowlist.has(String(data.githubId))) {
              logger.warn({ githubId: String(data.githubId) }, "sign-in rejected: not allowlisted");
              throw notAllowlisted();
            }
          },
          // Queued by Better Auth until the user's transaction has committed.
          after: async (created) => {
            await db
              .insert(userSettings)
              .values({ userId: created.id, timezone: options.defaultTimezone })
              .onConflictDoNothing();
          },
        },
        update: {
          // Hook results are merged into the update, so githubId can't be stripped; reject instead.
          before: async (data) => {
            if ((data as Record<string, unknown>).githubId !== undefined) {
              throw new APIError("BAD_REQUEST", {
                code: "github_id_immutable",
                message: "githubId can't be changed",
              });
            }
          },
        },
      },
      session: {
        create: {
          before: async (data) => {
            const [row] = await db
              .select({ githubId: user.githubId })
              .from(user)
              .where(eq(user.id, data.userId));
            if (!row || !allowlist.has(row.githubId)) {
              logger.warn({ userId: data.userId }, "session rejected: not allowlisted");
              throw notAllowlisted();
            }
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type AuthSession = NonNullable<Awaited<ReturnType<Auth["api"]["getSession"]>>>;
