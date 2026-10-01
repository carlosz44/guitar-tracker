import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { fakeClock } from "../clock";
import { llmRuns, weeklyPlans } from "../db/schema";
import { recordRun } from "../llm/usage";
import { bodyOf, createTestApp, TEST_APP_URL } from "../test/app";
import { useTestDatabase } from "../test/db";
import { fakeLlm } from "../test/fake-llm";
import { llmDeps } from "../test/llm";
import { linkTopic, seedLesson, seedTopic } from "../test/seed";
import { createSignedInUser } from "../test/session";
import { runWeeklyPlan } from "./weekly-plan-job";

const { db, truncateAll } = useTestDatabase();
const clock = fakeClock("2026-10-01T15:00:00Z");
const enabled = createTestApp({ db, clock });
const disabled = createTestApp({ db, clock, llm: { enabled: false } });

let carlos: Awaited<ReturnType<typeof createSignedInUser>>;
beforeEach(async () => {
  await truncateAll();
  enabled.jobs.sent.length = 0;
  carlos = await createSignedInUser(db, enabled.auth);
});

function call(method: string, path: string, app = enabled.app) {
  return app.request(`${TEST_APP_URL}/api${path}`, { method, headers: { cookie: carlos.cookie } });
}

interface Day {
  date: string;
  targetMinutes: number;
  focusNote: string;
  items: { topicId: string | null; label: string | null; minutes: number }[];
}

async function build(app = enabled.app) {
  const topics = await Promise.all(
    ["Tríadas", "Escalas", "Arpegios", "Ritmo"].map((title) =>
      seedTopic(db, carlos.userId, { title }),
    ),
  );
  const lesson = await seedLesson(db, carlos.userId, {
    date: "2026-10-01",
    summary: "Vimos tríadas en dórico",
  });
  await linkTopic(db, carlos.userId, lesson.id, topics[0]?.id ?? "");
  const plan = (await bodyOf(call("POST", "/plans", app))).plan as {
    id: string;
    days: Day[];
    llmStatus: string;
  };
  return { plan, topics };
}

const output = (
  days: Day[],
  change: (day: Day, index: number) => Day["items"] = (day) => day.items,
) => ({
  weekNote: "Semana para asentar las tríadas.",
  days: days.map((day, index) => ({
    date: day.date,
    focusNote: `Foco del día ${index + 1}`,
    items: change(day, index).map(({ topicId, label, minutes }) => ({ topicId, label, minutes })),
  })),
});

const planRow = async (id: string) =>
  (await db.select().from(weeklyPlans).where(eq(weeklyPlans.id, id)))[0];
const view = async (id: string) =>
  (await bodyOf(call("GET", `/plans/${id}`))).plan as {
    days: Day[];
    weekNote: string;
    llmStatus: string;
    llmError: string | null;
  };

describe("Claude's weekly plan", () => {
  it("AC-4: queues Claude after building, then applies a valid plan with notes", async () => {
    const { plan } = await build();
    expect(plan.llmStatus).toBe("queued");
    expect(enabled.jobs.sent).toEqual([
      {
        name: "llm.weekly-plan",
        data: { planId: plan.id, dates: plan.days.map((day) => day.date) },
      },
    ]);
    const adjusted = output(plan.days);
    const { client, requests } = fakeLlm({ output: adjusted });
    await runWeeklyPlan(
      llmDeps(db, client, { clock }),
      plan.id,
      plan.days.map((day) => day.date),
    );

    const text = requests[0]?.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("");
    expect(text).toContain("Vimos tríadas en dórico");
    expect(text).toContain('"title":"Tríadas"');
    expect(text).toContain('"targetMinutes":30');
    const after = await view(plan.id);
    expect(after).toMatchObject({
      llmStatus: "done",
      weekNote: "Semana para asentar las tríadas.",
    });
    expect(after.days[0]?.focusNote).toBe("Foco del día 1");
    expect(await planRow(plan.id)).toMatchObject({ source: "claude" });
    expect(await db.select().from(llmRuns)).toEqual([
      expect.objectContaining({ feature: "weekly_plan", subjectType: "plan", subjectId: plan.id }),
    ]);
  });

  it("AC-4: rejects a plan with an unknown topic, a wrong total or 4 topics, keeping the rule-based plan", async () => {
    for (const change of [
      (day: Day) =>
        day.items.map((item) =>
          item.topicId ? { ...item, topicId: "0199a000-0000-7000-8000-000000000009" } : item,
        ),
      (day: Day) =>
        day.items.map((item, i) => (i === 1 ? { ...item, minutes: item.minutes + 5 } : item)),
    ]) {
      await truncateAll();
      carlos = await createSignedInUser(db, enabled.auth);
      const { plan } = await build();
      const { client, requests } = fakeLlm({ output: output(plan.days, change) });
      await runWeeklyPlan(
        llmDeps(db, client, { clock }),
        plan.id,
        plan.days.map((day) => day.date),
      );
      expect(requests).toHaveLength(2);
      const after = await view(plan.id);
      expect(after).toMatchObject({ llmStatus: "rejected", llmError: "invalid_output" });
      expect(
        after.days.map((day) => day.items.map(({ topicId, minutes }) => [topicId, minutes])),
      ).toEqual(
        plan.days.map((day) => day.items.map(({ topicId, minutes }) => [topicId, minutes])),
      );
    }
  });

  it("only touches the regenerated days", async () => {
    const { plan } = await build();
    await db.update(weeklyPlans).set({ llmStatus: "queued" }).where(eq(weeklyPlans.id, plan.id));
    const day = plan.days[2] as Day;
    const { client } = fakeLlm({ output: output(plan.days) });
    await runWeeklyPlan(llmDeps(db, client, { clock }), plan.id, [day.date]);
    const after = await view(plan.id);
    expect(after.days[2]?.focusNote).toBe("Foco del día 3");
    expect(after.days[0]?.focusNote).toBe("");
    expect(after.weekNote).toBe("");
  });

  it("AC-5: without Claude the rule-based plan is kept with no notes, saying why", async () => {
    const { plan } = await build(disabled.app);
    expect(plan.llmStatus).toBe("skipped");
    expect((await planRow(plan.id))?.llmError).toBe("llm.disabled");
    expect(plan.days.every((day) => day.focusNote === "")).toBe(true);
  });

  it("AC-5: over this month's budget the plan is built without calling Claude", async () => {
    await recordRun(db, {
      userId: carlos.userId,
      feature: "lesson_enrichment",
      model: "claude-sonnet-5-5",
      usage: { inputTokens: 5_000_000, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
      latencyMs: 1,
    });
    await db.update(llmRuns).set({ createdAt: new Date("2026-10-01T12:00:00Z") });
    const { plan } = await build();
    expect(plan.llmStatus).toBe("skipped");
    expect((await planRow(plan.id))?.llmError).toBe("llm.budget");
    expect(enabled.jobs.sent).toEqual([]);
  });
});
