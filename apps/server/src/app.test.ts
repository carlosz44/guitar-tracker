import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createDatabase } from "./db/client";
import { createTestApp } from "./test/app";

const { db, pool } = createDatabase("postgres://nobody:nothing@127.0.0.1:1/none", { max: 1 });
afterAll(() => pool.end());

const webDist = mkdtempSync(join(tmpdir(), "ds-web-"));
mkdirSync(join(webDist, "assets"));
writeFileSync(join(webDist, "index.html"), "<!doctype html><title>Daily Shed</title>");
writeFileSync(join(webDist, "assets", "index-abc123.js"), "console.log(1)");
writeFileSync(join(webDist, "sw.js"), "self.addEventListener('install', () => {})");
afterAll(() => rmSync(webDist, { recursive: true, force: true }));

const { app } = createTestApp({ db, staticRoot: webDist });

describe("createApp", () => {
  it("sets security headers, including a CSP", async () => {
    const response = await app.request("/index.html");
    expect(response.headers.get("content-security-policy")).toContain("default-src 'self'");
    expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("strict-transport-security")).toBeTruthy();
  });

  it("lets the browser upload to, download from and show images from file storage", async () => {
    const csp = (await app.request("/index.html")).headers.get("content-security-policy") ?? "";
    expect(csp).toMatch(/connect-src 'self' https:\/\/storage\.test/);
    expect(csp).toMatch(/img-src [^;]*https:\/\/storage\.test/);
    expect(csp).toMatch(/worker-src 'self' blob:/);
  });

  it("answers unknown /api routes with JSON, never the SPA", async () => {
    const response = await app.request("/api/nope");
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
  });

  it("caches hashed assets forever", async () => {
    const response = await app.request("/assets/index-abc123.js");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
  });

  it("revalidates the service worker so updates are picked up", async () => {
    const response = await app.request("/sw.js");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-cache");
  });

  it("falls back to index.html for app routes", async () => {
    for (const path of ["/", "/today", "/settings", "/lessons/123"]) {
      const response = await app.request(path);
      expect(response.status).toBe(200);
      expect(await response.text()).toContain("<title>Daily Shed</title>");
      expect(response.headers.get("cache-control")).toBe("no-cache");
    }
  });
});
