/**
 * Garage depolamasını hazırlar (tekrar çalıştırılabilir):
 *  1. Düğüm düzeni yoksa tek düğümlü düzen oluşturur ve uygular
 *  2. Uygulamanın S3 erişim anahtarını içe aktarır
 *  3. Private bucket'ı oluşturur ve anahtara okuma/yazma yetkisi verir
 *
 * Kullanım: npm run storage:init
 */
import { z } from "zod";
import { parseEnv } from "../src/server/env";

const cfg = parseEnv(
  z.object({
    GARAGE_ADMIN_URL: z.url(),
    GARAGE_ADMIN_TOKEN: z.string().min(1),
    GARAGE_CAPACITY_GB: z.coerce.number().int().positive().default(10),
    S3_ACCESS_KEY_ID: z.string().regex(/^GK[0-9a-f]{24}$/, "GK + 24 hex karakter olmalı"),
    S3_SECRET_ACCESS_KEY: z.string().regex(/^[0-9a-f]{64}$/, "64 hex karakter olmalı"),
    S3_BUCKET_PRIVATE: z.string().min(3),
  }),
);

async function admin<T>(path: string, body?: unknown): Promise<{ status: number; data: T }> {
  const res = await fetch(`${cfg.GARAGE_ADMIN_URL}/v2/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${cfg.GARAGE_ADMIN_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const data = (text ? JSON.parse(text) : null) as T;
  return { status: res.status, data };
}

async function ensureLayout() {
  const layout = await admin<{ version: number; roles: unknown[] }>("GetClusterLayout");
  if (layout.data.roles.length > 0) {
    console.log(`✓ Düğüm düzeni mevcut (sürüm ${layout.data.version})`);
    return;
  }
  const status = await admin<{ nodes: { id: string }[] }>("GetClusterStatus");
  const node = status.data.nodes[0];
  if (!node) throw new Error("Garage düğümü bulunamadı");

  await admin("UpdateClusterLayout", {
    roles: [
      {
        id: node.id,
        zone: "tr1",
        capacity: cfg.GARAGE_CAPACITY_GB * 1_000_000_000,
        tags: ["akademi"],
      },
    ],
  });
  const applied = await admin<unknown>("ApplyClusterLayout", { version: layout.data.version + 1 });
  if (applied.status !== 200) {
    throw new Error(`Düğüm düzeni uygulanamadı: ${JSON.stringify(applied.data)}`);
  }
  console.log("✓ Tek düğümlü düzen oluşturuldu");
}

async function ensureKey() {
  const existing = await admin("GetKeyInfo?id=" + encodeURIComponent(cfg.S3_ACCESS_KEY_ID));
  if (existing.status === 200) {
    console.log("✓ Erişim anahtarı mevcut");
    return;
  }
  const res = await admin("ImportKey", {
    accessKeyId: cfg.S3_ACCESS_KEY_ID,
    secretAccessKey: cfg.S3_SECRET_ACCESS_KEY,
    name: "akademi-app",
  });
  if (res.status !== 200) throw new Error(`Anahtar içe aktarılamadı: ${JSON.stringify(res.data)}`);
  console.log("✓ Erişim anahtarı içe aktarıldı");
}

async function ensureBucket() {
  const alias = cfg.S3_BUCKET_PRIVATE;
  let bucket = await admin<{ id: string }>("GetBucketInfo?globalAlias=" + encodeURIComponent(alias));
  if (bucket.status !== 200) {
    bucket = await admin<{ id: string }>("CreateBucket", { globalAlias: alias });
    if (bucket.status !== 200) throw new Error(`Bucket oluşturulamadı: ${JSON.stringify(bucket.data)}`);
    console.log(`✓ Bucket oluşturuldu: ${alias}`);
  } else {
    console.log(`✓ Bucket mevcut: ${alias}`);
  }
  const allow = await admin("AllowBucketKey", {
    bucketId: bucket.data.id,
    accessKeyId: cfg.S3_ACCESS_KEY_ID,
    permissions: { read: true, write: true, owner: false },
  });
  if (allow.status !== 200) throw new Error(`Bucket yetkisi verilemedi: ${JSON.stringify(allow.data)}`);
  console.log("✓ Anahtarın bucket yetkisi (okuma/yazma) ayarlandı");
}

async function main() {
  await ensureLayout();
  await ensureKey();
  await ensureBucket();
}

main().catch((err) => {
  console.error("✗ Depolama kurulumu başarısız:", err instanceof Error ? err.message : err);
  process.exit(1);
});
