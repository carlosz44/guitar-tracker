import {
  type CreateUpload,
  fileDispositionSchema,
  fileErrors,
  fileTypeOf,
  PARSEABLE_KINDS,
} from "@ds/shared";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { uuidv7 } from "uuidv7";
import type { SessionVariables } from "../auth/require-session";
import type { Database } from "../db/client";
import { lessonFiles } from "../db/schema";
import { idParam, validate } from "../http/validate";
import { type JobQueue, QUEUES } from "../jobs/boss";
import { toFile } from "../lessons/queries";
import type { Logger } from "../logger";
import { lessonFileKey } from "../storage/keys";
import type { ObjectStorage } from "../storage/r2";

export interface FileDeps {
  db: Database;
  storage: ObjectStorage;
  queue: JobQueue;
  logger: Logger;
}

export async function createUpload(
  deps: FileDeps,
  userId: string,
  lessonId: string,
  input: CreateUpload,
) {
  const type = fileTypeOf(input.name);
  if (!type) throw new Error("upload passed validation without a known type");
  const id = uuidv7();
  const key = lessonFileKey(lessonId, id, input.name);
  await deps.db.insert(lessonFiles).values({
    id,
    userId,
    lessonId,
    kind: type.kind,
    originalName: input.name,
    mime: input.mime,
    sizeBytes: input.size,
    r2Key: key,
  });
  const uploadUrl = await deps.storage.presignPut(key, {
    contentType: type.contentType,
    contentLength: input.size,
  });
  return { fileId: id, uploadUrl, contentType: type.contentType };
}

export function createFileRoutes(deps: FileDeps) {
  const { db, storage } = deps;

  const findFile = async (userId: string, id: string) => {
    const [row] = await db
      .select()
      .from(lessonFiles)
      .where(and(eq(lessonFiles.userId, userId), eq(lessonFiles.id, id)));
    return row;
  };

  const presignedUrl = async (userId: string, id: string, disposition: "inline" | "attachment") => {
    const file = await findFile(userId, id);
    if (file?.uploadStatus !== "uploaded") return null;
    return storage.presignGet(file.r2Key, { disposition, fileName: file.originalName });
  };

  return new Hono<{ Variables: SessionVariables }>()
    .get("/:id", idParam, async (c) => {
      const file = await findFile(c.get("user").id, c.req.valid("param").id);
      if (!file) return c.json({ error: "not_found" as const }, 404);
      return c.json(
        { file: { ...toFile(file), meta: file.meta, extractedText: file.extractedText } },
        200,
      );
    })
    .post("/:id/confirm", idParam, async (c) => {
      const userId = c.get("user").id;
      const file = await findFile(userId, c.req.valid("param").id);
      if (!file) return c.json({ error: "not_found" as const }, 404);
      if (file.uploadStatus === "uploaded") return c.json({ file: toFile(file) }, 200);

      const stored = await storage.head(file.r2Key);
      if (!stored) return c.json({ error: fileErrors.notUploaded }, 409);
      if (stored.size !== file.sizeBytes) return c.json({ error: fileErrors.sizeMismatch }, 409);

      const [row] = await db
        .update(lessonFiles)
        .set({
          uploadStatus: "uploaded",
          extractionStatus: PARSEABLE_KINDS.includes(file.kind) ? "pending" : "not_applicable",
        })
        .where(and(eq(lessonFiles.userId, userId), eq(lessonFiles.id, file.id)))
        .returning();
      if (!row) return c.json({ error: "not_found" as const }, 404);
      await deps.queue.send(QUEUES.fileExtract, { fileId: row.id });
      return c.json({ file: toFile(row) }, 200);
    })
    .post("/:id/retry", idParam, async (c) => {
      const userId = c.get("user").id;
      const file = await findFile(userId, c.req.valid("param").id);
      if (!file) return c.json({ error: "not_found" as const }, 404);
      if (file.extractionStatus !== "failed")
        return c.json({ error: fileErrors.notRetryable }, 409);
      const [row] = await db
        .update(lessonFiles)
        .set({ extractionStatus: "pending", extractionError: null })
        .where(and(eq(lessonFiles.userId, userId), eq(lessonFiles.id, file.id)))
        .returning();
      if (!row) return c.json({ error: "not_found" as const }, 404);
      await deps.queue.send(QUEUES.fileExtract, { fileId: row.id });
      return c.json({ file: toFile(row) }, 200);
    })
    .get("/:id/url", idParam, validate("query", fileDispositionSchema), async (c) => {
      const url = await presignedUrl(
        c.get("user").id,
        c.req.valid("param").id,
        c.req.valid("query").disposition,
      );
      if (!url) return c.json({ error: fileErrors.notReady }, 404);
      return c.json({ url }, 200);
    })
    .get("/:id/open", idParam, validate("query", fileDispositionSchema), async (c) => {
      const url = await presignedUrl(
        c.get("user").id,
        c.req.valid("param").id,
        c.req.valid("query").disposition,
      );
      if (!url) return c.json({ error: fileErrors.notReady }, 404);
      c.header("Cache-Control", "no-store");
      return c.redirect(url, 302);
    })
    .delete("/:id", idParam, async (c) => {
      const userId = c.get("user").id;
      const file = await findFile(userId, c.req.valid("param").id);
      if (!file) return c.json({ error: "not_found" as const }, 404);
      try {
        await storage.delete(file.r2Key);
      } catch {
        deps.logger.error({ fileId: file.id }, "deleting file from storage failed");
        return c.json({ error: "storage_unavailable" as const }, 502);
      }
      await db
        .delete(lessonFiles)
        .where(and(eq(lessonFiles.userId, userId), eq(lessonFiles.id, file.id)));
      return c.body(null, 204);
    });
}
