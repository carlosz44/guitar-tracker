import {
  blockActionSchema,
  finishSessionSchema,
  historyQuerySchema,
  manualSessionSchema,
  pauseSchema,
  startSessionSchema,
  updateSessionSchema,
} from "@ds/shared";
import { zValidator } from "@hono/zod-validator";
import { type Context, Hono } from "hono";
import { z } from "zod";
import type { SessionVariables } from "../auth/require-session";
import { idParam, validate } from "../http/validate";
import { createHistoryService } from "./history";
import { createSessionService, type SessionDeps, SessionError } from "./sessions";

const blockParams = zValidator(
  "param",
  z.object({ id: z.uuid(), blockId: z.uuid() }),
  (result, c) => {
    if (!result.success) return c.json({ error: "not_found" as const }, 404);
  },
);

function failure(c: Context, error: unknown) {
  if (error instanceof SessionError)
    return c.json({ error: error.key, ...error.extra }, error.status);
  throw error;
}

export function createSessionRoutes(deps: SessionDeps) {
  const service = createSessionService(deps);
  const history = createHistoryService(deps);

  return new Hono<{ Variables: SessionVariables }>()
    .get("/", validate("query", historyQuerySchema), async (c) =>
      c.json(await history.history(c.get("user").id, c.req.valid("query")), 200),
    )
    .post("/manual", validate("json", manualSessionSchema), async (c) => {
      try {
        return c.json(
          { session: await history.manual(c.get("user").id, c.req.valid("json")) },
          201,
        );
      } catch (error) {
        return failure(c, error);
      }
    })
    .post("/", validate("json", startSessionSchema), async (c) => {
      try {
        return c.json(
          { session: await service.start(c.get("user").id, c.req.valid("json").blocks) },
          201,
        );
      } catch (error) {
        return failure(c, error);
      }
    })
    .get("/:id", idParam, async (c) => {
      try {
        return c.json(
          { session: await service.view(c.get("user").id, c.req.valid("param").id) },
          200,
        );
      } catch (error) {
        return failure(c, error);
      }
    })
    .patch("/:id", idParam, validate("json", updateSessionSchema), async (c) => {
      try {
        const session = await service.update(
          c.get("user").id,
          c.req.valid("param").id,
          c.req.valid("json"),
        );
        return c.json({ session }, 200);
      } catch (error) {
        return failure(c, error);
      }
    })
    .delete("/:id", idParam, async (c) => {
      try {
        await service.remove(c.get("user").id, c.req.valid("param").id);
        return c.body(null, 204);
      } catch (error) {
        return failure(c, error);
      }
    })
    .post("/:id/pause", idParam, validate("json", pauseSchema), async (c) => {
      try {
        const session = await service.pause(
          c.get("user").id,
          c.req.valid("param").id,
          c.req.valid("json").at,
        );
        return c.json({ session }, 200);
      } catch (error) {
        return failure(c, error);
      }
    })
    .post("/:id/resume", idParam, validate("json", pauseSchema), async (c) => {
      try {
        const session = await service.resume(
          c.get("user").id,
          c.req.valid("param").id,
          c.req.valid("json").at,
        );
        return c.json({ session }, 200);
      } catch (error) {
        return failure(c, error);
      }
    })
    .patch("/:id/blocks/:blockId", blockParams, validate("json", blockActionSchema), async (c) => {
      try {
        const { id, blockId } = c.req.valid("param");
        const session = await service.blockAction(
          c.get("user").id,
          id,
          blockId,
          c.req.valid("json"),
        );
        return c.json({ session }, 200);
      } catch (error) {
        return failure(c, error);
      }
    })
    .post("/:id/finish", idParam, validate("json", finishSessionSchema), async (c) => {
      try {
        const session = await service.finish(
          c.get("user").id,
          c.req.valid("param").id,
          c.req.valid("json").notes,
        );
        return c.json({ session }, 200);
      } catch (error) {
        return failure(c, error);
      }
    })
    .post("/:id/abandon", idParam, async (c) => {
      try {
        return c.json(
          { session: await service.abandon(c.get("user").id, c.req.valid("param").id) },
          200,
        );
      } catch (error) {
        return failure(c, error);
      }
    });
}
