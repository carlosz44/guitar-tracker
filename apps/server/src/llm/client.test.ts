import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { createAnthropicClient, LlmCallError } from "./client";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const URL = "https://api.anthropic.com/v1/messages";
const schema = z.object({ title: z.string() });
const request = {
  model: "claude-sonnet-5-5",
  system: "system",
  content: [{ type: "text" as const, text: "hola" }],
  schema,
  maxTokens: 1_000,
};

function message(text: string) {
  return {
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-5-5",
    content: [{ type: "text", text }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: {
      input_tokens: 1200,
      output_tokens: 300,
      cache_read_input_tokens: 50,
      cache_creation_input_tokens: null,
    },
  };
}

describe("Anthropic client", () => {
  it("sends the schema as structured output and returns parsed JSON with usage", async () => {
    let body: Record<string, unknown> = {};
    server.use(
      http.post(URL, async ({ request: incoming }) => {
        body = (await incoming.json()) as Record<string, unknown>;
        return HttpResponse.json(message('{"title":"Modo dórico"}'));
      }),
    );
    const response = await createAnthropicClient("fake-key").complete(request);
    expect(response.output).toEqual({ title: "Modo dórico" });
    expect(response.usage).toEqual({
      inputTokens: 1200,
      outputTokens: 300,
      cacheReadTokens: 50,
      cacheWriteTokens: 0,
    });
    expect(body).toMatchObject({
      model: "claude-sonnet-5-5",
      max_tokens: 1_000,
      system: "system",
      output_config: { format: { type: "json_schema" } },
    });
  });

  it("AC-4: returns null output when the text isn't JSON, keeping the usage", async () => {
    server.use(http.post(URL, () => HttpResponse.json(message("no es json"))));
    const response = await createAnthropicClient("fake-key").complete(request);
    expect(response.output).toBeNull();
    expect(response.usage.outputTokens).toBe(300);
  });

  it("maps API errors to short codes without the message", async () => {
    server.use(
      http.post(URL, () =>
        HttpResponse.json(
          { type: "error", error: { type: "invalid_request_error", message: "secret detail" } },
          { status: 400 },
        ),
      ),
    );
    const error = await createAnthropicClient("fake-key")
      .complete(request)
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(LlmCallError);
    expect((error as LlmCallError).code).toBe("bad_request");
    expect((error as Error).message).not.toContain("secret detail");
  });
});
