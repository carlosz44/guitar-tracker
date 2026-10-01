import type { Readable } from "node:stream";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const PRESIGN_TTL_SECONDS = 5 * 60;
const PART_SIZE_BYTES = 5 * 1024 * 1024;

export interface StoredObject {
  key: string;
  size: number;
}

export interface ObjectStorage {
  presignPut(key: string, options: { contentType: string; contentLength: number }): Promise<string>;
  presignGet(
    key: string,
    options?: { disposition?: "inline" | "attachment"; fileName?: string },
  ): Promise<string>;
  head(key: string): Promise<{ size: number } | null>;
  list(prefix: string): Promise<StoredObject[]>;
  delete(key: string): Promise<void>;
  uploadStream(key: string, body: Readable, contentType: string): Promise<void>;
}

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  endpoint?: string;
}

export function createR2Client(config: R2Config) {
  return new S3Client({
    region: "auto",
    endpoint: config.endpoint ?? `https://${config.accountId}.r2.cloudflarestorage.com`,
    forcePathStyle: true,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    // R2 rejects the SDK's default CRC32 checksum headers on presigned uploads.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
}

function contentDisposition(disposition: "inline" | "attachment", fileName?: string) {
  if (!fileName) return disposition;
  return `${disposition}; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export function createR2Storage(config: R2Config, client = createR2Client(config)): ObjectStorage {
  const Bucket = config.bucket;

  return {
    presignPut(key, { contentType, contentLength }) {
      return getSignedUrl(
        client,
        new PutObjectCommand({
          Bucket,
          Key: key,
          ContentType: contentType,
          ContentLength: contentLength,
        }),
        { expiresIn: PRESIGN_TTL_SECONDS },
      );
    },

    presignGet(key, options = {}) {
      return getSignedUrl(
        client,
        new GetObjectCommand({
          Bucket,
          Key: key,
          ResponseContentDisposition: contentDisposition(
            options.disposition ?? "inline",
            options.fileName,
          ),
        }),
        { expiresIn: PRESIGN_TTL_SECONDS },
      );
    },

    async head(key) {
      try {
        const result = await client.send(new HeadObjectCommand({ Bucket, Key: key }));
        return { size: result.ContentLength ?? 0 };
      } catch (error) {
        if (error instanceof S3ServiceException && error.$metadata.httpStatusCode === 404) {
          return null;
        }
        throw error;
      }
    },

    async list(prefix) {
      const objects: StoredObject[] = [];
      let ContinuationToken: string | undefined;
      do {
        const page = await client.send(
          new ListObjectsV2Command({ Bucket, Prefix: prefix, ContinuationToken }),
        );
        for (const item of page.Contents ?? []) {
          if (item.Key) objects.push({ key: item.Key, size: item.Size ?? 0 });
        }
        ContinuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (ContinuationToken);
      return objects;
    },

    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket, Key: key }));
    },

    async uploadStream(key, body, contentType) {
      await new Upload({
        client,
        params: { Bucket, Key: key, Body: body, ContentType: contentType },
        queueSize: 1,
        partSize: PART_SIZE_BYTES,
        leavePartsOnError: false,
      }).done();
    },
  };
}
