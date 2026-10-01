import { uuidv7 } from "uuidv7";
import type { Auth } from "../auth/auth";
import type { Database } from "../db/client";
import { user, userSettings } from "../db/schema";
import { ALLOWED_GITHUB_ID } from "./app";
import { validEnv } from "./env";

export const SESSION_COOKIE_NAME = "better-auth.session_token";

export async function sessionCookie(token: string, secret = validEnv.BETTER_AUTH_SECRET) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(token));
  const base64 = btoa(String.fromCharCode(...new Uint8Array(signature)));
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(`${token}.${base64}`)}`;
}

export async function createSignedInUser(
  db: Database,
  auth: Auth,
  options: { githubId?: string; name?: string } = {},
) {
  const userId = uuidv7();
  const githubId = options.githubId ?? ALLOWED_GITHUB_ID;
  await db.insert(user).values({
    id: userId,
    name: options.name ?? "Carlos",
    email: `${githubId}@users.example.com`,
    githubId,
    image: "https://avatars.example.com/u/1001",
  });
  await db.insert(userSettings).values({ userId });
  const context = await auth.$context;
  const session = await context.internalAdapter.createSession(userId);
  return { userId, session, cookie: await sessionCookie(session.token) };
}
