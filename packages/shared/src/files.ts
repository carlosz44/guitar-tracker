import { z } from "zod";

export const FILE_KINDS = ["guitar_pro", "pdf", "docx", "image", "other"] as const;
export type FileKind = (typeof FILE_KINDS)[number];

export const UPLOAD_STATUSES = ["uploading", "uploaded"] as const;
export const EXTRACTION_STATUSES = ["pending", "done", "failed", "not_applicable"] as const;
export type ExtractionStatus = (typeof EXTRACTION_STATUSES)[number];

const EXTENSIONS: Record<string, { kind: FileKind; contentType: string }> = {
  ".gp": { kind: "guitar_pro", contentType: "application/octet-stream" },
  ".gpx": { kind: "guitar_pro", contentType: "application/octet-stream" },
  ".gp5": { kind: "guitar_pro", contentType: "application/octet-stream" },
  ".gp4": { kind: "guitar_pro", contentType: "application/octet-stream" },
  ".gp3": { kind: "guitar_pro", contentType: "application/octet-stream" },
  ".pdf": { kind: "pdf", contentType: "application/pdf" },
  ".docx": {
    kind: "docx",
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
  ".jpg": { kind: "image", contentType: "image/jpeg" },
  ".jpeg": { kind: "image", contentType: "image/jpeg" },
  ".png": { kind: "image", contentType: "image/png" },
  ".webp": { kind: "image", contentType: "image/webp" },
  ".heic": { kind: "image", contentType: "image/heic" },
};

export const ACCEPTED_EXTENSIONS = Object.keys(EXTENSIONS);
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

export const fileErrors = {
  extension: "file.extension",
  size: "file.size",
  empty: "file.empty",
  name: "file.name",
} as const;
export type FileErrorKey = (typeof fileErrors)[keyof typeof fileErrors];

function extensionOf(name: string) {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot).toLowerCase();
}

export function fileTypeOf(name: string) {
  return EXTENSIONS[extensionOf(name)] ?? null;
}

export type UploadCheck = { ok: true; kind: FileKind } | { ok: false; error: FileErrorKey };

export function validateUpload({ name, size }: { name: string; size: number }): UploadCheck {
  const type = fileTypeOf(name);
  if (!type) return { ok: false, error: fileErrors.extension };
  if (size <= 0) return { ok: false, error: fileErrors.empty };
  if (size > MAX_FILE_BYTES) return { ok: false, error: fileErrors.size };
  return { ok: true, kind: type.kind };
}

export const createUploadSchema = z
  .strictObject({
    name: z.string().trim().min(1, { error: fileErrors.name }).max(255, { error: fileErrors.name }),
    mime: z.string().max(255).default(""),
    size: z.number().int(),
  })
  .superRefine((value, context) => {
    const check = validateUpload(value);
    if (!check.ok) context.addIssue({ code: "custom", message: check.error, path: ["name"] });
  });
export type CreateUpload = z.infer<typeof createUploadSchema>;

export const fileDispositionSchema = z.object({
  disposition: z.enum(["inline", "attachment"]).default("inline"),
});
