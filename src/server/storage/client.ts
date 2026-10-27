import { createReadStream, createWriteStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/server/env";

/**
 * S3 uyumlu depolama (Garage). Tüm nesneler private bucket'tadır; istemciye yalnızca
 * kısa süreli imzalı URL verilir (SPEC 11.5).
 *
 * İki istemci vardır: sunucu içi (S3_ENDPOINT) ve tarayıcıya verilen imzalı URL'ler için
 * dışarıdan erişilen adres (S3_PUBLIC_ENDPOINT; boşsa S3_ENDPOINT).
 */
export const SIGNED_URL_TTL_SECONDS = 5 * 60;

const globalForS3 = globalThis as unknown as { __akademiS3?: S3Client; __akademiS3Public?: S3Client };

function createClient(endpoint: string): S3Client {
  const e = env();
  return new S3Client({
    endpoint,
    region: e.S3_REGION,
    forcePathStyle: true,
    credentials: { accessKeyId: e.S3_ACCESS_KEY_ID, secretAccessKey: e.S3_SECRET_ACCESS_KEY },
    // AWS SDK varsayılan olarak imzalı URL'e boş gövdenin CRC32'sini ekliyor; istemci yüklemesi
    // farklı gövde göndereceği için doğrulama başarısız oluyor. Yalnızca sunucu isterse checksum.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
}

export function s3(): S3Client {
  globalForS3.__akademiS3 ??= createClient(env().S3_ENDPOINT);
  return globalForS3.__akademiS3;
}

/** Tarayıcıya verilecek imzalı URL'ler için istemci. */
function s3Public(): S3Client {
  const e = env();
  if (!e.S3_PUBLIC_ENDPOINT || e.S3_PUBLIC_ENDPOINT === e.S3_ENDPOINT) return s3();
  globalForS3.__akademiS3Public ??= createClient(e.S3_PUBLIC_ENDPOINT);
  return globalForS3.__akademiS3Public;
}

export function privateBucket(): string {
  return env().S3_BUCKET_PRIVATE;
}

/** Okuma için imzalı URL (varsayılan 5 dk). */
export function signedGetUrl(
  key: string,
  expiresIn = SIGNED_URL_TTL_SECONDS,
  opts: { downloadName?: string; contentType?: string } = {},
): Promise<string> {
  return getSignedUrl(
    s3Public(),
    new GetObjectCommand({
      Bucket: privateBucket(),
      Key: key,
      ResponseContentDisposition: opts.downloadName
        ? `attachment; filename*=UTF-8''${encodeURIComponent(opts.downloadName)}`
        : undefined,
      ResponseContentType: opts.contentType,
    }),
    { expiresIn },
  );
}

/** İstemciden doğrudan yükleme için imzalı PUT URL'i. */
export function signedPutUrl(key: string, contentType: string, expiresIn = SIGNED_URL_TTL_SECONDS): Promise<string> {
  return getSignedUrl(s3Public(), new PutObjectCommand({ Bucket: privateBucket(), Key: key, ContentType: contentType }), {
    expiresIn,
  });
}

// ---- Parçalı yükleme (büyük videolar) ----

export async function startMultipart(key: string, contentType: string): Promise<string> {
  const res = await s3().send(new CreateMultipartUploadCommand({ Bucket: privateBucket(), Key: key, ContentType: contentType }));
  if (!res.UploadId) throw new Error("Parçalı yükleme başlatılamadı");
  return res.UploadId;
}

export function signedPartUrl(key: string, uploadId: string, partNumber: number, expiresIn = 60 * 60): Promise<string> {
  return getSignedUrl(
    s3Public(),
    new UploadPartCommand({ Bucket: privateBucket(), Key: key, UploadId: uploadId, PartNumber: partNumber }),
    { expiresIn },
  );
}

export async function completeMultipart(key: string, uploadId: string, parts: { partNumber: number; etag: string }[]) {
  await s3().send(
    new CompleteMultipartUploadCommand({
      Bucket: privateBucket(),
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: [...parts].sort((a, b) => a.partNumber - b.partNumber).map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
      },
    }),
  );
}

export async function abortMultipart(key: string, uploadId: string) {
  await s3().send(new AbortMultipartUploadCommand({ Bucket: privateBucket(), Key: key, UploadId: uploadId })).catch(() => {});
}

// ---- Sunucu tarafı (worker) ----

export async function headObject(key: string): Promise<{ size: number; contentType?: string } | null> {
  try {
    const res = await s3().send(new HeadObjectCommand({ Bucket: privateBucket(), Key: key }));
    return { size: Number(res.ContentLength ?? 0), contentType: res.ContentType };
  } catch {
    return null;
  }
}

export async function downloadToFile(key: string, filePath: string): Promise<void> {
  const res = await s3().send(new GetObjectCommand({ Bucket: privateBucket(), Key: key }));
  if (!res.Body) throw new Error(`Nesne boş: ${key}`);
  await pipeline(res.Body as Readable, createWriteStream(filePath));
}

/** Küçük metin nesnesini okur (ör. HLS oynatma listesi). */
export async function getObjectText(key: string): Promise<string | null> {
  try {
    const res = await s3().send(new GetObjectCommand({ Bucket: privateBucket(), Key: key }));
    return (await res.Body?.transformToString("utf-8")) ?? null;
  } catch {
    return null;
  }
}

export async function getObjectBuffer(key: string): Promise<Buffer | null> {
  try {
    const res = await s3().send(new GetObjectCommand({ Bucket: privateBucket(), Key: key }));
    const bytes = await res.Body?.transformToByteArray();
    return bytes ? Buffer.from(bytes) : null;
  } catch {
    return null;
  }
}

export async function uploadFile(key: string, filePath: string, contentType: string, cacheControl?: string): Promise<void> {
  const { size } = await stat(filePath);
  await s3().send(
    new PutObjectCommand({
      Bucket: privateBucket(),
      Key: key,
      Body: createReadStream(filePath),
      ContentLength: size,
      ContentType: contentType,
      CacheControl: cacheControl,
    }),
  );
}

export async function uploadBuffer(key: string, body: Buffer, contentType: string): Promise<void> {
  await s3().send(new PutObjectCommand({ Bucket: privateBucket(), Key: key, Body: body, ContentType: contentType }));
}

/** Verilen anahtarları siler (olmayan anahtar hata vermez). */
export async function deleteObjects(keys: readonly string[]): Promise<void> {
  for (let i = 0; i < keys.length; i += 1000) {
    const chunk = keys.slice(i, i + 1000).map((Key) => ({ Key }));
    if (chunk.length) await s3().send(new DeleteObjectsCommand({ Bucket: privateBucket(), Delete: { Objects: chunk } }));
  }
}

/** Önek altındaki tüm nesneleri siler (ör. başarısız dönüşümün yarım kalan HLS dosyaları). */
export async function deletePrefix(prefix: string): Promise<void> {
  let token: string | undefined;
  do {
    const list = await s3().send(new ListObjectsV2Command({ Bucket: privateBucket(), Prefix: prefix, ContinuationToken: token }));
    const keys = (list.Contents ?? []).map((o) => ({ Key: o.Key! }));
    if (keys.length) await s3().send(new DeleteObjectsCommand({ Bucket: privateBucket(), Delete: { Objects: keys } }));
    token = list.IsTruncated ? list.NextContinuationToken : undefined;
  } while (token);
}

/** Sağlık kontrolü: bucket erişilebilir mi. */
export async function checkStorage(): Promise<boolean> {
  try {
    await s3().send(new HeadBucketCommand({ Bucket: privateBucket() }));
    return true;
  } catch {
    return false;
  }
}
