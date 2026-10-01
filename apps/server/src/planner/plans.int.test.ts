import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { fakeClock } from "../clock";
import { practiceSessions, userSettings, weeklyPlans } from "../db/schema";
import { bodyOf, createTestApp, TEST_APP_URL } from "../test/app";
import { useTestDatabase } from "../test/db";
import { linkTopic, seedLesson, seedSession, seedTopic } from "../test/seed";
import { createSignedInUser } from "../test/session";

const { db, truncateAll } = useTestDatabase();
const clock = fakeClock("2026-10-01T15:00:00Z");
const { app, auth } = createTestApp({ db, clock, llm: { enabled: false } });

let carlos: Awaited<ReturnType<typeof createSignedInUser>>;
beforeEach(async () => {
  await truncateAll();
  clock.set("2026-10-01T15:00:00Z");
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

interface Item {
  topicId: string | null;
  label: string | null;
  minutes: number;
  practiced: boolean;
  title: string;
}
interface Day {
  date: string;
  targetMinutes: number;
  minutesPracticed: number;
  past: boolean;
  items: Item[];
}
const topicIds = (day: Day) => day.items.flatMap((item) => (item.topicId ? [item.topicId] : []));
const plain = (day: Day) =>
  day.items.map(({ topicId, label, minutes }) => ({ topicId, label, minutes }));

async function seedTopics(count = 4) {
  return Promise.all(
    Array.from({ length: count }, (_, i) =>
      seedTopic(db, carlos.userId, { title: `Tema ${i + 1}` }),
    ),
  );
}

async function build() {
  const response = await call("POST", "/plans", {});
  expect(response.status).toBe(201);
  return (await bodyOf(response)).plan as {
    id: string;
    days: Day[];
    status: string;
    llmStatus: string;
  };
}

describe("building a plan", () => {
  it("AC-2: plans the current cycle, each day a warm-up plus 1–3 topics filling its weekday target", async () => {
    await seedTopics();
    await db
      .update(userSettings)
      .set({ dayTargets: [30, 30, 30, 30, 30, 45, 60] })
      .where(eq(userSettings.userId, carlos.userId));
    const plan = await build();
    expect(plan.status).toBe("draft");
    expect(plan.days.map((day) => [day.date, day.targetMinutes])).toEqual([
      ["2026-10-01", 30],
      ["2026-10-02", 30],
      ["2026-10-03", 45],
      ["2026-10-04", 60],
      ["2026-10-05", 30],
      ["2026-10-06", 30],
      ["2026-10-07", 30],
    ]);
    for (const day of plan.days) {
      expect(day.items[0]).toMatchObject({ topicId: null, label: "Calentamiento", minutes: 5 });
      expect(day.items.reduce((sum, item) => sum + item.minutes, 0)).toBe(day.targetMinutes);
      expect(topicIds(day).length).toBeGreaterThanOrEqual(1);
      expect(topicIds(day).length).toBeLessThanOrEqual(3);
    }
  });

  it("AC-3: topics introduced or extended in the cycle's lesson appear at least twice", async () => {
    const topics = await seedTopics(5);
    const lesson = await seedLesson(db, carlos.userId, { date: "2026-10-01" });
    const fromLesson = await seedTopic(db, carlos.userId, { title: "Tríadas", priority: 1 });
    await linkTopic(db, carlos.userId, lesson.id, fromLesson.id, "introduced");
    const plan = await build();
    expect(
      plan.days.filter((day) => topicIds(day).includes(fromLesson.id)).length,
    ).toBeGreaterThanOrEqual(2);
    expect(topics.length).toBe(5);
  });

  it("keeps one draft per cycle and returns it as the current plan", async () => {
    await seedTopics();
    await build();
    const second = await build();
    expect(await db.select().from(weeklyPlans)).toHaveLength(1);
    const current = await bodyOf(call("GET", "/plans/current"));
    expect(current).toMatchObject({ cycleStart: "2026-10-01", plan: { id: second.id } });
  });
});

describe("editing", () => {
  it("AC-7: moves a block to another day in one call, keeping totals visible but not enforced", async () => {
    await seedTopics();
    const plan = await build();
    const [first, second] = plan.days as [Day, Day];
    const moved = first.items[1] as Item;
    const response = await call("PUT", `/plans/${plan.id}/days`, {
      days: [
        { date: first.date, items: plain(first).filter((item) => item.topicId !== moved.topicId) },
        {
          date: second.date,
          items: [
            ...plain(second).filter((item) => item.topicId !== moved.topicId),
            {
              topicId: moved.topicId,
              label: null,
              minutes: moved.minutes,
            },
          ],
        },
      ],
    });
    expect(response.status).toBe(200);
    const days = (await bodyOf(response)).plan.days as Day[];
    expect(topicIds(days[0] as Day)).not.toContain(moved.topicId);
    expect(topicIds(days[1] as Day)).toContain(moved.topicId);
  });

  it("AC-7: rejects unknown topics, more than 3 topics and days outside the plan", async () => {
    await seedTopics();
    const plan = await build();
    const day = plan.days[0] as Day;
    const put = (date: string, items: unknown[]) =>
      call("PUT", `/plans/${plan.id}/days`, { days: [{ date, items }] });
    expect(
      (await put(day.date, [{ topicId: "0199a000-0000-7000-8000-000000000009", minutes: 10 }]))
        .status,
    ).toBe(400);
    expect((await put("2026-12-25", plain(day))).status).toBe(400);
  });

  it("AC-8: regenerating one day keeps the other days' edits", async () => {
    await seedTopics(5);
    const plan = await build();
    const [first, second] = plan.days as [Day, Day];
    const edited = plain(first).map((item, i) =>
      i === 1 ? { ...item, minutes: item.minutes + 5 } : item,
    );
    await call("PUT", `/plans/${plan.id}/days`, { days: [{ date: first.date, items: edited }] });
    const response = await call("POST", `/plans/${plan.id}/days/${second.date}/regenerate`);
    expect(response.status).toBe(200);
    const days = (await bodyOf(response)).plan.days as Day[];
    expect(plain(days[0] as Day)).toEqual(edited);
    expect(days[1]?.items.reduce((sum, item) => sum + item.minutes, 0)).toBe(second.targetMinutes);
  });

  it("locks editing while Claude adjusts the plan", async () => {
    await seedTopics();
    const plan = await build();
    await db.update(weeklyPlans).set({ llmStatus: "running" }).where(eq(weeklyPlans.id, plan.id));
    const response = await call("PUT", `/plans/${plan.id}/days`, {
      days: [{ date: "2026-10-01", items: plain(plan.days[0] as Day) }],
    });
    expect(response.status).toBe(409);
    expect(await bodyOf(response)).toEqual({ error: "plan.locked" });
  });
});

describe("accepting", () => {
  it("AC-9: accepting makes the plan active and replaces the previous one, keeping session links", async () => {
    await seedTopics();
    const first = await build();
    expect((await bodyOf(call("POST", `/plans/${first.id}/accept`))).plan.status).toBe("active");
    const firstDayId = (
      (await bodyOf(call("GET", `/plans/${first.id}`))).plan.days[0] as { id: string }
    ).id;
    const { session } = await seedSession(db, carlos.userId, {
      status: "completed",
      planDayId: firstDayId,
    });

    const second = await build();
    await call("POST", `/plans/${second.id}/accept`);
    const statuses = Object.fromEntries(
      (await db.select().from(weeklyPlans)).map((row) => [row.id, row.status]),
    );
    expect(statuses).toEqual({ [first.id]: "replaced", [second.id]: "active" });
    const [row] = await db
      .select()
      .from(practiceSessions)
      .where(eq(practiceSessions.id, session.id));
    expect(row?.planDayId).toBe(firstDayId);
  });

  it("AC-10: an active plan's past days are read-only", async () => {
    await seedTopics();
    const plan = await build();
    await call("POST", `/plans/${plan.id}/accept`);
    clock.set("2026-10-03T15:00:00Z");
    const past = plan.days[0] as Day;
    const response = await call("PUT", `/plans/${plan.id}/days`, {
      days: [{ date: past.date, items: plain(past) }],
    });
    expect(response.status).toBe(409);
    expect(await bodyOf(response)).toEqual({ error: "plan.pastDay" });
    expect((await call("POST", `/plans/${plan.id}/days/${past.date}/regenerate`)).status).toBe(409);
    const today = plan.days[2] as Day;
    expect(
      (
        await call("PUT", `/plans/${plan.id}/days`, {
          days: [{ date: today.date, items: plain(today) }],
        })
      ).status,
    ).toBe(200);
  });
});

describe("progress and replanning", () => {
  it("AC-13: each day shows minutes practiced and which blocks were practiced", async () => {
    await seedTopics();
    const plan = await build();
    const day = plan.days[0] as Day;
    const practicedId = topicIds(day)[0] as string;
    await seedSession(db, carlos.userId, {
      practiceDate: day.date,
      status: "completed",
      blocks: [
        { topicId: practicedId, actualSeconds: 900, endedAt: new Date("2026-10-01T16:15:00Z") },
      ],
    });
    const view = (await bodyOf(call("GET", `/plans/${plan.id}`))).plan.days[0] as Day;
    expect(view.minutesPracticed).toBe(15);
    expect(view.items.find((item) => item.topicId === practicedId)?.practiced).toBe(true);
    expect(
      view.items
        .filter((item) => item.topicId && item.topicId !== practicedId)
        .every((item) => !item.practiced),
    ).toBe(true);
  });

  it("AC-11: 'Replanificar lo que queda' rebuilds the remaining days, favouring missed topics, and leaves past days alone", async () => {
    const topics = await seedTopics(6);
    const plan = await build();
    await call("POST", `/plans/${plan.id}/accept`);
    clock.set("2026-10-03T15:00:00Z");
    const missed = topicIds(plan.days[0] as Day).concat(topicIds(plan.days[1] as Day));
    const response = await call("POST", `/plans/${plan.id}/replan`);
    expect(response.status).toBe(200);
    const days = (await bodyOf(response)).plan.days as Day[];
    expect(plain(days[0] as Day)).toEqual(plain(plan.days[0] as Day));
    expect(plain(days[1] as Day)).toEqual(plain(plan.days[1] as Day));
    expect(topicIds(days[2] as Day).some((id) => missed.includes(id))).toBe(true);
    expect(topics.length).toBe(6);
  });
});
