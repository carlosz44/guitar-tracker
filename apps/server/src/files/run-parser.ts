import { Worker } from "node:worker_threads";
import type { ParseInput, ParseResult } from "./parse/types";

const runningFromSource = import.meta.url.endsWith(".ts");

export const PARSER_LIMITS = { timeoutMs: 60_000, maxOldGenerationSizeMb: 128 };

export function runParser(
  input: ParseInput,
  options: {
    timeoutMs?: number;
    maxOldGenerationSizeMb?: number;
    threadUrl?: URL;
  } = {},
): Promise<ParseResult> {
  const threadUrl =
    options.threadUrl ??
    new URL(runningFromSource ? "./parser-thread.ts" : "./parser-thread.js", import.meta.url);
  const worker = new Worker(threadUrl, {
    execArgv: threadUrl.pathname.endsWith(".ts") ? ["--import", import.meta.resolve("tsx")] : [],
    resourceLimits: {
      maxOldGenerationSizeMb:
        options.maxOldGenerationSizeMb ?? PARSER_LIMITS.maxOldGenerationSizeMb,
    },
    stdout: true,
    stderr: true,
  });
  worker.stdout.resume();
  worker.stderr.resume();

  return new Promise((resolve) => {
    let settled = false;
    const settle = (result: ParseResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker.terminate();
      resolve(result);
    };
    const timer = setTimeout(
      () => settle({ status: "failed", error: "timeout" }),
      options.timeoutMs ?? PARSER_LIMITS.timeoutMs,
    );

    worker.once("message", (result: ParseResult) => settle(result));
    worker.once("error", (error: NodeJS.ErrnoException) =>
      settle({
        status: "failed",
        error: error.code === "ERR_WORKER_OUT_OF_MEMORY" ? "out_of_memory" : "parse_error",
      }),
    );
    worker.once("exit", () => settle({ status: "failed", error: "parse_error" }));

    const bytes = new Uint8Array(input.bytes);
    worker.postMessage({ ...input, bytes }, [bytes.buffer]);
  });
}
