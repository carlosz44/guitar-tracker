import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from "vitest";
import { fakeClock } from "../clock";
import { lessonFiles } from "../db/schema";
import { createTestApp } from "../test/app";
import { useTestDatabase } from "../test/db";
import { corruptBytes, docxFixture, guitarProFixture } from "../test/fixtures";
import { captureLogger, silentLogger } from "../test/logger";
import { memoryStorage } from "../test/memory-storage";
import { seedFile, seedLesson } from "../test/seed";
import { createSignedInUser } from "../test/session";
import { type Boss, createBoss, QUEUES } from "./boss";
import { cleanupStaleUploads, extractFile, type FileJobDeps, registerFileJobs } from "./file-jobs";

const { db, truncateAll } = useTestDatabase();
const { auth } = createTestApp({ db });
const memory = memoryStorage();
const clock = fakeClock("2026-10-01T15:00:00Z");
const deps: FileJobDeps = { db, storage: memory.storage, clock, logger: silentLogger };

let userId: string;
let lessonId: string;
beforeEach(async () => {
  await truncateAll();
  memory.objects.clear();
  memory.state.failDeletes = false;
  userId = (await createSignedInUser(db, auth)).userId;
  lessonId = (await seedLesson(db, userId)).id;
});

async function storedFile(
  name: string,
  kind: "guitar_pro" | "docx" | "pdf" | "image",
  bytes: Uint8Array,
) {
  const file = await seedFile(db, userId, lessonId, {
    kind,
    originalName: name,
    sizeBytes: bytes.length,
    extractionStatus: kind === "guitar_pro" || kind === "docx" ? "pending" : "not_applicable",
  });
  memory.objects.set(file.r2Key, Buffer.from(bytes));
  return file;
}

async function reload(id: string) {
  const [row] = await db.select().from(lessonFiles).where(eq(lessonFiles.id, id));
  return row;
}

const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

describe("file.extract", () => {
  it("AC-6: Guitar Pro files end done with compact text, meta and SHA-256", async () => {
    const bytes = guitarProFixture();
    const file = await storedFile("triadas.gp", "guitar_pro", bytes);
    await extractFile(deps, file.id);
    const row = await reload(file.id);
    expect(row).toMatchObject({
      extractionStatus: "done",
      extractionError: null,
      sha256: sha(bytes),
    });
    expect(row?.extractedText).toContain("Bar 1: 8th [s3:7 s2:6 s1:5]");
    expect(row?.meta).toMatchObject({
      title: "Tríadas dórico",
      tempo: 90,
      barCount: 2,
      truncated: false,
    });
  }, 30_000);

  it("AC-6: docx files end done with their text", async () => {
    const file = await storedFile("notas.docx", "docx", docxFixture());
    await extractFile(deps, file.id);
    expect(await reload(file.id)).toMatchObject({
      extractionStatus: "done",
      extractedText: "Tríadas de dórico\n\nCuerdas 1 a 3, corcheas a 90 BPM.",
    });
  }, 30_000);

  it("AC-6: PDFs and images are not_applicable but still get a SHA-256", async () => {
    for (const [name, kind] of [
      ["ejercicios.pdf", "pdf"],
      ["foto.heic", "image"],
    ] as const) {
      const bytes = new TextEncoder().encode(name);
      const file = await storedFile(name, kind, bytes);
      await extractFile(deps, file.id);
      expect(await reload(file.id)).toMatchObject({
        extractionStatus: "not_applicable",
        sha256: sha(bytes),
      });
    }
  });

  it("AC-7: a corrupt file ends failed with a short error and the next file still processes", async () => {
    const broken = await storedFile("roto.gp", "guitar_pro", corruptBytes);
    const good = await storedFile("notas.docx", "docx", docxFixture());
    await extractFile(deps, broken.id);
    await extractFile(deps, good.id);
    expect(await reload(broken.id)).toMatchObject({
      extractionStatus: "failed",
      extractionError: "parse_error",
    });
    expect((await reload(good.id))?.extractionStatus).toBe("done");
  }, 30_000);

  it("AC-7: records timeouts and memory exhaustion from the parser", async () => {
    for (const error of ["timeout", "out_of_memory"] as const) {
      const file = await storedFile("lento.gp", "guitar_pro", guitarProFixture());
      await extractFile({ ...deps, parse: async () => ({ status: "failed", error }) }, file.id);
      expect(await reload(file.id)).toMatchObject({
        extractionStatus: "failed",
        extractionError: error,
      });
    }
  });

  it("logs ids, sizes and durations, never the file's text", async () => {
    const capture = captureLogger("worker");
    const file = await storedFile("notas.docx", "docx", docxFixture());
    await extractFile({ ...deps, logger: capture.logger }, file.id);
    expect(capture.lines[0]).toMatchObject({ fileId: file.id, kind: "docx", status: "done" });
    expect(capture.text()).not.toContain("Tríadas");
  }, 30_000);

  it("does nothing for a file deleted or never confirmed", async () => {
    const pending = await seedFile(db, userId, lessonId, {
      uploadStatus: "uploading",
      kind: "guitar_pro",
    });
    await extractFile(deps, pending.id);
    await extractFile(deps, "0190f0e0-0000-7000-8000-0000000000ff");
    expect((await reload(pending.id))?.sha256).toBeNull();
  });

  it("lets storage errors fail the job so pg-boss retries it", async () => {
    const file = await seedFile(db, userId, lessonId, { kind: "pdf" });
    await expect(extractFile(deps, file.id)).rejects.toThrow("NoSuchKey");
  });
});

describe("file.cleanup-stale", () => {
  it("removes uploads left unconfirmed for over an hour, with their objects", async () => {
    const stale = await seedFile(db, userId, lessonId, {
      uploadStatus: "uploading",
      createdAt: new Date("2026-10-01T13:59:00Z"),
    });
    const recent = await seedFile(db, userId, lessonId, {
      uploadStatus: "uploading",
      createdAt: new Date("2026-10-01T14:30:00Z"),
    });
    const done = await seedFile(db, userId, lessonId, {
      createdAt: new Date("2026-09-01T00:00:00Z"),
    });
    memory.objects.set(stale.r2Key, Buffer.from("half"));

    expect(await cleanupStaleUploads(deps)).toBe(1);
    const left = (await db.select().from(lessonFiles)).map((row) => row.id).sort();
    expect(left).toEqual([recent.id, done.id].sort());
    expect(memory.objects.has(stale.r2Key)).toBe(false);
  });

  it("keeps the row when the object can't be deleted, to retry next hour", async () => {
    await seedFile(db, userId, lessonId, {
      uploadStatus: "uploading",
      createdAt: new Date("2026-10-01T10:00:00Z"),
    });
    memory.state.failDeletes = true;
    expect(await cleanupStaleUploads(deps)).toBe(0);
    expect(await db.select().from(lessonFiles)).toHaveLength(1);
  });
});

describe("worker wiring", () => {
  let boss: Boss;
  beforeAll(async () => {
    boss = createBoss(inject("databaseUrl"));
    await boss.start();
    await registerFileJobs(boss, deps);
  });
  afterAll(() => boss.stop({ graceful: false }));

  it("schedules the hourly cleanup", async () => {
    expect(await boss.getSchedule(QUEUES.fileCleanup)).toMatchObject({ cron: "17 * * * *" });
  });

  it("AC-6: a queued job is extracted within the minute", async () => {
    const file = await storedFile("triadas.gp", "guitar_pro", guitarProFixture());
    await boss.send(QUEUES.fileExtract, { fileId: file.id });
    const deadline = Date.now() + 30_000;
    while ((await reload(file.id))?.extractionStatus === "pending" && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    expect((await reload(file.id))?.extractionStatus).toBe("done");
  }, 40_000);
});
