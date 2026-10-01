import { uuidv7 } from "uuidv7";
import { beforeEach, describe, expect, it } from "vitest";
import { useTestDatabase } from "../test/db";
import { planDays, planItems, user, weeklyPlans } from "./schema";

const { db, truncateAll } = useTestDatabase();

async function failureCode(run: () => Promise<unknown>) {
  try {
    await run();
  } catch (error) {
    return (error as { cause?: { code?: string } }).cause?.code;
  }
  return undefined;
}

async function seedUser() {
  const id = uuidv7();
  await db.insert(user).values({ id, name: "Carlos", email: "c@example.com", githubId: "1001" });
  return id;
}

const plan = (userId: string, status: "draft" | "active" | "replaced") =>
  db
    .insert(weeklyPlans)
    .values({ id: uuidv7(), userId, cycleStart: "2026-10-01", cycleEnd: "2026-10-07", status })
    .returning();

beforeEach(truncateAll);

describe("0005_weekly_plans", () => {
  it("allows one draft and one active plan per cycle, any number replaced", async () => {
    const userId = await seedUser();
    await plan(userId, "draft");
    await plan(userId, "active");
    await plan(userId, "replaced");
    await plan(userId, "replaced");
    expect(await failureCode(() => plan(userId, "draft"))).toBe("23505");
    expect(await failureCode(() => plan(userId, "active"))).toBe("23505");
  });

  it("items need a topic or a label and minutes in steps of 5", async () => {
    const userId = await seedUser();
    const [row] = await plan(userId, "draft");
    const dayId = uuidv7();
    await db
      .insert(planDays)
      .values({ id: dayId, userId, planId: row?.id ?? "", date: "2026-10-01", targetMinutes: 30 });
    const item = (values: Partial<typeof planItems.$inferInsert>) =>
      db
        .insert(planItems)
        .values({ id: uuidv7(), userId, planDayId: dayId, position: 0, minutes: 5, ...values });
    expect(await failureCode(() => item({ label: null }))).toBe("23514");
    expect(await failureCode(() => item({ label: "Calentamiento", minutes: 7 }))).toBe("23514");
    await item({ label: "Calentamiento" });
  });
});
