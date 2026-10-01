import { spawnSync } from "node:child_process";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from "vitest";
import { fakeClock } from "../clock";
import { backupRuns } from "../db/schema";
import { backupKey } from "../storage/keys";
import { useTestDatabase } from "../test/db";
import { SECRET_VALUES, validEnv } from "../test/env";
import { captureLogger, silentLogger } from "../test/logger";
import { memoryStorage } from "../test/memory-storage";
import {
  BACKUP_CRON,
  BACKUP_TIMEZONE,
  type BackupDeps,
  type DumpSpawner,
  handleBackupJob,
  limaDate,
  pgDumpSpawner,
  registerBackup,
  runBackup,
  spawnDump,
} from "./backup";
import { type Boss, createBoss, QUEUES } from "./boss";

const { db, truncateAll } = useTestDatabase();

function fakeDump(content: string, options: { exitWith?: Error } = {}): DumpSpawner {
  return () => ({
    stdout: Readable.from([Buffer.from(content)]),
    exited: options.exitWith ? Promise.reject(options.exitWith) : Promise.resolve(),
    kill: () => undefined,
  });
}

function setup(options: { now?: string; dump?: DumpSpawner } = {}) {
  const memory = memoryStorage();
  const clock = fakeClock(options.now ?? "2026-10-01T08:30:00Z");
  const deps: BackupDeps = {
    db,
    storage: memory.storage,
    clock,
    dump: options.dump ?? fakeDump("PGDMP fake dump"),
    logger: silentLogger,
  };
  return { ...memory, clock, deps };
}

beforeEach(truncateAll);

describe("backup schedule", () => {
  let boss: Boss;
  beforeAll(async () => {
    boss = createBoss(inject("databaseUrl"));
    await boss.start();
    await registerBackup(boss, setup().deps);
  });
  afterAll(() => boss.stop({ graceful: false }));

  it("AC-13: runs every night at 03:30 America/Lima, catching up once if missed", async () => {
    const schedule = await boss.getSchedule(QUEUES.backup);
    expect(schedule).toMatchObject({ cron: BACKUP_CRON, options: { tz: BACKUP_TIMEZONE } });
    expect(BACKUP_CRON).toBe("30 3 * * *");
    expect(schedule?.options).toMatchObject({ missed: "once" });
  });

  it("AC-13: retries a failed backup 3 times with backoff", async () => {
    expect(await boss.getQueue(QUEUES.backup)).toMatchObject({
      retryLimit: 3,
      retryBackoff: true,
    });
  });
});

describe("runBackup", () => {
  it("AC-13: names the dump by the Lima date, even late in the evening", () => {
    expect(limaDate(new Date("2026-10-01T08:30:00Z"))).toBe("2026-10-01");
    expect(limaDate(new Date("2026-10-02T04:59:00Z"))).toBe("2026-10-01");
    expect(limaDate(new Date("2026-10-02T05:00:00Z"))).toBe("2026-10-02");
  });

  it("AC-13: uploads the dump to db-backups/guitartracker-YYYY-MM-DD.dump and records it", async () => {
    const { deps, objects } = setup();
    const result = await runBackup(deps);

    expect(result.key).toBe("db-backups/guitartracker-2026-10-01.dump");
    expect(objects.get(result.key)?.toString()).toBe("PGDMP fake dump");
    const [run] = await db.select().from(backupRuns);
    expect(run).toMatchObject({
      status: "succeeded",
      r2Key: result.key,
      sizeBytes: 15,
      error: null,
      finishedAt: new Date("2026-10-01T08:30:00Z"),
    });
  });

  it("AC-13: deletes backups older than 30 days and keeps the rest", async () => {
    const { deps, objects } = setup();
    for (const date of ["2026-08-15", "2026-08-31", "2026-09-01", "2026-09-30"]) {
      objects.set(backupKey(date), Buffer.from("old"));
    }
    objects.set("db-backups/README.txt", Buffer.from("keep"));
    objects.set("lesson-files/l/f-x.gp", Buffer.from("keep"));

    await runBackup(deps);

    expect([...objects.keys()].sort()).toEqual([
      "db-backups/README.txt",
      "db-backups/guitartracker-2026-09-01.dump",
      "db-backups/guitartracker-2026-09-30.dump",
      "db-backups/guitartracker-2026-10-01.dump",
      "lesson-files/l/f-x.gp",
    ]);
  });

  it("AC-13: a failed dump is recorded as failed and leaves no partial object", async () => {
    const { deps, objects } = setup({
      dump: fakeDump("PGDMP partial", { exitWith: new Error("pg_dump exited with 1") }),
    });
    await expect(runBackup(deps)).rejects.toThrow();
    expect(objects.size).toBe(0);
    const [run] = await db.select().from(backupRuns);
    expect(run?.status).toBe("failed");
  });

  it("reports a dump that can't start, even when the upload fails too", async () => {
    const { deps, state } = setup({
      dump: () => spawnDump("pg_dump-that-does-not-exist", [], { PATH: process.env.PATH }),
    });
    state.failUploads = true;
    await expect(runBackup(deps)).rejects.toThrow("could not start (ENOENT)");
    const [run] = await db.select().from(backupRuns);
    expect(run?.error).toBe("pg_dump-that-does-not-exist could not start (ENOENT)");
  });

  it("AC-13: an unreachable bucket fails the attempt and keeps older backups", async () => {
    const { deps, objects, state } = setup();
    objects.set(backupKey("2026-08-01"), Buffer.from("old"));
    state.failUploads = true;
    await expect(runBackup(deps)).rejects.toThrow();
    expect(objects.has(backupKey("2026-08-01"))).toBe(true);
    const [run] = await db.select().from(backupRuns);
    expect(run).toMatchObject({ status: "failed", error: "Error" });
  });

  it("AC-13: produces a real pg_dump custom-format archive", async () => {
    const databaseUrl = inject("databaseUrl");
    const hasPgDump = spawnSync("pg_dump", ["--version"]).status === 0;
    if (!hasPgDump && process.env.CI) throw new Error("pg_dump is required in CI");

    const compose = fileURLToPath(new URL("../../../../compose.dev.yml", import.meta.url));
    const database = new URL(databaseUrl).pathname.slice(1);
    const dump: DumpSpawner = hasPgDump
      ? pgDumpSpawner(databaseUrl)
      : () =>
          spawnDump(
            "docker",
            [
              "compose",
              "-f",
              compose,
              "exec",
              "-T",
              "db",
              "pg_dump",
              "--format=custom",
              "-U",
              "guitartracker",
              database,
            ],
            process.env,
          );

    const { deps, objects } = setup({ dump });
    const { key, sizeBytes } = await runBackup(deps);
    const archive = objects.get(key);
    expect(archive?.subarray(0, 5).toString()).toBe("PGDMP");
    expect(sizeBytes).toBe(archive?.length);
  }, 60_000);
});

describe("backup failure logging", () => {
  it("AC-14: logs retries as warnings and the final failure as an error, without secrets", async () => {
    const capture = captureLogger("worker");
    const { deps, state } = setup();
    state.failUploads = true;
    deps.dump = () =>
      spawnDump("sh", ["-c", 'echo "$PGPASSWORD"; echo "$PGPASSWORD" >&2; exit 1'], {
        PATH: process.env.PATH,
        PGPASSWORD: "fake-db-password",
      });
    deps.logger = capture.logger;

    await expect(
      handleBackupJob(deps, { id: "job-1", retryCount: 0, retryLimit: 3 }),
    ).rejects.toThrow();
    await expect(
      handleBackupJob(deps, { id: "job-1", retryCount: 3, retryLimit: 3 }),
    ).rejects.toThrow();

    const levels = capture.lines.map((line) => [line.level, line.msg]);
    expect(levels).toEqual([
      [40, "backup attempt failed, will retry"],
      [50, "backup failed"],
    ]);
    expect(capture.lines[1]).toMatchObject({ attempt: 4, maxAttempts: 4, jobId: "job-1" });

    const text = capture.text();
    for (const secret of [...SECRET_VALUES, validEnv.DATABASE_URL]) {
      expect(text).not.toContain(secret);
    }
    const runs = await db.select().from(backupRuns);
    for (const run of runs) expect(run.error ?? "").not.toContain("fake-db-password");
  });
});
