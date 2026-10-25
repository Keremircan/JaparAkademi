import { GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/server/env";

/**
 * S3 uyumlu depolama (Garage). Tüm nesneler private bucket'tadır; istemciye yalnızca
 * kısa süreli imzalı URL verilir (SPEC 11.5).
 */
const SIGNED_URL_TTL_SECONDS = 5 * 60;

const globalForS3 = globalThis as unknown as { __akademiS3?: S3Client };

export function s3(): S3Client {
  if (!globalForS3.__akademiS3) {
    const e = env();
    globalForS3.__akademiS3 = new S3Client({
      endpoint: e.S3_ENDPOINT,
      region: e.S3_REGION,
      forcePathStyle: true,
      credentials: { accessKeyId: e.S3_ACCESS_KEY_ID, secretAccessKey: e.S3_SECRET_ACCESS_KEY },
      // AWS SDK varsayılan olarak imzalı URL'e boş gövdenin CRC32'sini ekliyor; istemci yüklemesi
      // farklı gövde göndereceği için doğrulama başarısız oluyor. Yalnızca sunucu isterse checksum.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  }
  return globalForS3.__akademiS3;
}

export function privateBucket(): string {
  return env().S3_BUCKET_PRIVATE;
}

/** Okuma için imzalı URL (varsayılan 5 dk). */
export function signedGetUrl(key: string, expiresIn = SIGNED_URL_TTL_SECONDS): Promise<string> {
  return getSignedUrl(s3(), new GetObjectCommand({ Bucket: privateBucket(), Key: key }), { expiresIn });
}

/** İstemciden doğrudan yükleme için imzalı PUT URL'i (iş paketi 1.2'de kullanılır). */
export function signedPutUrl(key: string, contentType: string, expiresIn = SIGNED_URL_TTL_SECONDS): Promise<string> {
  return getSignedUrl(
    s3(),
    new PutObjectCommand({ Bucket: privateBucket(), Key: key, ContentType: contentType }),
    { expiresIn },
  );
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
