import { describe, expect, it } from "vitest";
import { costUsd } from "./pricing";

const usage = (inputTokens: number, outputTokens: number, cacheReadTokens = 0) => ({
  inputTokens,
  outputTokens,
  cacheReadTokens,
  cacheWriteTokens: 0,
});

describe("costUsd", () => {
  it("AC-13: prices Sonnet 5.5 at $2 in, $10 out and $0.20 cache reads per million tokens", () => {
    expect(costUsd("claude-sonnet-5-5", usage(1_000_000, 0))).toBe(2);
    expect(costUsd("claude-sonnet-5-5", usage(20_000, 2_000, 10_000))).toBe(0.062);
  });

  it("AC-13: matches dated model ids by prefix", () => {
    expect(costUsd("claude-haiku-4-5-20251001", usage(0, 1_000_000))).toBe(5);
  });

  it("AC-15: prices an unknown model at the most expensive rate so the budget isn't under-counted", () => {
    expect(costUsd("claude-future-9", usage(0, 1_000_000))).toBe(50);
  });
});
