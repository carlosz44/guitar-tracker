import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { fakeClock } from "../clock";
import { practiceDays, userSettings } from "../db/schema";
import { bodyOf, createTestApp, TEST_APP_URL } from "../test/app";
import { useTestDatabase } from "../test/db";
import { linkTopic, seedLesson, seedQuestion, seedSession, seedTopic } from "../test/seed";
import { createSignedInUser } from "../test/session";

const { db, truncateAll } = useTestDatabase();
const clock = fakeClock("2026-10-01T21:00:00Z");
const { app, auth } = createTestApp({ db, clock });

let carlos: Awaited<ReturnType<typeof createSignedInUser>>;
beforeEach(async () => {
  await truncateAll();
  clock.set("2026-10-01T21:00:00Z");
  carlos = await createSignedInUser(db, auth);
});

const today = () =>
  bodyOf(app.request(`${TEST_APP_URL}/api/today`, { headers: { cookie: carlos.cookie } }));

describe("GET /api/today", () => {
  it("006 AC-1: today's target and the session snapshot use the target for this weekday", async () => {
    await db
      .update(userSettings)
      .set({ dayTargets: [30, 30, 30, 50, 30, 30, 60] })
      .where(eq(userSettings.userId, carlos.userId));
    expect((await today()).targetMinutes).toBe(50);
    const response = await app.request(`${TEST_APP_URL}/api/sessions`, {
      method: "POST",
      headers: { cookie: carlos.cookie, "content-type": "application/json" },
      body: JSON.stringify({
        blocks: [{ topicId: null, label: "Calentamiento", plannedSeconds: 300 }],
      }),
    });
    expect(response.status).toBe(201);
    const [day] = await db
      .select()
      .from(practiceDays)
      .where(eq(practiceDays.userId, carlos.userId));
    expect(day).toMatchObject({ date: "2026-10-01", targetMinutes: 50 });
  });

  it("AC-1: today's minutes against the target, with the latest lesson and open questions", async () => {
    const lesson = await seedLesson(db, carlos.userId, {
      title: "Modo dórico",
      date: "2026-10-01",
    });
    await seedQuestion(db, carlos.userId);
    await seedSession(db, carlos.userId, {
      practiceDate: "2026-10-01",
      blocks: [{ actualSeconds: 600 }, { actualSeconds: 330 }],
    });
    await seedSession(db, carlos.userId, {
      practiceDate: "2026-09-30",
      blocks: [{ actualSeconds: 1800 }],
    });

    expect(await today()).toMatchObject({
      date: "2026-10-01",
      seconds: 930,
      minutes: 15,
      targetMinutes: 30,
      met: false,
      latestLesson: { id: lesson.id, title: "Modo dórico", date: "2026-10-01", status: "final" },
      openQuestionsCount: 1,
      activeSession: null,
    });
  });

  it("AC-20: counts a session started at 23:50 Lima for that day, even after midnight", async () => {
    await seedSession(db, carlos.userId, {
      practiceDate: "2026-10-01",
      startedAt: new Date("2026-10-02T04:50:00Z"),
      targetMinutes: 30,
      blocks: [{ actualSeconds: 1800 }],
    });
    clock.set("2026-10-02T05:30:00Z");
    expect(await today()).toMatchObject({ date: "2026-10-02", seconds: 0, streak: 1 });
    clock.set("2026-10-02T04:59:00Z");
    expect(await today()).toMatchObject({
      date: "2026-10-01",
      seconds: 1800,
      met: true,
      streak: 1,
    });
  });

  it("AC-1: the streak counts met days, ending yesterday while today isn't met", async () => {
    for (const date of ["2026-09-28", "2026-09-29", "2026-09-30"]) {
      await seedSession(db, carlos.userId, {
        practiceDate: date,
        targetMinutes: 30,
        blocks: [{ actualSeconds: 1800 }],
      });
    }
    expect((await today()).streak).toBe(3);
  });

  it("AC-2: suggests a warm-up and the latest lesson's topics, with target and last clean BPM", async () => {
    const lesson = await seedLesson(db, carlos.userId, { date: "2026-10-01" });
    const triads = await seedTopic(db, carlos.userId, {
      title: "Tríadas",
      status: "new",
      targetBpm: 90,
    });
    const mode = await seedTopic(db, carlos.userId, {
      title: "Modo dórico",
      status: "active",
      priority: 3,
    });
    await seedTopic(db, carlos.userId, { title: "Archivado", status: "archived", priority: 3 });
    await linkTopic(db, carlos.userId, lesson.id, triads.id);
    await seedSession(db, carlos.userId, {
      practiceDate: "2026-09-25",
      blocks: [{ topicId: mode.id, cleanBpm: 80 }],
    });

    expect((await today()).suggestion).toEqual({
      warmUpMinutes: 5,
      topics: [
        { topicId: triads.id, title: "Tríadas", minutes: 15, targetBpm: 90, lastCleanBpm: null },
        { topicId: mode.id, title: "Modo dórico", minutes: 10, targetBpm: null, lastCleanBpm: 80 },
      ],
    });
  });

  it("AC-4: reports the session in progress", async () => {
    const { session } = await seedSession(db, carlos.userId, { status: "in_progress" });
    expect((await today()).activeSession).toEqual({ id: session.id });
  });
});
