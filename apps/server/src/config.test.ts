import { describe, expect, it, vi } from "vitest";
import {
  apiConfigSchema,
  loadConfig,
  migrateConfigSchema,
  parseConfig,
  workerConfigSchema,
} from "./config";
import { SECRET_VALUES, validEnv } from "./test/env";

describe("parseConfig", () => {
  it("parses a complete api environment", () => {
    const result = parseConfig(apiConfigSchema, validEnv);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.PORT).toBe(3000);
    expect(result.config.ALLOWED_GITHUB_IDS).toEqual(["1001", "1002"]);
  });

  it("applies defaults for optional variables", () => {
    const { NODE_ENV, LOG_LEVEL, PORT, DEFAULT_TIMEZONE, ...rest } = validEnv;
    const result = parseConfig(apiConfigSchema, rest);
    expect(result).toMatchObject({
      ok: true,
      config: {
        NODE_ENV: "development",
        LOG_LEVEL: "info",
        PORT: 3000,
        DEFAULT_TIMEZONE: "America/Lima",
      },
    });
  });

  it("AC-15: names a missing variable", () => {
    const { DATABASE_URL, ...rest } = validEnv;
    expect(parseConfig(apiConfigSchema, rest)).toEqual({
      ok: false,
      problems: ["missing DATABASE_URL"],
    });
  });

  it("AC-15: treats an empty variable as missing", () => {
    expect(parseConfig(workerConfigSchema, { ...validEnv, R2_BUCKET: "" })).toEqual({
      ok: false,
      problems: ["missing R2_BUCKET"],
    });
  });

  it("AC-15: names invalid variables and the rule without echoing values", () => {
    const result = parseConfig(apiConfigSchema, {
      ...validEnv,
      APP_URL: "not a url",
      ALLOWED_GITHUB_IDS: "octocat",
      BETTER_AUTH_SECRET: "short-secret-value",
      DEFAULT_TIMEZONE: "Mars/Olympus",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems).toEqual([
      "invalid APP_URL: must be an http(s) URL",
      "invalid BETTER_AUTH_SECRET: must be at least 32 characters",
      "invalid ALLOWED_GITHUB_IDS: must be comma-separated numeric GitHub ids",
      "invalid DEFAULT_TIMEZONE: must be an IANA timezone",
    ]);
    const text = result.problems.join("\n");
    for (const value of [...SECRET_VALUES, "short-secret-value", "octocat"]) {
      expect(text).not.toContain(value);
    }
  });

  it("AC-15: each process requires only what it uses", () => {
    const { DATABASE_URL } = validEnv;
    expect(parseConfig(migrateConfigSchema, { DATABASE_URL }).ok).toBe(true);
    expect(parseConfig(workerConfigSchema, { DATABASE_URL }).ok).toBe(false);
    const { GITHUB_CLIENT_ID, ...withoutGithub } = validEnv;
    expect(parseConfig(workerConfigSchema, withoutGithub).ok).toBe(true);
  });
});

describe("Claude settings", () => {
  it("005 AC-16: the API key is optional, with a default model and a $10 monthly budget", () => {
    for (const schema of [apiConfigSchema, workerConfigSchema]) {
      const result = parseConfig(schema, { ...validEnv, ANTHROPIC_API_KEY: "" });
      expect(result).toMatchObject({
        ok: true,
        config: { LLM_MODEL_DEFAULT: "claude-sonnet-5-5", LLM_MONTHLY_BUDGET_USD: 10 },
      });
      if (result.ok) expect(result.config.ANTHROPIC_API_KEY).toBeUndefined();
    }
  });

  it("reads the key and budget when set, rejecting a negative budget", () => {
    expect(
      parseConfig(workerConfigSchema, {
        ...validEnv,
        ANTHROPIC_API_KEY: "fake-anthropic-key",
        LLM_MONTHLY_BUDGET_USD: "2.5",
      }),
    ).toMatchObject({ ok: true, config: { LLM_MONTHLY_BUDGET_USD: 2.5 } });
    expect(parseConfig(apiConfigSchema, { ...validEnv, LLM_MONTHLY_BUDGET_USD: "-1" })).toEqual({
      ok: false,
      problems: ["invalid LLM_MONTHLY_BUDGET_USD: must be zero or more"],
    });
  });
});

describe("R2_ENDPOINT", () => {
  it("is optional and must be a URL when set", () => {
    expect(parseConfig(workerConfigSchema, validEnv).ok).toBe(true);
    expect(
      parseConfig(workerConfigSchema, {
        ...validEnv,
        R2_ENDPOINT: "https://a.eu.r2.cloudflarestorage.com",
      }).ok,
    ).toBe(true);
    expect(parseConfig(workerConfigSchema, { ...validEnv, R2_ENDPOINT: "nope" })).toEqual({
      ok: false,
      problems: ["invalid R2_ENDPOINT: must be an http(s) URL"],
    });
  });
});

describe("loadConfig", () => {
  it("AC-15: writes the problems to stderr and exits with code 1", () => {
    const stderr = { write: vi.fn() };
    const exit = vi.fn((() => undefined) as unknown as (code?: number) => never);
    loadConfig(migrateConfigSchema, { env: {}, exit, stderr } as never);
    expect(exit).toHaveBeenCalledWith(1);
    expect(stderr.write).toHaveBeenCalledWith("Invalid configuration:\n  - missing DATABASE_URL\n");
  });
});
