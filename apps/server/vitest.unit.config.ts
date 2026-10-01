import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "server-unit",
    environment: "node",
    include: ["src/**/*.test.ts"],
    exclude: ["src/**/*.int.test.ts"],
  },
});
