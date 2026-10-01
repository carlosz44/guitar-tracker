import { createPlanSchema, currentPlanQuerySchema, putPlanDaysSchema } from "@ds/shared";
import { zValidator } from "@hono/zod-validator";
import { type Context, Hono } from "hono";
import { z } from "zod";
import type { SessionVariables } from "../auth/require-session";
import { idParam, validate } from "../http/validate";
import { planView } from "./queries";
import { createPlanService, type PlanDeps, PlanError } from "./service";

const dayParam = zValidator(
  "param",
  z.object({ id: z.uuid(), date: z.iso.date() }),
  (result, c) => {
    if (!result.success) return c.json({ error: "not_found" as const }, 404);
  },
);

export function createPlanRoutes(deps: PlanDeps) {
  const service = createPlanService(deps);

  async function respond(
    c: Context<{ Variables: SessionVariables }>,
    planId: string,
    run: () => Promise<unknown> = async () => undefined,
  ) {
    const userId = c.get("user").id;
    try {
      await run();
    } catch (error) {
      if (error instanceof PlanError) return c.json({ error: error.key }, error.status);
      throw error;
    }
    const { plan, today } = await service.find(userId, planId);
    if (!plan) return c.json({ error: "not_found" as const }, 404);
    return c.json({ plan: await planView(deps.db, userId, plan, today) }, 200);
  }

  return new Hono<{ Variables: SessionVariables }>()
    .get("/current", validate("query", currentPlanQuerySchema), async (c) => {
      const userId = c.get("user").id;
      const { cycleStart, plan, today } = await service.current(userId, c.req.valid("query").cycle);
      return c.json(
        { cycleStart, plan: plan ? await planView(deps.db, userId, plan, today) : null },
        200,
      );
    })
    .post("/", validate("json", createPlanSchema), async (c) => {
      const userId = c.get("user").id;
      const planId = await service.build(userId, c.req.valid("json").cycleStart);
      const { plan, today } = await service.find(userId, planId);
      if (!plan) throw new Error("plan missing after build");
      return c.json({ plan: await planView(deps.db, userId, plan, today) }, 201);
    })
    .get("/:id", idParam, (c) => respond(c, c.req.valid("param").id))
    .put("/:id/days", idParam, validate("json", putPlanDaysSchema), (c) => {
      const { id } = c.req.valid("param");
      return respond(c, id, () =>
        service.replaceDays(c.get("user").id, id, c.req.valid("json").days),
      );
    })
    .post("/:id/days/:date/regenerate", dayParam, (c) => {
      const { id, date } = c.req.valid("param");
      return respond(c, id, () => service.regenerate(c.get("user").id, id, { date }));
    })
    .post("/:id/regenerate", idParam, (c) => {
      const { id } = c.req.valid("param");
      return respond(c, id, () => service.regenerate(c.get("user").id, id, {}));
    })
    .post("/:id/replan", idParam, (c) => {
      const { id } = c.req.valid("param");
      return respond(c, id, () => service.regenerate(c.get("user").id, id, { replan: true }));
    })
    .post("/:id/accept", idParam, (c) => {
      const { id } = c.req.valid("param");
      return respond(c, id, () => service.accept(c.get("user").id, id));
    });
}
