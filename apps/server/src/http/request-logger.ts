import { createMiddleware } from "hono/factory";
import type { Logger } from "../logger";

export function requestLogger(logger: Logger) {
  return createMiddleware(async (c, next) => {
    const started = performance.now();
    await next();
    logger.info(
      {
        method: c.req.method,
        path: c.req.path,
        status: c.res.status,
        durationMs: Math.round(performance.now() - started),
      },
      "request",
    );
  });
}
