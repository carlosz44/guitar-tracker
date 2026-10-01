import type { LlmClient, LlmRequest, LlmResponse } from "../llm/client";

type Reply = Partial<LlmResponse> | Error | ((request: LlmRequest) => Partial<LlmResponse> | Error);

export function fakeLlm(...replies: Reply[]) {
  const requests: LlmRequest[] = [];
  const client: LlmClient = {
    async complete(request) {
      requests.push(request);
      const next = replies.length > 1 ? replies.shift() : replies[0];
      const reply = typeof next === "function" ? next(request) : next;
      if (reply instanceof Error) throw reply;
      return {
        output: null,
        usage: { inputTokens: 1_000, outputTokens: 500, cacheReadTokens: 0, cacheWriteTokens: 0 },
        latencyMs: 1_200,
        stopReason: "end_turn",
        ...reply,
      };
    },
  };
  return { client, requests };
}
