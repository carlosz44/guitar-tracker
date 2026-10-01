import { serveStatic } from "@hono/node-server/serve-static";
import type { Hono } from "hono";

const IMMUTABLE = "public, max-age=31536000, immutable";
const REVALIDATE = "no-cache";

export function mountStatic(app: Hono, root: string) {
  app.use("*", async (c, next) => {
    await next();
    if (c.req.path.startsWith("/api/") || !c.res.ok) return;
    c.header("Cache-Control", c.req.path.startsWith("/assets/") ? IMMUTABLE : REVALIDATE);
  });
  app.use("*", serveStatic({ root }));
  app.get("*", async (c, next) => {
    if (/\.[a-z0-9]+$/i.test(c.req.path)) return c.notFound();
    return next();
  });
  app.get("*", serveStatic({ root, path: "index.html" }));
}
