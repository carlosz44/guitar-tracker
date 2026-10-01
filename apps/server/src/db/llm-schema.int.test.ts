import { eq } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import { beforeEach, describe, expect, it } from "vitest";
import { useTestDatabase } from "../test/db";
import { llmDrafts, llmRuns, user } from "./schema";

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

const draft = (userId: string, subjectId: string, status: "queued" | "accepted" = "queued") =>
  db.insert(llmDrafts).values({
    id: uuidv7(),
    userId,
    kind: "lesson_enrichment",
    subjectType: "lesson",
    subjectId,
    status,
  });

beforeEach(truncateAll);

describe("0003_llm", () => {
  it("allows only one active draft per subject, any number of finished ones", async () => {
    const userId = await seedUser();
    const lessonId = uuidv7();
    await draft(userId, lessonId, "accepted");
    await draft(userId, lessonId, "accepted");
    await draft(userId, lessonId);
    expect(await failureCode(() => draft(userId, lessonId))).toBe("23505");
    await draft(userId, uuidv7());
  });

  it("rejects unknown statuses and features, and keeps the draft when its run is deleted", async () => {
    const userId = await seedUser();
    expect(
      await failureCode(() =>
        db
          .insert(llmRuns)
          .values({ id: uuidv7(), userId, feature: "chat" as never, model: "m", status: "ok" }),
      ),
    ).toBe("23514");
    const runId = uuidv7();
    await db.insert(llmRuns).values({
      id: runId,
      userId,
      feature: "lesson_enrichment",
      model: "claude-sonnet-5-5",
      status: "ok",
      costUsd: 0.012345,
    });
    const id = uuidv7();
    await db.insert(llmDrafts).values({
      id,
      userId,
      kind: "lesson_enrichment",
      subjectType: "lesson",
      subjectId: uuidv7(),
      llmRunId: runId,
    });
    const [run] = await db.select().from(llmRuns).where(eq(llmRuns.id, runId));
    expect(run?.costUsd).toBe(0.012345);
    await db.delete(llmRuns).where(eq(llmRuns.id, runId));
    const [kept] = await db.select().from(llmDrafts).where(eq(llmDrafts.id, id));
    expect(kept?.llmRunId).toBeNull();
    expect(kept?.review).toEqual({});
    expect(kept?.skippedFiles).toEqual([]);
  });
});
