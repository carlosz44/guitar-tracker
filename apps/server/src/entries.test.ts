import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validEnv } from "./test/env";

const serverRoot = fileURLToPath(new URL("..", import.meta.url));

function runEntry(entry: string, env: Record<string, string>) {
  return spawnSync(process.execPath, ["--import", "tsx", `src/${entry}.ts`], {
    cwd: serverRoot,
    env: { PATH: process.env.PATH ?? "", ...env },
    encoding: "utf8",
    timeout: 20_000,
  });
}

const cases = [
  { entry: "api", drop: "GITHUB_CLIENT_SECRET" },
  { entry: "worker", drop: "R2_ACCESS_KEY_ID" },
  { entry: "migrate", drop: "DATABASE_URL" },
  { entry: "backup-now", drop: "R2_SECRET_ACCESS_KEY" },
] as const;

describe("process entries", () => {
  for (const { entry, drop } of cases) {
    it(`AC-15: ${entry} exits on startup naming a missing ${drop}, without a stack trace`, () => {
      const { [drop]: _dropped, ...env } = validEnv;
      const result = runEntry(entry, env);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(`missing ${drop}`);
      expect(result.stderr).not.toMatch(/^\s+at /m);
      expect(result.stdout).toBe("");
    });
  }

  it("AC-15: api exits naming an invalid variable", () => {
    const result = runEntry("api", { ...validEnv, APP_URL: "ftp://example" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("invalid APP_URL");
    expect(result.stderr).not.toMatch(/^\s+at /m);
  });
});
