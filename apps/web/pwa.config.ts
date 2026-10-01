import type { VitePWAOptions } from "vite-plugin-pwa";
import { es } from "./src/i18n/es.ts";

export const THEME_COLORS = { light: "#ffffff", dark: "#0a0a0a" } as const;

export const pwaOptions: Partial<VitePWAOptions> = {
  registerType: "prompt",
  injectRegister: false,
  includeAssets: ["favicon.ico", "icon.svg", "apple-touch-icon-180x180.png"],
  manifest: {
    name: es.app.name,
    short_name: es.app.name,
    description: es.app.tagline,
    lang: "es-PE",
    start_url: "/today",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: THEME_COLORS.light,
    theme_color: THEME_COLORS.light,
    icons: [
      { src: "pwa-64x64.png", sizes: "64x64", type: "image/png" },
      { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
      { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
      {
        src: "maskable-icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  },
  workbox: {
    globPatterns: ["**/*.{js,css,html,svg,png,ico,webmanifest}"],
    globIgnores: ["**/font/**", "**/soundfont/**"],
    maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
    navigateFallback: "/index.html",
    navigateFallbackDenylist: [/^\/api/],
    runtimeCaching: [],
    cleanupOutdatedCaches: true,
  },
};
