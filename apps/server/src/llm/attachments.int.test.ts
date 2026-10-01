import { beforeEach, describe, expect, it } from "vitest";
import { createTestApp } from "../test/app";
import { useTestDatabase } from "../test/db";
import { memoryStorage } from "../test/memory-storage";
import { seedFile, seedLesson } from "../test/seed";
import { createSignedInUser } from "../test/session";
import { collectAttachments, MAX_BINARY_BYTES, MAX_IMAGE_BYTES } from "./attachments";

const { db, truncateAll } = useTestDatabase();
const { auth } = createTestApp({ db });

beforeEach(truncateAll);

async function setup() {
  const { userId } = await createSignedInUser(db, auth);
  const lesson = await seedLesson(db, userId);
  const { storage, objects } = memoryStorage();
  const put = async (values: Parameters<typeof seedFile>[3], bytes = Buffer.from("data")) => {
    const file = await seedFile(db, userId, lesson.id, { sizeBytes: bytes.length, ...values });
    objects.set(file.r2Key, bytes);
    return file;
  };
  return { userId, lesson, storage, put };
}

describe("collectAttachments", () => {
  it("AC-3: sends Guitar Pro and Word as text, PDFs as documents and photos as images", async () => {
    const { userId, lesson, storage, put } = await setup();
    await put({
      kind: "guitar_pro",
      originalName: "riff.gp5",
      extractionStatus: "done",
      extractedText: "bar 1: E|-0-2-",
      meta: { tempo: 90, truncated: false },
    });
    await put({ kind: "pdf", originalName: "ejercicios.pdf" }, Buffer.from("%PDF"));
    await put(
      { kind: "image", originalName: "pizarra.jpg", mime: "image/jpeg" },
      Buffer.from("jpg"),
    );
    const { blocks, skipped } = await collectAttachments({ db, storage }, userId, lesson.id);

    expect(skipped).toEqual([]);
    expect(blocks[0]).toEqual({
      type: "text",
      text: '<file name="riff.gp5" kind="Guitar Pro">\nmeta: {"tempo":90}\nbar 1: E|-0-2-\n</file>',
    });
    expect(blocks).toContainEqual({
      type: "document",
      source: {
        type: "base64",
        media_type: "application/pdf",
        data: Buffer.from("%PDF").toString("base64"),
      },
    });
    expect(blocks).toContainEqual({
      type: "image",
      source: {
        type: "base64",
        media_type: "image/jpeg",
        data: Buffer.from("jpg").toString("base64"),
      },
    });
  });

  it("AC-3: skips HEIC, other files, unfinished extraction and uploads, listing each reason", async () => {
    const { userId, lesson, storage, put } = await setup();
    await put({ kind: "image", originalName: "foto.heic", mime: "image/heic" });
    await put({ kind: "other", originalName: "audio.m4a", mime: "audio/mp4" });
    await put({ kind: "docx", originalName: "notas.docx", extractionStatus: "pending" });
    await put({ kind: "guitar_pro", originalName: "roto.gp", extractionStatus: "failed" });
    await put({ kind: "pdf", originalName: "subiendo.pdf", uploadStatus: "uploading" });
    const { blocks, skipped } = await collectAttachments({ db, storage }, userId, lesson.id);
    expect(blocks).toEqual([]);
    expect(skipped.map(({ name, reason }) => [name, reason])).toEqual([
      ["foto.heic", "unsupported"],
      ["audio.m4a", "unsupported"],
      ["notas.docx", "not_extracted"],
      ["roto.gp", "not_extracted"],
      ["subiendo.pdf", "not_extracted"],
    ]);
  });

  it("AC-3: drops the largest files first to stay under 20 MB, and images over 5 MB", async () => {
    const { userId, lesson, storage, put } = await setup();
    const mb = (n: number) => Buffer.alloc(n * 1024 * 1024);
    await put({ kind: "pdf", originalName: "grande.pdf" }, mb(15));
    await put({ kind: "pdf", originalName: "mediano.pdf" }, mb(8));
    await put({ kind: "pdf", originalName: "chico.pdf" }, mb(4));
    await put(
      { kind: "image", originalName: "foto.png", mime: "image/png" },
      Buffer.alloc(MAX_IMAGE_BYTES + 1),
    );
    const { skipped, binaryBytes } = await collectAttachments({ db, storage }, userId, lesson.id);
    expect(skipped.map(({ name, reason }) => [name, reason])).toEqual([
      ["foto.png", "too_large"],
      ["grande.pdf", "too_large"],
    ]);
    expect(binaryBytes).toBeLessThanOrEqual(MAX_BINARY_BYTES);
  });
});
