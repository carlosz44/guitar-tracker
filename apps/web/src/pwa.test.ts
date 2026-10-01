// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { pwaOptions, THEME_COLORS } from "../pwa.config.ts";

const webRoot = fileURLToPath(new URL("../", import.meta.url));
const indexHtml = readFileSync(`${webRoot}index.html`, "utf8");
const manifest = pwaOptions.manifest || {};

function meta(name: string) {
  return [...indexHtml.matchAll(new RegExp(`<meta name="${name}"([^>]*)>`, "g"))].map(
    (match) => match[1] ?? "",
  );
}

describe("PWA manifest", () => {
  it("AC-7: installs as “Daily Shed”, full screen, opening on /today", () => {
    expect(manifest).toMatchObject({
      name: "Daily Shed",
      short_name: "Daily Shed",
      display: "standalone",
      start_url: "/today",
      lang: "es-PE",
    });
  });

  it("AC-7: ships 192 px, 512 px and maskable icons that exist in public/", () => {
    const icons = manifest.icons ?? [];
    expect(icons.map((icon) => icon.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    expect(icons.some((icon) => icon.purpose === "maskable")).toBe(true);
    for (const icon of icons) expect(existsSync(`${webRoot}public/${icon.src}`)).toBe(true);
  });
});

describe("service worker", () => {
  const workbox = pwaOptions.workbox ?? {};

  it("asks before updating, so the toast can offer “Actualizar”", () => {
    expect(pwaOptions.registerType).toBe("prompt");
  });

  it("never serves /api from the app-shell fallback, including the OAuth callback", () => {
    const denylist = workbox.navigateFallbackDenylist ?? [];
    const denied = (path: string) => denylist.some((pattern) => pattern.test(path));
    expect(denied("/api/auth/callback/github")).toBe(true);
    expect(denied("/api/health")).toBe(true);
    expect(denied("/today")).toBe(false);
  });

  it("caches no API responses at runtime", () => {
    expect(workbox.runtimeCaching ?? []).toEqual([]);
  });
});

describe("iOS home screen", () => {
  it("AC-7: has an apple-touch-icon that exists", () => {
    const href = /<link rel="apple-touch-icon" href="\/([^"]+)"/.exec(indexHtml)?.[1];
    expect(href).toBe("apple-touch-icon-180x180.png");
    expect(existsSync(`${webRoot}public/${href}`)).toBe(true);
  });

  it("AC-7: opens full screen with the app name", () => {
    expect(meta("apple-mobile-web-app-capable")[0]).toContain('content="yes"');
    expect(meta("apple-mobile-web-app-title")[0]).toContain('content="Daily Shed"');
    expect(meta("apple-mobile-web-app-status-bar-style")).toHaveLength(1);
  });

  it("AC-7: colours the status bar for both light and dark", () => {
    const themeColors = meta("theme-color");
    expect(themeColors).toEqual([
      ` content="${THEME_COLORS.light}" media="(prefers-color-scheme: light)" /`,
      ` content="${THEME_COLORS.dark}" media="(prefers-color-scheme: dark)" /`,
    ]);
  });

  it("extends under the notch so safe-area insets apply", () => {
    expect(meta("viewport")[0]).toContain("viewport-fit=cover");
  });
});
