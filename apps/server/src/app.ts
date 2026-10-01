import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import type { Allowlist, Auth } from "./auth/auth";
import { requireSession } from "./auth/require-session";
import type { Clock } from "./clock";
import type { Database } from "./db/client";
import { createFileRoutes } from "./files/routes";
import { requestLogger } from "./http/request-logger";
import { mountStatic } from "./http/static";
import type { JobQueue } from "./jobs/boss";
import { createLessonRoutes } from "./lessons/routes";
import type { Logger } from "./logger";
import { createQuestionRoutes } from "./questions/routes";
import { createHealthRoutes } from "./routes/health";
import { createMeRoutes } from "./routes/me";
import { createSettingsRoutes } from "./routes/settings";
import type { ObjectStorage } from "./storage/r2";
import { createTopicRoutes } from "./topics/routes";

export interface AppDeps {
  db: Database;
  clock: Clock;
  logger: Logger;
  auth: Auth;
  allowlist: Allowlist;
  defaultTimezone: string;
  storage: ObjectStorage;
  queue: JobQueue;
  storageOrigin: string;
  staticRoot?: string;
}

export function createApiRoutes(deps: AppDeps) {
  return new Hono()
    .basePath("/api")
    .route("/health", createHealthRoutes(deps))
    .use("*", requireSession(deps.auth, deps.allowlist))
    .route("/me", createMeRoutes(deps))
    .route("/settings", createSettingsRoutes(deps))
    .route("/lessons", createLessonRoutes(deps))
    .route("/topics", createTopicRoutes(deps))
    .route("/questions", createQuestionRoutes(deps))
    .route("/files", createFileRoutes(deps));
}
export type AppType = ReturnType<typeof createApiRoutes>;

export function createApp(deps: AppDeps) {
  const app = new Hono();

  app.use(
    secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: [
          "'self'",
          "data:",
          "blob:",
          "https://avatars.githubusercontent.com",
          deps.storageOrigin,
        ],
        connectSrc: ["'self'", deps.storageOrigin],
        fontSrc: ["'self'"],
        manifestSrc: ["'self'"],
        workerSrc: ["'self'", "blob:"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
    }),
  );
  app.use("/api/*", requestLogger(deps.logger));

  app.onError((error, c) => {
    deps.logger.error({ err: error, path: c.req.path }, "unhandled error");
    return c.json({ error: "internal" }, 500);
  });

  app.on(["GET", "POST"], "/api/auth/*", (c) => deps.auth.handler(c.req.raw));
  app.route("/", createApiRoutes(deps));
  app.all("/api/*", (c) => c.json({ error: "not_found" }, 404));

  if (deps.staticRoot) mountStatic(app, deps.staticRoot);

  return app;
}
