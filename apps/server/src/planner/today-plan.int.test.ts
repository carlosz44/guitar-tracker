import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { fakeClock } from "../clock";
import { planDays, practiceDays, practiceSessions } from "../db/schema";
import { bodyOf, createTestApp, TEST_APP_URL } from "../test/app";
import { useTestDatabase } from "../test/db";
import { seedLesson, seedTopic } from "../test/seed";
import { createSignedInUser } from "../test/session";

const { db, truncateAll } = useTestDatabase();
const clock = fakeClock("2026-10-02T15:00:00Z");
const { app, auth } = createTestApp({ db, clock, llm: { enabled: false } });

let carlos: Awaited<ReturnType<typeof createSignedInUser>>;
beforeEach(async () => {
  await truncateAll();
  clock.set("2026-10-02T15:00:00Z");
  carlos = await createSignedInUser(db, auth);
});

function call(method: string, path: string, body?: unknown) {
  return app.request(`${TEST_APP_URL}/api${path}`, {
    method,
    headers: {
      cookie: carlos.cookie,
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

async function activePlan() {
  await seedTopic(db, carlos.userId, { title: "Tríadas" });
  await seedTopic(db, carlos.userId, { title: "Escalas" });
  const plan = (await bodyOf(call("POST", "/plans", {}))).plan as {
    id: string;
    days: { id: string; date: string; items: { topicId: string | null; minutes: number }[] }[];
  };
  await call("POST", `/plans/${plan.id}/accept`);
  const today = plan.days.find((day) => day.date === "2026-10-02");
  if (!today) throw new Error("no plan day for today");
  await db
    .update(planDays)
    .set({ focusNote: "Tríadas limpias a 80", targetMinutes: 40 })
    .where(eq(planDays.id, today.id));
  return { plan, today };
}

describe("Hoy with a plan", () => {
  it("AC-12: shows today's plan blocks, focus note and target instead of the suggestion", async () => {
    const { plan, today } = await activePlan();
    const body = await bodyOf(call("GET", "/today"));
    expect(body.targetMinutes).toBe(40);
    expect(body.plan).toMatchObject({
      id: plan.id,
      dayId: today.id,
      focusNote: "Tríadas limpias a 80",
    });
    expect(body.plan.blocks.map((block: { topicId: string | null }) => block.topicId)).toEqual(
      today.items.map((item) => item.topicId),
    );
    expect(body.plan.blocks[0]).toMatchObject({
      label: "Calentamiento",
      title: "Calentamiento",
      minutes: 5,
    });
  });

  it("AC-12: starting from the plan links the session to today's plan day and snapshots its target", async () => {
    const { plan, today } = await activePlan();
    const start = await call("POST", "/sessions", {
      blocks: [{ topicId: null, label: "Calentamiento", plannedSeconds: 300 }],
      planDayId: today.id,
    });
    expect(start.status).toBe(201);
    const [session] = await db.select().from(practiceSessions);
    expect(session?.planDayId).toBe(today.id);
    const [day] = await db.select().from(practiceDays);
    expect(day?.targetMinutes).toBe(40);
    expect(plan.id).toBeTruthy();
  });

  it("ignores a plan day that isn't today's", async () => {
    const { plan } = await activePlan();
    const other = plan.days.find((day) => day.date !== "2026-10-02");
    await call("POST", "/sessions", {
      blocks: [{ topicId: null, label: "Calentamiento", plannedSeconds: 300 }],
      planDayId: other?.id,
    });
    const [session] = await db.select().from(practiceSessions);
    expect(session?.planDayId).toBeNull();
  });

  it("without an active plan, Hoy keeps the 003 suggestion", async () => {
    await seedTopic(db, carlos.userId);
    await call("POST", "/plans", {});
    const body = await bodyOf(call("GET", "/today"));
    expect(body.plan).toBeNull();
    expect(body.suggestion.topics.length).toBeGreaterThan(0);
  });
});

describe("lesson page", () => {
  it("AC-14: reports the plan for the cycle starting on the lesson's date", async () => {
    const lesson = await seedLesson(db, carlos.userId, { date: "2026-10-01" });
    const before = await bodyOf(call("GET", `/lessons/${lesson.id}`));
    expect(before.cyclePlan).toEqual({ cycleStart: "2026-10-01", ended: false, plan: null });
    await seedTopic(db, carlos.userId);
    const plan = (await bodyOf(call("POST", "/plans", { cycleStart: "2026-10-01" }))).plan;
    const after = await bodyOf(call("GET", `/lessons/${lesson.id}`));
    expect(after.cyclePlan.plan).toEqual({ id: plan.id, status: "draft" });

    const old = await seedLesson(db, carlos.userId, { date: "2026-09-17" });
    expect((await bodyOf(call("GET", `/lessons/${old.id}`))).cyclePlan.ended).toBe(true);
  });
});
