import { eq } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import { beforeEach, describe, expect, it } from "vitest";
import { useTestDatabase } from "../test/db";
import { lessonFiles, lessons, lessonTopics, teacherQuestions, topics, user } from "./schema";

const { db, truncateAll } = useTestDatabase();

const CHECK_VIOLATION = "23514";
const FOREIGN_KEY_VIOLATION = "23503";
const UNIQUE_VIOLATION = "23505";

async function failureCode(run: () => Promise<unknown>) {
  try {
    await run();
  } catch (error) {
    return (error as { cause?: { code?: string } }).cause?.code;
  }
  return undefined;
}

async function seed() {
  const userId = uuidv7();
  await db
    .insert(user)
    .values({ id: userId, name: "Carlos", email: "c@example.com", githubId: "1001" });
  const lessonId = uuidv7();
  await db.insert(lessons).values({ id: lessonId, userId, date: "2026-10-01", title: "Dórico" });
  const topicId = uuidv7();
  await db
    .insert(topics)
    .values({ id: topicId, userId, title: "Modo dórico", category: "scales_modes" });
  return { userId, lessonId, topicId };
}

beforeEach(truncateAll);

describe("0001_lessons_topics_files", () => {
  it("defaults lessons to final, from the web, with empty text fields", async () => {
    const { lessonId } = await seed();
    const [row] = await db.select().from(lessons).where(eq(lessons.id, lessonId));
    expect(row).toMatchObject({ status: "final", source: "web", rawNotes: "", practicePoints: [] });
  });

  it("defaults topics to new, normal priority and 10-minute blocks", async () => {
    const { topicId } = await seed();
    const [row] = await db.select().from(topics).where(eq(topics.id, topicId));
    expect(row).toMatchObject({
      status: "new",
      priority: 2,
      defaultBlockMinutes: 10,
      targetBpm: null,
    });
  });

  it("enforces topic ranges and categories in the database too", async () => {
    const { userId } = await seed();
    const base = { userId, title: "x", category: "technique" as const };
    for (const values of [
      { ...base, targetBpm: 10 },
      { ...base, priority: 4 },
      { ...base, defaultBlockMinutes: 90 },
      { ...base, category: "jazz" as "technique" },
    ]) {
      expect(await failureCode(() => db.insert(topics).values({ id: uuidv7(), ...values }))).toBe(
        CHECK_VIOLATION,
      );
    }
  });

  it("AC-14: a topic can't be its own parent", async () => {
    const { topicId } = await seed();
    expect(
      await failureCode(() =>
        db.update(topics).set({ parentId: topicId }).where(eq(topics.id, topicId)),
      ),
    ).toBe(CHECK_VIOLATION);
  });

  it("AC-15: links a topic to a lesson only once", async () => {
    const { userId, lessonId, topicId } = await seed();
    await db.insert(lessonTopics).values({ userId, lessonId, topicId, relation: "introduced" });
    expect(
      await failureCode(() =>
        db.insert(lessonTopics).values({ userId, lessonId, topicId, relation: "reviewed" }),
      ),
    ).toBe(UNIQUE_VIOLATION);
  });

  it("refuses to delete a topic that a lesson links", async () => {
    const { userId, lessonId, topicId } = await seed();
    await db.insert(lessonTopics).values({ userId, lessonId, topicId, relation: "introduced" });
    expect(await failureCode(() => db.delete(topics).where(eq(topics.id, topicId)))).toBe(
      FOREIGN_KEY_VIOLATION,
    );
  });

  it("AC-3: deleting a lesson removes its files and links but keeps topics and questions", async () => {
    const { userId, lessonId, topicId } = await seed();
    await db.insert(lessonTopics).values({ userId, lessonId, topicId, relation: "introduced" });
    await db.insert(lessonFiles).values({
      id: uuidv7(),
      userId,
      lessonId,
      kind: "pdf",
      originalName: "a.pdf",
      mime: "application/pdf",
      sizeBytes: 10,
      r2Key: "lesson-files/a.pdf",
    });
    const questionId = uuidv7();
    await db.insert(teacherQuestions).values({
      id: questionId,
      userId,
      text: "?",
      status: "answered",
      answer: "!",
      answeredInLessonId: lessonId,
    });

    await db.delete(lessons).where(eq(lessons.id, lessonId));

    expect(await db.select().from(lessonFiles)).toEqual([]);
    expect(await db.select().from(lessonTopics)).toEqual([]);
    expect(await db.select().from(topics)).toHaveLength(1);
    const [question] = await db.select().from(teacherQuestions);
    expect(question?.answeredInLessonId).toBeNull();
  });

  it("deleting a user removes all of their content", async () => {
    const { userId, lessonId, topicId } = await seed();
    await db.insert(lessonTopics).values({ userId, lessonId, topicId, relation: "introduced" });
    await db.delete(user).where(eq(user.id, userId));
    expect(await db.select().from(topics)).toEqual([]);
    expect(await db.select().from(lessons)).toEqual([]);
  });
});
