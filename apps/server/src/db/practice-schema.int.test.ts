import { eq } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import { beforeEach, describe, expect, it } from "vitest";
import { useTestDatabase } from "../test/db";
import { seedTopic } from "../test/seed";
import { practiceSessions, sessionBlocks, topics, user } from "./schema";

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

function session(userId: string, status: "in_progress" | "completed" = "in_progress") {
  const now = new Date();
  return db
    .insert(practiceSessions)
    .values({
      id: uuidv7(),
      userId,
      startedAt: now,
      lastActivityAt: now,
      practiceDate: "2026-10-01",
      status,
    })
    .returning();
}

beforeEach(truncateAll);

describe("0002_practice_sessions", () => {
  it("allows only one session in progress per user", async () => {
    const userId = await seedUser();
    await session(userId);
    expect(await failureCode(() => session(userId))).toBe("23505");
    await session(userId, "completed");
    await session(userId, "completed");
  });

  it("needs a topic or a label on every block", async () => {
    const userId = await seedUser();
    const [created] = await session(userId);
    const base = { userId, sessionId: created?.id ?? "", plannedSeconds: 300 };
    expect(
      await failureCode(() =>
        db.insert(sessionBlocks).values({ id: uuidv7(), position: 0, ...base }),
      ),
    ).toBe("23514");
    await db
      .insert(sessionBlocks)
      .values({ id: uuidv7(), position: 0, label: "Calentamiento", ...base });
  });

  it("keeps a topic used in a block from being deleted", async () => {
    const userId = await seedUser();
    const topic = await seedTopic(db, userId);
    const [created] = await session(userId);
    await db.insert(sessionBlocks).values({
      id: uuidv7(),
      userId,
      sessionId: created?.id ?? "",
      position: 0,
      topicId: topic.id,
      plannedSeconds: 300,
    });
    expect(await failureCode(() => db.delete(topics).where(eq(topics.id, topic.id)))).toBe("23503");
  });
});
