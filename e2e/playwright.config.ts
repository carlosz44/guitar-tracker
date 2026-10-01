import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;
export const STATE_FILE = fileURLToPath(new URL("./.auth/carlos.json", import.meta.url));

export default defineConfig({
  testDir: "./tests",
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    locale: "es-PE",
    timezoneId: "America/Lima",
    serviceWorkers: "block",
    storageState: STATE_FILE,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm --filter @ds/server e2e:serve",
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      NODE_ENV: "production",
      LOG_LEVEL: "warn",
      PORT: String(PORT),
      APP_URL: baseURL,
      DATABASE_URL:
        process.env.E2E_DATABASE_URL ??
        "postgres://guitartracker:guitartracker@localhost:5433/guitartracker_e2e",
      E2E_STATE_FILE: STATE_FILE,
      BETTER_AUTH_SECRET: "e2e-better-auth-secret-0123456789abcdef",
      GITHUB_CLIENT_ID: "e2e-client-id",
      GITHUB_CLIENT_SECRET: "e2e-client-secret",
      ALLOWED_GITHUB_IDS: "1001",
      R2_ACCOUNT_ID: "e2e-account",
      R2_ACCESS_KEY_ID: "e2e-access-key",
      R2_SECRET_ACCESS_KEY: "e2e-secret-access-key",
      R2_BUCKET: "guitar-tracker-e2e",
      DEFAULT_TIMEZONE: "America/Lima",
    },
  },
});
