import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    api: "src/api.ts",
    worker: "src/worker.ts",
    migrate: "src/migrate.ts",
    "backup-now": "src/backup-now.ts",
  },
  format: "esm",
  platform: "node",
  target: "node24",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  noExternal: [/^@ds\//],
});
