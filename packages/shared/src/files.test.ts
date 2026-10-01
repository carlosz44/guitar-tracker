import { describe, expect, it } from "vitest";
import {
  createUploadSchema,
  fileErrors,
  fileTypeOf,
  MAX_FILE_BYTES,
  validateUpload,
} from "./files.ts";

describe("validateUpload", () => {
  it.each([
    ["tab.gp", "guitar_pro"],
    ["tab.GPX", "guitar_pro"],
    ["tab.gp5", "guitar_pro"],
    ["tab.gp4", "guitar_pro"],
    ["tab.gp3", "guitar_pro"],
    ["notes.pdf", "pdf"],
    ["notes.docx", "docx"],
    ["photo.jpg", "image"],
    ["photo.jpeg", "image"],
    ["photo.png", "image"],
    ["photo.webp", "image"],
    ["IMG_0001.HEIC", "image"],
  ])("AC-4: accepts %s as %s", (name, kind) => {
    expect(validateUpload({ name, size: 1000 })).toEqual({ ok: true, kind });
  });

  it.each(["song.mp3", "notes.doc", "archive.zip", "noextension", "tab.gp.exe"])(
    "AC-4: rejects %s by extension",
    (name) => {
      expect(validateUpload({ name, size: 1000 })).toEqual({
        ok: false,
        error: fileErrors.extension,
      });
    },
  );

  it("AC-4: accepts up to 25 MB and rejects anything larger", () => {
    expect(validateUpload({ name: "a.pdf", size: MAX_FILE_BYTES }).ok).toBe(true);
    expect(validateUpload({ name: "a.pdf", size: MAX_FILE_BYTES + 1 })).toEqual({
      ok: false,
      error: fileErrors.size,
    });
  });

  it("rejects empty files", () => {
    expect(validateUpload({ name: "a.pdf", size: 0 })).toEqual({
      ok: false,
      error: fileErrors.empty,
    });
  });

  it("AC-4: validates by extension even when iOS reports a generic MIME type", () => {
    const parsed = createUploadSchema.safeParse({
      name: "tab.gp",
      mime: "application/octet-stream",
      size: 10,
    });
    expect(parsed.success).toBe(true);
  });

  it("AC-4: the API schema rejects with the same keys", () => {
    const parsed = createUploadSchema.safeParse({
      name: "big.pdf",
      mime: "application/pdf",
      size: MAX_FILE_BYTES + 1,
    });
    expect(parsed.success ? null : parsed.error.issues[0]?.message).toBe(fileErrors.size);
  });

  it("serves PDFs and images with their real content type so they display inline", () => {
    expect(fileTypeOf("a.pdf")?.contentType).toBe("application/pdf");
    expect(fileTypeOf("a.HEIC")?.contentType).toBe("image/heic");
    expect(fileTypeOf("a.gp")?.contentType).toBe("application/octet-stream");
  });
});
