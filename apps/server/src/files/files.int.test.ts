import { fileErrors, MAX_FILE_BYTES } from "@ds/shared";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { lessonFiles } from "../db/schema";
import { createR2Storage } from "../storage/r2";
import { bodyOf, createTestApp, TEST_APP_URL } from "../test/app";
import { useTestDatabase } from "../test/db";
import { memoryStorage } from "../test/memory-storage";
import { seedFile, seedLesson } from "../test/seed";
import { createSignedInUser } from "../test/session";

const { db, truncateAll } = useTestDatabase();
const memory = memoryStorage();
const r2 = createR2Storage({
  accountId: "fake-account",
  accessKeyId: "fake-access-key",
  secretAccessKey: "fake-r2-secret-access-key",
  bucket: "guitar-tracker",
});
const storage = { ...memory.storage, presignPut: r2.presignPut, presignGet: r2.presignGet };
const { app, auth, jobs } = createTestApp({ db, storage, allowedGithubIds: ["1001", "1002"] });

let carlos: Awaited<ReturnType<typeof createSignedInUser>>;
let lessonId: string;
beforeEach(async () => {
  await truncateAll();
  memory.objects.clear();
  memory.state.failDeletes = false;
  jobs.sent.length = 0;
  carlos = await createSignedInUser(db, auth);
  lessonId = (await seedLesson(db, carlos.userId)).id;
});

function call(method: string, path: string, body?: unknown, init: RequestInit = {}) {
  return app.request(`${TEST_APP_URL}/api${path}`, {
    method,
    redirect: "manual",
    ...init,
    headers: {
      cookie: carlos.cookie,
      ...(body ? { "content-type": "application/json" } : {}),
      ...init.headers,
    },
    body: body ? JSON.stringify(body) : init.body,
  });
}

async function startUpload(name: string, size: number, mime = "") {
  return call("POST", `/lessons/${lessonId}/files`, { name, mime, size });
}

async function uploaded(name: string, bytes: Buffer, mime = "") {
  const { fileId } = await bodyOf(startUpload(name, bytes.length, mime));
  const [row] = await db.select().from(lessonFiles).where(eq(lessonFiles.id, fileId));
  memory.objects.set(row?.r2Key ?? "", bytes);
  return fileId as string;
}

describe("files API", () => {
  it("AC-5: returns a presigned R2 PUT URL valid for 5 minutes and records the file as uploading", async () => {
    const response = await startUpload("Tríadas dórico.gp", 1234, "application/octet-stream");
    expect(response.status).toBe(201);
    const { fileId, uploadUrl, contentType } = await bodyOf(response);
    const url = new URL(uploadUrl);
    expect(url.host).toBe("fake-account.r2.cloudflarestorage.com");
    expect(url.pathname).toBe(
      `/guitar-tracker/lesson-files/${lessonId}/${fileId}-Triadas-dorico.gp`,
    );
    expect(url.searchParams.get("X-Amz-Expires")).toBe("300");
    expect(contentType).toBe("application/octet-stream");

    const [row] = await db.select().from(lessonFiles).where(eq(lessonFiles.id, fileId));
    expect(row).toMatchObject({
      kind: "guitar_pro",
      originalName: "Tríadas dórico.gp",
      sizeBytes: 1234,
      uploadStatus: "uploading",
    });
  });

  it("AC-4: rejects other types and files over 25 MB before any upload", async () => {
    const wrongType = await startUpload("canción.mp3", 1000);
    expect(wrongType.status).toBe(400);
    expect((await bodyOf(wrongType)).issues[0].message).toBe(fileErrors.extension);
    const tooBig = await startUpload("libro.pdf", MAX_FILE_BYTES + 1);
    expect((await bodyOf(tooBig)).issues[0].message).toBe(fileErrors.size);
    expect(await db.select().from(lessonFiles)).toEqual([]);
  });

  it("AC-5: the API never accepts file bytes", async () => {
    const response = await call("POST", `/lessons/${lessonId}/files`, undefined, {
      headers: { "content-type": "application/octet-stream" },
      body: new Uint8Array([1, 2, 3]),
    });
    expect(response.status).toBe(400);
  });

  it("AC-5: confirm marks the file uploaded only if the object exists with the same size", async () => {
    const { fileId } = await bodyOf(startUpload("ejercicios.pdf", 3));
    expect(await bodyOf(call("POST", `/files/${fileId}/confirm`))).toEqual({
      error: fileErrors.notUploaded,
    });

    const [row] = await db.select().from(lessonFiles).where(eq(lessonFiles.id, fileId));
    memory.objects.set(row?.r2Key ?? "", Buffer.from("four"));
    expect(await bodyOf(call("POST", `/files/${fileId}/confirm`))).toEqual({
      error: fileErrors.sizeMismatch,
    });

    memory.objects.set(row?.r2Key ?? "", Buffer.from("pdf"));
    const confirmed = await call("POST", `/files/${fileId}/confirm`);
    expect(confirmed.status).toBe(200);
    expect((await bodyOf(confirmed)).file).toMatchObject({
      uploadStatus: "uploaded",
      extractionStatus: "not_applicable",
    });
    expect(jobs.sent).toEqual([{ name: "file.extract", data: { fileId } }]);
  });

  it("AC-6: Guitar Pro and docx files wait for extraction after confirm", async () => {
    for (const name of ["a.gp", "b.docx"]) {
      const fileId = await uploaded(name, Buffer.from("x"));
      expect((await bodyOf(call("POST", `/files/${fileId}/confirm`))).file.extractionStatus).toBe(
        "pending",
      );
    }
  });

  it("AC-7: retry re-queues only failed extractions", async () => {
    const file = await seedFile(db, carlos.userId, lessonId, {
      kind: "guitar_pro",
      extractionStatus: "failed",
      extractionError: "parse_error",
    });
    const response = await call("POST", `/files/${file.id}/retry`);
    expect((await bodyOf(response)).file).toMatchObject({
      extractionStatus: "pending",
      extractionError: null,
    });
    expect(jobs.sent).toEqual([{ name: "file.extract", data: { fileId: file.id } }]);
    expect(await bodyOf(call("POST", `/files/${file.id}/retry`))).toEqual({
      error: fileErrors.notRetryable,
    });
  });

  it("AC-9: /url returns a 5-minute presigned GET with the requested disposition", async () => {
    const file = await seedFile(db, carlos.userId, lessonId, { originalName: "Ejercicios 3.pdf" });
    const { url } = await bodyOf(call("GET", `/files/${file.id}/url?disposition=attachment`));
    const parsed = new URL(url);
    expect(parsed.searchParams.get("X-Amz-Expires")).toBe("300");
    expect(parsed.searchParams.get("response-content-disposition")).toBe(
      "attachment; filename*=UTF-8''Ejercicios%203.pdf",
    );
    expect(parsed.searchParams.get("X-Amz-Signature")).toBeTruthy();
  });

  it("AC-9: /open redirects to an inline presigned URL that isn't cached", async () => {
    const file = await seedFile(db, carlos.userId, lessonId);
    const response = await call("GET", `/files/${file.id}/open`);
    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.host).toBe("fake-account.r2.cloudflarestorage.com");
    expect(location.searchParams.get("response-content-disposition")).toMatch(/^inline/);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("AC-10: file URLs need a session and aren't available before the upload is confirmed", async () => {
    const file = await seedFile(db, carlos.userId, lessonId);
    const signedOut = await app.request(`${TEST_APP_URL}/api/files/${file.id}/open`, {
      redirect: "manual",
    });
    expect(signedOut.status).toBe(401);
    const pending = await seedFile(db, carlos.userId, lessonId, { uploadStatus: "uploading" });
    expect((await call("GET", `/files/${pending.id}/url`)).status).toBe(404);
  });

  it("AC-10: another user's files are not reachable", async () => {
    const other = await createSignedInUser(db, auth, { githubId: "1002" });
    const theirLesson = await seedLesson(db, other.userId);
    const theirs = await seedFile(db, other.userId, theirLesson.id);
    expect((await call("GET", `/files/${theirs.id}/url`)).status).toBe(404);
    expect((await call("GET", `/files/${theirs.id}/open`)).status).toBe(404);
    expect((await call("DELETE", `/files/${theirs.id}`)).status).toBe(404);
    expect(
      (await call("POST", `/lessons/${theirLesson.id}/files`, { name: "a.pdf", size: 1 })).status,
    ).toBe(404);
  });

  it("shows a file with its extracted text and meta", async () => {
    const file = await seedFile(db, carlos.userId, lessonId, {
      kind: "docx",
      extractionStatus: "done",
      extractedText: "Tríadas",
      meta: null,
    });
    expect((await bodyOf(call("GET", `/files/${file.id}`))).file).toMatchObject({
      extractedText: "Tríadas",
      extractionStatus: "done",
    });
  });

  it("deletes a file from storage and the database, or nothing if storage fails", async () => {
    const file = await seedFile(db, carlos.userId, lessonId);
    memory.objects.set(file.r2Key, Buffer.from("pdf"));
    memory.state.failDeletes = true;
    expect((await call("DELETE", `/files/${file.id}`)).status).toBe(502);
    expect(await db.select().from(lessonFiles)).toHaveLength(1);

    memory.state.failDeletes = false;
    expect((await call("DELETE", `/files/${file.id}`)).status).toBe(204);
    expect(await db.select().from(lessonFiles)).toEqual([]);
    expect(memory.objects.size).toBe(0);
  });

  it("flags a file whose content matches another file on the lesson", async () => {
    await seedFile(db, carlos.userId, lessonId, { originalName: "tab.gp", sha256: "abc" });
    await seedFile(db, carlos.userId, lessonId, { originalName: "tab (1).gp", sha256: "abc" });
    const detail = await bodyOf(call("GET", `/lessons/${lessonId}`));
    expect(detail.files.map((file: { duplicateOf: string | null }) => file.duplicateOf)).toEqual([
      null,
      "tab.gp",
    ]);
  });
});
