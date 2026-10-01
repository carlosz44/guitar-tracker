export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

interface Price {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

// USD per million tokens, from platform.claude.com/docs/en/about-claude/pricing (2026-10-01).
const PRICES: [prefix: string, price: Price][] = [
  ["claude-fable-5-1", { input: 10, output: 50, cacheRead: 0.25, cacheWrite: 12.5 }],
  ["claude-opus-5-5", { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 }],
  ["claude-sonnet-5-5", { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 }],
  ["claude-haiku-4-5", { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 }],
];

const MOST_EXPENSIVE = PRICES.reduce((a, b) => (b[1].output > a[1].output ? b : a))[1];

export function priceOf(model: string): Price {
  return PRICES.find(([prefix]) => model.startsWith(prefix))?.[1] ?? MOST_EXPENSIVE;
}

export function costUsd(model: string, usage: TokenUsage) {
  const price = priceOf(model);
  const total =
    usage.inputTokens * price.input +
    usage.outputTokens * price.output +
    usage.cacheReadTokens * price.cacheRead +
    usage.cacheWriteTokens * price.cacheWrite;
  return Math.round(total) / 1_000_000;
}
