import { createMiddleware } from "hono/factory";
import type { Allowlist, Auth, AuthSession } from "./auth";

export type SessionVariables = {
  user: AuthSession["user"];
  session: AuthSession["session"];
};

export function requireSession(auth: Auth, allowlist: Allowlist) {
  return createMiddleware<{ Variables: SessionVariables }>(async (c, next) => {
    const { headers, response } = await auth.api.getSession({
      headers: c.req.raw.headers,
      returnHeaders: true,
    });
    const forwardCookies = () => {
      for (const cookie of headers.getSetCookie()) c.res.headers.append("set-cookie", cookie);
    };

    if (!response || !allowlist.has(response.user.githubId)) {
      c.res = c.json({ error: "unauthorized" }, 401);
      forwardCookies();
      return;
    }

    c.set("user", response.user);
    c.set("session", response.session);
    await next();
    forwardCookies();
  });
}
