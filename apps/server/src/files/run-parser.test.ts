import { describe, expect, it } from "vitest";
import { corruptBytes, guitarProFixture } from "../test/fixtures";
import { runParser } from "./run-parser";

const thread = (name: string) => new URL(`../test/threads/${name}.ts`, import.meta.url);

describe("runParser", () => {
  it("AC-6: parses in a worker thread", async () => {
    const result = await runParser({
      kind: "guitar_pro",
      fileName: "a.gp",
      bytes: guitarProFixture(),
    });
    expect(result.status).toBe("done");
  }, 30_000);

  it("AC-7: a corrupt file fails without taking the process down", async () => {
    expect(await runParser({ kind: "guitar_pro", fileName: "a.gp", bytes: corruptBytes })).toEqual({
      status: "failed",
      error: "parse_error",
    });
  }, 30_000);

  it("AC-7: a parser that never finishes is stopped by the timeout", async () => {
    const result = await runParser(
      { kind: "guitar_pro", fileName: "a.gp", bytes: corruptBytes },
      { threadUrl: thread("loop-thread"), timeoutMs: 1_000 },
    );
    expect(result).toEqual({ status: "failed", error: "timeout" });
  }, 30_000);

  it("AC-7: a parser that exhausts its heap cap is reported as out of memory", async () => {
    const result = await runParser(
      { kind: "guitar_pro", fileName: "a.gp", bytes: corruptBytes },
      { threadUrl: thread("oom-thread"), maxOldGenerationSizeMb: 32 },
    );
    expect(result).toEqual({ status: "failed", error: "out_of_memory" });
  }, 30_000);

  it("leaves the caller's bytes usable after transferring a copy", async () => {
    const bytes = guitarProFixture();
    await runParser({ kind: "guitar_pro", fileName: "a.gp", bytes });
    expect(bytes.byteLength).toBeGreaterThan(0);
  }, 30_000);
});
