import { Readable } from "node:stream";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createR2Storage, PRESIGN_TTL_SECONDS } from "./r2";

const config = {
  accountId: "fake-account",
  accessKeyId: "fake-access-key",
  secretAccessKey: "fake-r2-secret-access-key",
  bucket: "guitar-tracker",
};
const BASE = "https://fake-account.r2.cloudflarestorage.com/guitar-tracker";
const storage = createR2Storage(config);

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("presigned URLs", () => {
  it("presigns a PUT for 5 minutes without SDK checksum parameters", async () => {
    const url = new URL(
      await storage.presignPut("lesson-files/l/f-a.gp", {
        contentType: "application/octet-stream",
        contentLength: 1234,
      }),
    );
    expect(url.origin + url.pathname).toBe(`${BASE}/lesson-files/l/f-a.gp`);
    expect(url.searchParams.get("X-Amz-Expires")).toBe(String(PRESIGN_TTL_SECONDS));
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toContain("content-length");
    const params = [...url.searchParams.keys()].join(",").toLowerCase();
    expect(params).not.toContain("checksum");
  });

  it("presigns a GET with the requested disposition and a UTF-8 file name", async () => {
    const url = new URL(
      await storage.presignGet("lesson-files/l/f-a.pdf", {
        disposition: "attachment",
        fileName: "Tríadas.pdf",
      }),
    );
    expect(url.searchParams.get("response-content-disposition")).toBe(
      "attachment; filename*=UTF-8''Tr%C3%ADadas.pdf",
    );
    expect(url.searchParams.get("X-Amz-Expires")).toBe("300");
  });
});

describe("object operations", () => {
  it("heads an object, returning null when it doesn't exist", async () => {
    server.use(
      http.head(
        `${BASE}/present`,
        () => new HttpResponse(null, { status: 200, headers: { "content-length": "42" } }),
      ),
      http.head(`${BASE}/missing`, () => new HttpResponse(null, { status: 404 })),
    );
    expect(await storage.head("present")).toEqual({ size: 42 });
    expect(await storage.head("missing")).toBeNull();
  });

  it("lists every page of a prefix", async () => {
    server.use(
      http.get(BASE, ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get("prefix")).toBe("db-backups/");
        const token = url.searchParams.get("continuation-token");
        const body = token
          ? `<ListBucketResult><IsTruncated>false</IsTruncated><Contents><Key>db-backups/b</Key><Size>2</Size></Contents></ListBucketResult>`
          : `<ListBucketResult><IsTruncated>true</IsTruncated><NextContinuationToken>next</NextContinuationToken><Contents><Key>db-backups/a</Key><Size>1</Size></Contents></ListBucketResult>`;
        return new HttpResponse(body, { headers: { "content-type": "application/xml" } });
      }),
    );
    expect(await storage.list("db-backups/")).toEqual([
      { key: "db-backups/a", size: 1 },
      { key: "db-backups/b", size: 2 },
    ]);
  });

  it("streams an object's bytes", async () => {
    server.use(
      http.get(`${BASE}/lesson-files/l/f-a.gp`, () => new HttpResponse(new Uint8Array([1, 2, 3]))),
    );
    const chunks: Buffer[] = [];
    for await (const chunk of await storage.getStream("lesson-files/l/f-a.gp"))
      chunks.push(Buffer.from(chunk));
    expect([...Buffer.concat(chunks)]).toEqual([1, 2, 3]);
  });

  it("deletes an object", async () => {
    let deleted = "";
    server.use(
      http.delete(`${BASE}/db-backups/old.dump`, ({ request }) => {
        deleted = new URL(request.url).pathname;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await storage.delete("db-backups/old.dump");
    expect(deleted).toBe("/guitar-tracker/db-backups/old.dump");
  });

  it("uploads a stream", async () => {
    let received = 0;
    let contentType = "";
    server.use(
      http.put(`${BASE}/db-backups/x.dump`, async ({ request }) => {
        received = (await request.arrayBuffer()).byteLength;
        contentType = request.headers.get("content-type") ?? "";
        return new HttpResponse(null, { status: 200, headers: { etag: '"abc"' } });
      }),
    );
    await storage.uploadStream(
      "db-backups/x.dump",
      Readable.from([Buffer.alloc(1000), Buffer.alloc(24)]),
      "application/octet-stream",
    );
    expect(received).toBe(1024);
    expect(contentType).toBe("application/octet-stream");
  });
});
