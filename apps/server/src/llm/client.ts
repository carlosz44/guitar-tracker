import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import type { TokenUsage } from "./pricing";

export type LlmContent = Anthropic.ContentBlockParam;

export interface LlmRequest {
  model: string;
  system: string;
  content: LlmContent[];
  schema: z.ZodType;
  maxTokens: number;
}

export interface LlmResponse {
  output: unknown;
  usage: TokenUsage;
  latencyMs: number;
  stopReason: string | null;
}

export type LlmErrorCode =
  | "rate_limited"
  | "overloaded"
  | "server_error"
  | "connection"
  | "bad_request"
  | "auth"
  | "unknown";

export class LlmCallError extends Error {
  constructor(readonly code: LlmErrorCode) {
    super(`llm call failed: ${code}`);
  }
}

export interface LlmClient {
  complete(request: LlmRequest): Promise<LlmResponse>;
}

export function classifyError(error: unknown): LlmErrorCode {
  if (error instanceof Anthropic.APIConnectionError) return "connection";
  if (!(error instanceof Anthropic.APIError)) return "unknown";
  if (error.status === 429) return "rate_limited";
  if (error.status === 529) return "overloaded";
  if (error.status === 401 || error.status === 403) return "auth";
  if (error.status && error.status >= 500) return "server_error";
  if (error.status && error.status >= 400) return "bad_request";
  return "unknown";
}

function parseJson(text: string) {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export function createAnthropicClient(apiKey: string): LlmClient {
  const anthropic = new Anthropic({ apiKey, maxRetries: 3, timeout: 180_000 });
  return {
    async complete(request) {
      const started = performance.now();
      let message: Anthropic.Message;
      try {
        message = await anthropic.messages.create({
          model: request.model,
          max_tokens: request.maxTokens,
          system: request.system,
          messages: [{ role: "user", content: request.content }],
          output_config: { format: zodOutputFormat(request.schema) },
        });
      } catch (error) {
        throw new LlmCallError(classifyError(error));
      }
      const text = message.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("");
      return {
        output: parseJson(text),
        usage: {
          inputTokens: message.usage.input_tokens,
          outputTokens: message.usage.output_tokens,
          cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
          cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
        },
        latencyMs: Math.round(performance.now() - started),
        stopReason: message.stop_reason,
      };
    },
  };
}
