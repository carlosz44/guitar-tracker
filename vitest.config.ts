import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      "packages/*",
      "apps/web",
      "apps/server/vitest.unit.config.ts",
      "apps/server/vitest.int.config.ts",
    ],
    passWithNoTests: true,
  },
});
