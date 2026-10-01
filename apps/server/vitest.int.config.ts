import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "server-int",
    environment: "node",
    include: ["src/**/*.int.test.ts"],
    fileParallelism: false,
    globalSetup: ["src/test/global-setup.ts"],
  },
});
