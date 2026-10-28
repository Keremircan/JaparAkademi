import { createHash, randomUUID } from "node:crypto";
import type { Tx } from "@/server/db/client";
import { mediaAssets, signatures } from "@/server/db/schema";
import { ValidationError } from "@/server/errors";
import { uploadBuffer } from "@/server/storage/client";
import { canonicalJson } from "@/server/state/practice";

/**
 * İmza (SPEC Bölüm 7): giriş yapmış kimlik + zaman + IP + cihaz + imzalanan kaydın SHA-256 özeti.
 * Pratik sınavda ekrana çizilen imza PNG olarak `signatures/` önekinde saklanır.
 */

const MAX_SIGNATURE_BYTES = 300 * 1024;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export type SignatureImage = { key: string; bytes: Buffer };

/** Çizim imzasını (data URL) doğrular ve depoya yükler. Transaction dışında çağrılır. */
export async function uploadSignatureImage(dataUrl: string, prefix = "signatures"): Promise<SignatureImage> {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) throw new ValidationError("signature_invalid");
  const bytes = Buffer.from(m[1]!, "base64");
  // Çok küçük ya da PNG olmayan veri reddedilir (boş imzayı istemci zaten göndermez)
  if (bytes.length < 1200 || bytes.length > MAX_SIGNATURE_BYTES || !bytes.subarray(0, 8).equals(PNG_MAGIC)) {
    throw new ValidationError("signature_invalid");
  }
  const key = `${prefix}/${randomUUID()}.png`;
  await uploadBuffer(key, bytes, "image/png");
  return { key, bytes };
}

export function subjectHash(subject: unknown): string {
  return createHash("sha256").update(canonicalJson(subject)).digest("hex");
}

export async function createSignature(
  tx: Tx,
  input: {
    image: SignatureImage;
    signerUserId: string;
    capturedBy: string;
    subjectType: string;
    subjectId: string;
    role: "trainee" | "trainer" | "manager";
    hash: string;
    ip: string | null;
    userAgent: string | null;
  },
): Promise<string> {
  const [asset] = await tx
    .insert(mediaAssets)
    .values({
      kind: "image",
      status: "ready",
      objectKey: input.image.key,
      mime: "image/png",
      size: input.image.bytes.length,
      originalName: "imza.png",
      createdBy: input.capturedBy,
    })
    .returning({ id: mediaAssets.id });
  const [sig] = await tx
    .insert(signatures)
    .values({
      signerUserId: input.signerUserId,
      capturedBy: input.capturedBy,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      role: input.role,
      subjectHash: input.hash,
      imageAssetId: asset!.id,
      ip: input.ip,
      userAgent: input.userAgent?.slice(0, 500) ?? null,
    })
    .returning({ id: signatures.id });
  return sig!.id;
}
