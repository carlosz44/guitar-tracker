import { createHash } from "node:crypto";
import { MAX_FILE_BYTES, PARSEABLE_KINDS } from "@ds/shared";
import { and, eq, lt } from "drizzle-orm";
import type { Clock } from "../clock";
import type { Database } from "../db/client";
import { lessonFiles } from "../db/schema";
import type { ParseInput, ParseResult } from "../files/parse/types";
import { runParser } from "../files/run-parser";
import type { Logger } from "../logger";
import type { ObjectStorage } from "../storage/r2";
import { type Boss, ensureQueue, QUEUES } from "./boss";

export const CLEANUP_CRON = "17 * * * *";
export const STALE_UPLOAD_MS = 60 * 60 * 1000;

export interface FileJobDeps {
  db: Database;
  storage: ObjectStorage;
  clock: Clock;
  logger: Logger;
  parse?: (input: ParseInput) => Promise<ParseResult>;
}

async function readObject(storage: ObjectStorage, key: string, keepBytes: boolean) {
  const hash = createHash("sha256");
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of await storage.getStream(key)) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    hash.update(buffer);
    if (keepBytes && size <= MAX_FILE_BYTES) chunks.push(buffer);
  }
  return {
    sha256: hash.digest("hex"),
    size,
    bytes: keepBytes && size <= MAX_FILE_BYTES ? Buffer.concat(chunks) : null,
  };
}

export async function extractFile(deps: FileJobDeps, fileId: string) {
  const [file] = await deps.db.select().from(lessonFiles).where(eq(lessonFiles.id, fileId));
  if (file?.uploadStatus !== "uploaded") return;

  const started = performance.now();
  const parseable = PARSEABLE_KINDS.includes(file.kind);
  const { sha256, bytes } = await readObject(deps.storage, file.r2Key, parseable);

  let update: Partial<typeof lessonFiles.$inferInsert>;
  if (!parseable) {
    update = { sha256, extractionStatus: "not_applicable" };
  } else {
    const result: ParseResult = bytes
      ? await (deps.parse ?? runParser)({
          kind: file.kind as ParseInput["kind"],
          fileName: file.originalName,
          bytes,
        })
      : { status: "failed", error: "parse_error" };
    update =
      result.status === "done"
        ? {
            sha256,
            extractionStatus: "done",
            extractionError: null,
            extractedText: result.text,
            meta: result.meta
              ? { ...result.meta, truncated: result.truncated }
              : { truncated: result.truncated },
          }
        : { sha256, extractionStatus: "failed", extractionError: result.error };
  }

  await deps.db.update(lessonFiles).set(update).where(eq(lessonFiles.id, file.id));
  deps.logger.info(
    {
      fileId: file.id,
      kind: file.kind,
      sizeBytes: file.sizeBytes,
      status: update.extractionStatus,
      error: update.extractionError ?? undefined,
      durationMs: Math.round(performance.now() - started),
    },
    "file extracted",
  );
}

export async function cleanupStaleUploads(deps: FileJobDeps) {
  const cutoff = new Date(deps.clock.now().getTime() - STALE_UPLOAD_MS);
  const stale = await deps.db
    .select({ id: lessonFiles.id, key: lessonFiles.r2Key })
    .from(lessonFiles)
    .where(and(eq(lessonFiles.uploadStatus, "uploading"), lt(lessonFiles.createdAt, cutoff)));
  let deleted = 0;
  for (const file of stale) {
    try {
      await deps.storage.delete(file.key);
    } catch {
      deps.logger.warn({ fileId: file.id }, "stale upload: storage delete failed, will retry");
      continue;
    }
    await deps.db.delete(lessonFiles).where(eq(lessonFiles.id, file.id));
    deleted += 1;
  }
  if (deleted > 0) deps.logger.info({ deleted }, "stale uploads removed");
  return deleted;
}

export async function registerFileJobs(boss: Boss, deps: FileJobDeps) {
  await ensureQueue(boss, QUEUES.fileExtract);
  await ensureQueue(boss, QUEUES.fileCleanup);
  await boss.work<{ fileId: string }>(
    QUEUES.fileExtract,
    { pollingIntervalSeconds: 2 },
    async ([job]) => {
      if (job) await extractFile(deps, job.data.fileId);
    },
  );
  await boss.schedule(QUEUES.fileCleanup, CLEANUP_CRON, null, { tz: "UTC", missed: "skip" });
  await boss.work(QUEUES.fileCleanup, async () => {
    await cleanupStaleUploads(deps);
  });
}
