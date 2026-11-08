import { AbortMultipartUploadCommand, DeleteObjectsCommand, ListMultipartUploadsCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { assertTestTarget } from "@/server/test-targets";

type Env = Record<string, string | undefined>;

/**
 * Testlerin dosya deposunu boşaltır (her test çalıştırmasının başında; karşılığı `src/server/test-targets.ts`).
 * Yalnızca adı test sonekiyle (`-test`, `-e2e`) biten depoya dokunur. Yarım kalmış parçalı yüklemeler de iptal edilir.
 * Ortam doğrulaması yapmaz: Vitest/Playwright kurulumundan ve betiklerden ortam nesnesiyle çağrılır.
 */
export async function emptyTestBucket(env: Env, bucket: string, suffix: string): Promise<number> {
  assertTestTarget("bucket", bucket, suffix);
  const client = new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    forcePathStyle: true,
    credentials: { accessKeyId: env.S3_ACCESS_KEY_ID ?? "", secretAccessKey: env.S3_SECRET_ACCESS_KEY ?? "" },
  });
  let removed = 0;
  try {
    let token: string | undefined;
    do {
      const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }));
      const keys = (page.Contents ?? []).flatMap((o) => (o.Key ? [{ Key: o.Key }] : []));
      if (keys.length) {
        await client.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: keys, Quiet: true } }));
        removed += keys.length;
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);

    const uploads = await client.send(new ListMultipartUploadsCommand({ Bucket: bucket }));
    for (const u of uploads.Uploads ?? []) {
      if (u.Key && u.UploadId) await client.send(new AbortMultipartUploadCommand({ Bucket: bucket, Key: u.Key, UploadId: u.UploadId }));
    }
  } catch (err) {
    if (err instanceof Error && err.name === "NoSuchBucket") {
      throw new Error(`Test deposu "${bucket}" yok: bir kez "npm run storage:init" çalıştırın`);
    }
    throw err;
  } finally {
    client.destroy();
  }
  return removed;
}
