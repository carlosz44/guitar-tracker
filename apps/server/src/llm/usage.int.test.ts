import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { llmRuns } from "../db/schema";
import { createTestApp } from "../test/app";
import { useTestDatabase } from "../test/db";
import { createSignedInUser } from "../test/session";
import { assertCanCall, LlmUnavailable, monthUsage, recordRun } from "./usage";

const { db, truncateAll } = useTestDatabase();
const { auth } = createTestApp({ db });
const LIMA = "America/Lima";
const settings = { enabled: true, model: "claude-sonnet-5-5", budgetUsd: 10 };
const usage = {
  inputTokens: 100_000,
  outputTokens: 50_000,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};

beforeEach(truncateAll);

async function runAt(userId: string, at: string, tokens = usage) {
  const id = await recordRun(db, {
    userId,
    feature: "lesson_enrichment",
    model: "claude-sonnet-5-5",
    usage: tokens,
    latencyMs: 900,
  });
  await db
    .update(llmRuns)
    .set({ createdAt: new Date(at) })
    .where(eq(llmRuns.id, id));
  return id;
}

describe("LLM usage", () => {
  it("AC-13: logs each call with tokens, cost, latency and status", async () => {
    const { userId } = await createSignedInUser(db, auth);
    const id = await recordRun(db, {
      userId,
      feature: "lesson_enrichment",
      model: "claude-sonnet-5-5",
      usage,
      latencyMs: 900,
      subject: { type: "lesson", id: userId },
    });
    const failed = await recordRun(db, {
      userId,
      feature: "topic_improve",
      model: "claude-sonnet-5-5",
      latencyMs: 30,
      error: "rate_limited",
    });
    const rows = await db.select().from(llmRuns);
    expect(rows.find((row) => row.id === id)).toMatchObject({
      inputTokens: 100_000,
      outputTokens: 50_000,
      costUsd: 0.7,
      latencyMs: 900,
      status: "ok",
      subjectType: "lesson",
    });
    expect(rows.find((row) => row.id === failed)).toMatchObject({
      status: "error",
      error: "rate_limited",
      costUsd: 0,
    });
  });

  it("AC-14: sums the calendar month in Lima", async () => {
    const { userId } = await createSignedInUser(db, auth);
    await runAt(userId, "2026-10-01T04:59:00Z");
    await runAt(userId, "2026-10-01T05:00:00Z");
    await runAt(userId, "2026-10-31T23:00:00Z");
    await runAt(userId, "2026-11-01T05:00:00Z");
    expect(await monthUsage(db, userId, LIMA, new Date("2026-10-15T12:00:00Z"))).toEqual({
      spendUsd: 1.4,
      calls: 2,
    });
    expect(await monthUsage(db, userId, LIMA, new Date("2026-10-01T04:00:00Z"))).toEqual({
      spendUsd: 0.7,
      calls: 1,
    });
  });

  it("AC-15, AC-16: refuses calls when disabled or over this month's budget", async () => {
    const { userId } = await createSignedInUser(db, auth);
    const context = { userId, timeZone: LIMA, now: new Date("2026-10-15T12:00:00Z") };
    await expect(assertCanCall(db, { ...settings, enabled: false }, context)).rejects.toMatchObject(
      {
        key: "llm.disabled",
      },
    );
    await assertCanCall(db, { ...settings, budgetUsd: 1 }, context);
    await runAt(userId, "2026-10-10T12:00:00Z");
    await runAt(userId, "2026-10-11T12:00:00Z");
    const error = await assertCanCall(db, { ...settings, budgetUsd: 1 }, context).catch((e) => e);
    expect(error).toBeInstanceOf(LlmUnavailable);
    expect(error.key).toBe("llm.budget");
  });
});
