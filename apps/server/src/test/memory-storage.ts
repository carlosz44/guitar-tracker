import type { Readable } from "node:stream";
import type { ObjectStorage } from "../storage/r2";

export function memoryStorage() {
  const objects = new Map<string, Buffer>();
  const state = { failUploads: false };

  const storage: ObjectStorage = {
    async presignPut(key) {
      return `https://storage.test/${key}?op=put`;
    },
    async presignGet(key) {
      return `https://storage.test/${key}?op=get`;
    },
    async head(key) {
      const object = objects.get(key);
      return object ? { size: object.length } : null;
    },
    async list(prefix) {
      return [...objects.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, body]) => ({ key, size: body.length }));
    },
    async delete(key) {
      objects.delete(key);
    },
    async uploadStream(key, body: Readable) {
      const chunks: Buffer[] = [];
      for await (const chunk of body) chunks.push(Buffer.from(chunk));
      if (state.failUploads) throw new Error("upload denied for fake-r2-secret-access-key");
      objects.set(key, Buffer.concat(chunks));
    },
  };

  return { storage, objects, state };
}
