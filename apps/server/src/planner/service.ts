import { planErrors } from "@ds/shared";
import { and, eq, lt, sql } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import type { Clock } from "../clock";
import type { Database, Tx } from "../db/client";
import { planDays, planItems, weeklyPlans } from "../db/schema";
import { type JobQueue, QUEUES } from "../jobs/boss";
import { assertCanCall, type LlmSettings, LlmUnavailable } from "../llm/usage";
import { addDays, cycleStart as cycleStartFor, practiceDate } from "../practice/rules";
import { getOrCreateSettings } from "../settings";
import {
  cycleLesson,
  findPlan,
  type PlanRow,
  planDaysWithItems,
  planForCycle,
  plannerTopics,
  practicedTopicsByDate,
} from "./queries";
import {
  buildDays,
  cycleDates,
  dayTarget,
  type PlannedItem,
  replanContext,
  scoreTopics,
  validatePlanDays,
} from "./rules";

export const STALE_LLM_MS = 15 * 60 * 1000;

export class PlanError extends Error {
  constructor(
    readonly status: 404 | 409 | 400,
    readonly key: string,
  ) {
    super(key);
  }
}

export interface PlanDeps {
  db: Database;
  clock: Clock;
  queue: JobQueue;
  llm: LlmSettings;
  defaultTimezone: string;
}

type PlanDayRow = Awaited<ReturnType<typeof planDaysWithItems>>[number];

async function lockPlan(tx: Tx, userId: string, planId: string) {
  const [plan] = await tx
    .select()
    .from(weeklyPlans)
    .where(and(eq(weeklyPlans.userId, userId), eq(weeklyPlans.id, planId)))
    .for("update");
  if (!plan) throw new PlanError(404, "not_found");
  return plan;
}

async function releaseStale(tx: Tx, plan: PlanRow) {
  if (plan.llmStatus !== "queued" && plan.llmStatus !== "running") return plan;
  const [stale] = await tx
    .update(weeklyPlans)
    .set({ llmStatus: "failed", llmError: "stale" })
    .where(
      and(
        eq(weeklyPlans.id, plan.id),
        lt(weeklyPlans.updatedAt, sql`now() - make_interval(secs => ${STALE_LLM_MS / 1000})`),
      ),
    )
    .returning();
  return stale ?? plan;
}

function assertEditable(plan: PlanRow) {
  if (plan.llmStatus === "queued" || plan.llmStatus === "running") {
    throw new PlanError(409, planErrors.locked);
  }
  if (plan.status === "replaced") throw new PlanError(409, planErrors.pastDay);
}

async function writeItems(tx: Tx, userId: string, dayId: string, items: readonly PlannedItem[]) {
  await tx.delete(planItems).where(eq(planItems.planDayId, dayId));
  if (items.length === 0) return;
  await tx.insert(planItems).values(
    items.map((item, position) => ({
      id: uuidv7(),
      userId,
      planDayId: dayId,
      position,
      topicId: item.topicId,
      label: item.topicId ? null : item.label,
      minutes: item.minutes,
    })),
  );
}

export function createPlanService(deps: PlanDeps) {
  const { db } = deps;

  async function context(userId: string) {
    const settings = await getOrCreateSettings(db, userId, deps.defaultTimezone);
    return { settings, today: practiceDate(deps.clock.now(), settings.timezone) };
  }

  async function queueClaude(
    tx: Tx,
    userId: string,
    timeZone: string,
    plan: PlanRow,
    dates: string[],
  ) {
    try {
      await assertCanCall(tx, deps.llm, { userId, timeZone, now: deps.clock.now() });
    } catch (error) {
      if (!(error instanceof LlmUnavailable)) throw error;
      await tx
        .update(weeklyPlans)
        .set({ llmStatus: "skipped", llmError: error.key })
        .where(eq(weeklyPlans.id, plan.id));
      return null;
    }
    await tx
      .update(weeklyPlans)
      .set({ llmStatus: "queued", llmError: null })
      .where(eq(weeklyPlans.id, plan.id));
    return () => deps.queue.send(QUEUES.weeklyPlan, { planId: plan.id, dates });
  }

  async function rebuild(
    tx: Tx,
    userId: string,
    plan: PlanRow,
    days: PlanDayRow[],
    dates: string[],
    today: string,
    replan = false,
  ) {
    const target = new Set(dates);
    const kept = days.filter((day) => !target.has(day.date));
    const usesSoFar = new Map<string, number>();
    const practiced = await practicedTopicsByDate(tx, userId, plan.cycleStart, plan.cycleEnd);
    let missedTopicIds: Set<string> | undefined;
    if (replan) {
      const past = days.filter((day) => day.date < today);
      const context = replanContext(
        past.map((day) => ({
          date: day.date,
          plannedTopicIds: day.items.flatMap((item) => (item.topicId ? [item.topicId] : [])),
          practicedTopicIds: [...(practiced.get(day.date) ?? [])],
        })),
      );
      missedTopicIds = context.missed;
      for (const [id, count] of context.uses) usesSoFar.set(id, count);
      for (const day of kept.filter((day) => day.date >= today)) {
        for (const item of day.items) {
          if (item.topicId) usesSoFar.set(item.topicId, (usesSoFar.get(item.topicId) ?? 0) + 1);
        }
      }
    } else {
      for (const day of kept) {
        for (const item of day.items) {
          if (item.topicId) usesSoFar.set(item.topicId, (usesSoFar.get(item.topicId) ?? 0) + 1);
        }
      }
    }
    const [topics, lesson] = await Promise.all([
      plannerTopics(tx, userId),
      cycleLesson(tx, userId, plan.cycleStart, plan.cycleEnd),
    ]);
    const lessonTopicIds = lesson?.topicIds ?? new Set<string>();
    const scored = scoreTopics(topics, {
      today: today > plan.cycleStart ? today : plan.cycleStart,
      lessonTopicIds,
      missedTopicIds,
    });
    const targets = days.filter((day) => target.has(day.date));
    const firstDate = targets[0]?.date;
    const previous = days.find((day) => firstDate && day.date === addDays(firstDate, -1));
    const built = buildDays(
      scored,
      targets.map((day) => ({ date: day.date, targetMinutes: day.targetMinutes })),
      {
        lessonTopicIds,
        usesSoFar,
        previousDayTopicIds: new Set(
          previous?.items.flatMap((item) => (item.topicId ? [item.topicId] : [])) ?? [],
        ),
      },
    );
    for (const day of built) {
      const row = targets.find((candidate) => candidate.date === day.date);
      if (!row) continue;
      await writeItems(tx, userId, row.id, day.items);
      await tx.update(planDays).set({ focusNote: "" }).where(eq(planDays.id, row.id));
    }
    await tx
      .update(weeklyPlans)
      .set({ source: "rules", ...(dates.length === days.length ? { weekNote: "" } : {}) })
      .where(eq(weeklyPlans.id, plan.id));
  }

  return {
    async current(userId: string, cycle?: string) {
      const { settings, today } = await context(userId);
      const start = cycle ?? cycleStartFor(today, settings.lessonWeekday);
      const { draft, active } = await planForCycle(db, userId, start);
      return { cycleStart: start, plan: draft ?? active, today };
    },

    async build(userId: string, cycle?: string) {
      const { settings, today } = await context(userId);
      const start = cycle ?? cycleStartFor(today, settings.lessonWeekday);
      const dates = cycleDates(start);
      let send: (() => Promise<void>) | null = null;
      const planId = await db.transaction(async (tx) => {
        await tx
          .delete(weeklyPlans)
          .where(
            and(
              eq(weeklyPlans.userId, userId),
              eq(weeklyPlans.cycleStart, start),
              eq(weeklyPlans.status, "draft"),
            ),
          );
        const [plan] = await tx
          .insert(weeklyPlans)
          .values({ id: uuidv7(), userId, cycleStart: start, cycleEnd: dates[6] ?? start })
          .returning();
        if (!plan) throw new Error("plan insert returned nothing");
        await tx.insert(planDays).values(
          dates.map((date) => ({
            id: uuidv7(),
            userId,
            planId: plan.id,
            date,
            targetMinutes: dayTarget(settings, date),
          })),
        );
        const days = await planDaysWithItems(tx, plan.id);
        await rebuild(tx, userId, plan, days, dates, today);
        send = await queueClaude(tx, userId, settings.timezone, plan, dates);
        return plan.id;
      });
      await (send as (() => Promise<void>) | null)?.();
      return planId;
    },

    async replaceDays(
      userId: string,
      planId: string,
      input: { date: string; items: PlannedItem[] }[],
    ) {
      const { today } = await context(userId);
      await db.transaction(async (tx) => {
        const plan = await releaseStale(tx, await lockPlan(tx, userId, planId));
        assertEditable(plan);
        if (plan.status === "active" && input.some((day) => day.date < today)) {
          throw new PlanError(409, planErrors.pastDay);
        }
        const days = await planDaysWithItems(tx, plan.id);
        const topics = await plannerTopics(tx, userId);
        const result = validatePlanDays(
          input,
          {
            targets: new Map(days.map((day) => [day.date, day.targetMinutes])),
            topicIds: new Set(topics.map((topic) => topic.id)),
          },
          { requireTotals: false },
        );
        if (!result.ok) {
          throw new PlanError(
            400,
            result.problem === "unknown_day" ? planErrors.day : planErrors.items,
          );
        }
        for (const day of input) {
          const row = days.find((candidate) => candidate.date === day.date);
          if (row) await writeItems(tx, userId, row.id, day.items);
        }
      });
    },

    async regenerate(userId: string, planId: string, scope: { date?: string; replan?: boolean }) {
      const { settings, today } = await context(userId);
      let send: (() => Promise<void>) | null = null;
      await db.transaction(async (tx) => {
        const plan = await releaseStale(tx, await lockPlan(tx, userId, planId));
        assertEditable(plan);
        const days = await planDaysWithItems(tx, plan.id);
        let dates: string[];
        if (scope.replan) {
          if (plan.status !== "active") throw new PlanError(409, planErrors.day);
          const practicedToday = (await practicedTopicsByDate(tx, userId, today, today)).size > 0;
          dates = days
            .map((day) => day.date)
            .filter((date) => date > today || (date === today && !practicedToday));
        } else if (scope.date) {
          if (!days.some((day) => day.date === scope.date))
            throw new PlanError(400, planErrors.day);
          if (plan.status === "active" && scope.date < today)
            throw new PlanError(409, planErrors.pastDay);
          dates = [scope.date];
        } else {
          dates = days
            .map((day) => day.date)
            .filter((date) => plan.status !== "active" || date >= today);
        }
        if (dates.length === 0) return;
        await rebuild(tx, userId, plan, days, dates, today, scope.replan);
        send = await queueClaude(tx, userId, settings.timezone, plan, dates);
      });
      await (send as (() => Promise<void>) | null)?.();
    },

    async accept(userId: string, planId: string) {
      await db.transaction(async (tx) => {
        const plan = await releaseStale(tx, await lockPlan(tx, userId, planId));
        assertEditable(plan);
        if (plan.status === "active") return;
        await tx
          .update(weeklyPlans)
          .set({ status: "replaced" })
          .where(
            and(
              eq(weeklyPlans.userId, userId),
              eq(weeklyPlans.cycleStart, plan.cycleStart),
              eq(weeklyPlans.status, "active"),
            ),
          );
        await tx.update(weeklyPlans).set({ status: "active" }).where(eq(weeklyPlans.id, plan.id));
      });
    },

    async find(userId: string, planId: string) {
      const { today } = await context(userId);
      return { plan: await findPlan(db, userId, planId), today };
    },
  };
}

export type PlanService = ReturnType<typeof createPlanService>;
