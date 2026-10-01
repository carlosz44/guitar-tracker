import type { SkippedFile } from "@ds/shared";
import { and, asc, eq } from "drizzle-orm";
import type { Database } from "../db/client";
import { lessonFiles } from "../db/schema";
import type { ObjectStorage } from "../storage/r2";
import type { LlmContent } from "./client";

export const MAX_BINARY_BYTES = 20 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
type ImageType = (typeof IMAGE_TYPES)[number];
type FileRow = typeof lessonFiles.$inferSelect;

const KIND_LABELS: Record<string, string> = { guitar_pro: "Guitar Pro", docx: "Word" };

const attr = (value: string) => value.replaceAll('"', "'").replaceAll("<", "‹");

async function readAll(storage: ObjectStorage, key: string) {
  const chunks: Buffer[] = [];
  for await (const chunk of await storage.getStream(key)) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function textBlock(file: FileRow): LlmContent {
  const { truncated, ...meta } = (file.meta ?? {}) as Record<string, unknown>;
  const lines = [
    `<file name="${attr(file.originalName)}" kind="${KIND_LABELS[file.kind] ?? file.kind}"${truncated ? ' truncated="true"' : ""}>`,
    Object.keys(meta).length > 0 ? `meta: ${JSON.stringify(meta)}` : "",
    file.extractedText ?? "",
    "</file>",
  ];
  return { type: "text", text: lines.filter(Boolean).join("\n") };
}

export async function collectAttachments(
  deps: { db: Database; storage: ObjectStorage },
  userId: string,
  lessonId: string,
) {
  const files = await deps.db
    .select()
    .from(lessonFiles)
    .where(and(eq(lessonFiles.userId, userId), eq(lessonFiles.lessonId, lessonId)))
    .orderBy(asc(lessonFiles.createdAt));

  const skipped: SkippedFile[] = [];
  const skip = (file: FileRow, reason: SkippedFile["reason"]) =>
    skipped.push({ fileId: file.id, name: file.originalName, reason });

  const binary: FileRow[] = [];
  for (const file of files) {
    if (file.uploadStatus !== "uploaded") skip(file, "not_extracted");
    else if (file.kind === "guitar_pro" || file.kind === "docx") {
      if (file.extractionStatus !== "done") skip(file, "not_extracted");
    } else if (file.kind === "pdf") binary.push(file);
    else if (file.kind === "image" && IMAGE_TYPES.includes(file.mime as ImageType)) {
      if (file.sizeBytes > MAX_IMAGE_BYTES) skip(file, "too_large");
      else binary.push(file);
    } else skip(file, "unsupported");
  }

  const included = new Set<string>();
  let total = 0;
  for (const file of [...binary].sort((a, b) => a.sizeBytes - b.sizeBytes)) {
    if (total + file.sizeBytes > MAX_BINARY_BYTES) skip(file, "too_large");
    else {
      total += file.sizeBytes;
      included.add(file.id);
    }
  }

  const blocks: LlmContent[] = [];
  for (const file of files) {
    if (file.kind === "guitar_pro" || file.kind === "docx") {
      if (file.extractionStatus === "done" && file.uploadStatus === "uploaded") {
        blocks.push(textBlock(file));
      }
      continue;
    }
    if (!included.has(file.id)) continue;
    const data = (await readAll(deps.storage, file.r2Key)).toString("base64");
    blocks.push({ type: "text", text: `<file name="${attr(file.originalName)}">` });
    blocks.push(
      file.kind === "pdf"
        ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
        : { type: "image", source: { type: "base64", media_type: file.mime as ImageType, data } },
    );
  }

  return { blocks, skipped, binaryBytes: total };
}
