import { and, eq, inArray, sql } from "drizzle-orm";
import type { Actor } from "@/server/authz/actor";
import { assertUser } from "@/server/authz/policy";
import { db } from "@/server/db/client";
import { contents, contentVersionAssets, contentVersions, mediaAssets, positionCardVersions, positions } from "@/server/db/schema";
import { withActor } from "@/server/db/with-actor";
import { ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { enqueue } from "@/server/jobs/send";
import { QUEUES } from "@/server/jobs/queues";
import { getSettings } from "@/server/services/settings";
import {
  abortMultipart,
  completeMultipart,
  headObject,
  signedPartUrl,
  signedPutUrl,
  startMultipart,
} from "@/server/storage/client";
import { canUseLibrary, canViewContent, contentAccessFor } from "../content/access";

/**
 * Medya yükleme (SPEC 11.5): tarayıcı dosyayı imzalı URL ile doğrudan Garage'a yükler.
 * Büyük dosyalar 16 MB'lık parçalarla yüklenir. Yükleme bitince worker işi kuyruğa alınır.
 */

export type MediaKind = "image" | "pdf" | "video" | "document";

export const MIME_BY_KIND: Record<MediaKind, Record<string, string>> = {
  image: { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" },
  pdf: { "application/pdf": "pdf" },
  video: { "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm" },
  document: {
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.ms-excel": "xls",
    "application/msword": "doc",
  },
};

export const PART_SIZE = 16 * 1024 * 1024;
const MULTIPART_THRESHOLD = 64 * 1024 * 1024;
const MB = 1024 * 1024;

export type UploadPlan =
  | { assetId: string; mode: "single"; url: string }
  | { assetId: string; mode: "multipart"; partSize: number; partUrls: string[] };

export async function startUpload(
  actor: Actor,
  input: { kind: MediaKind; mime: string; size: number; fileName: string },
): Promise<UploadPlan> {
  assertUser(actor);
  if (!canUseLibrary(actor)) throw new ForbiddenError("content.draft");
  const ext = MIME_BY_KIND[input.kind]?.[input.mime];
  if (!ext) throw new ValidationError("file_type_not_allowed");
  if (!Number.isInteger(input.size) || input.size <= 0) throw new ValidationError("file_empty");

  const limits = await getSettings(["upload.max_video_mb", "upload.max_pdf_mb", "upload.max_image_mb"]);
  const maxMb =
    input.kind === "video"
      ? limits["upload.max_video_mb"]
      : input.kind === "image"
        ? limits["upload.max_image_mb"]
        : limits["upload.max_pdf_mb"];
  if (input.size > maxMb * MB) throw new ValidationError("upload_too_large", { maxMb });

  const fileName = input.fileName.replace(/[\\/\0]/g, "_").slice(0, 200) || `dosya.${ext}`;
  const [asset] = await withActor(actor, (tx) =>
    tx
      .insert(mediaAssets)
      .values({
        kind: input.kind,
        objectKey: "pending",
        mime: input.mime,
        size: input.size,
        originalName: fileName,
        createdBy: actor.userId,
      })
      .returning({ id: mediaAssets.id }),
  );
  const assetId = asset!.id;
  const objectKey = `media/${assetId}/original.${ext}`;

  if (input.size > MULTIPART_THRESHOLD) {
    const uploadId = await startMultipart(objectKey, input.mime);
    await withActor(actor, (tx) => tx.update(mediaAssets).set({ objectKey, uploadId }).where(eq(mediaAssets.id, assetId)));
    const count = Math.ceil(input.size / PART_SIZE);
    const partUrls = await Promise.all(Array.from({ length: count }, (_, i) => signedPartUrl(objectKey, uploadId, i + 1)));
    return { assetId, mode: "multipart", partSize: PART_SIZE, partUrls };
  }

  await withActor(actor, (tx) => tx.update(mediaAssets).set({ objectKey }).where(eq(mediaAssets.id, assetId)));
  return { assetId, mode: "single", url: await signedPutUrl(objectKey, input.mime, 30 * 60) };
}

/** Yükleme bitti: dosya doğrulanır ve işlenmek üzere kuyruğa alınır. */
export async function completeUpload(
  actor: Actor,
  input: { assetId: string; parts?: { partNumber: number; etag: string }[] },
): Promise<void> {
  assertUser(actor);
  const [asset] = await db().select().from(mediaAssets).where(eq(mediaAssets.id, input.assetId)).limit(1);
  if (!asset) throw new NotFoundError("media");
  if (asset.createdBy !== actor.userId) throw new ForbiddenError("media.owner");
  if (asset.status !== "pending_upload") throw new ValidationError("upload_already_completed");

  if (asset.uploadId) {
    if (!input.parts?.length) throw new ValidationError("upload_incomplete");
    try {
      await completeMultipart(asset.objectKey, asset.uploadId, input.parts);
    } catch {
      await abortMultipart(asset.objectKey, asset.uploadId);
      throw new ValidationError("upload_incomplete");
    }
  }

  const head = await headObject(asset.objectKey);
  if (!head || head.size !== asset.size) throw new ValidationError("upload_incomplete");

  await withActor(actor, (tx) =>
    tx.update(mediaAssets).set({ status: "uploaded", uploadId: null }).where(eq(mediaAssets.id, asset.id)),
  );
  await enqueue(QUEUES.mediaProcess, { assetId: asset.id });
}

export type AssetInfo = {
  id: string;
  kind: MediaKind;
  status: "pending_upload" | "uploaded" | "processing" | "ready" | "failed";
  originalName: string;
  mime: string;
  size: number;
  durationSec: number | null;
  width: number | null;
  height: number | null;
  pageCount: number | null;
  error: string | null;
};

const assetColumns = {
  id: mediaAssets.id,
  kind: mediaAssets.kind,
  status: mediaAssets.status,
  originalName: mediaAssets.originalName,
  mime: mediaAssets.mime,
  size: mediaAssets.size,
  durationSec: mediaAssets.durationSec,
  width: mediaAssets.width,
  height: mediaAssets.height,
  pageCount: mediaAssets.pageCount,
  error: mediaAssets.error,
};

/** Görüntüleyici ve düzenleyici için medya bilgileri (erişim kontrolü çağıranın sorumluluğundadır). */
export async function assetsInfo(ids: string[]): Promise<Map<string, AssetInfo>> {
  if (ids.length === 0) return new Map();
  const rows = await db().select(assetColumns).from(mediaAssets).where(inArray(mediaAssets.id, ids));
  return new Map(rows.map((r) => [r.id, r]));
}

/** Yükleyen kendi dosyasının durumunu sorgular (işleme bitti mi). */
export async function myAssetStatus(actor: Actor, assetId: string): Promise<AssetInfo> {
  assertUser(actor);
  const [row] = await db()
    .select(assetColumns)
    .from(mediaAssets)
    .where(and(eq(mediaAssets.id, assetId), eq(mediaAssets.createdBy, actor.userId)))
    .limit(1);
  if (!row) throw new NotFoundError("media");
  return row;
}

/**
 * Medyaya erişim: yükleyen kişi ya da medyanın kullanıldığı bir içeriği görebilen kişi.
 * Pozisyon kartındaki iş akışı şeması da kartı görebilenlere açıktır. (1.4'te kursiyerler eklenecek.)
 */
export async function getAssetForViewer(actor: Actor, assetId: string) {
  assertUser(actor);
  const [asset] = await db().select().from(mediaAssets).where(eq(mediaAssets.id, assetId)).limit(1);
  if (!asset) return null;
  if (asset.createdBy === actor.userId) return asset;

  const refs = await db()
    .selectDistinct({ ownerOrgUnitId: contents.ownerOrgUnitId, isOhs: contents.isOhs })
    .from(contentVersionAssets)
    .innerJoin(contentVersions, eq(contentVersions.id, contentVersionAssets.contentVersionId))
    .innerJoin(contents, eq(contents.id, contentVersions.contentId))
    .where(eq(contentVersionAssets.assetId, assetId));
  // Pozisyon kartındaki iş akışı şeması (4. bölüm)
  const cards = await db()
    .selectDistinct({ ownerOrgUnitId: positions.orgUnitId })
    .from(positionCardVersions)
    .innerJoin(positions, eq(positions.id, positionCardVersions.positionId))
    .where(sql`${positionCardVersions.sections} -> 'workflow' ->> 'diagramAssetId' = ${assetId}`);
  if (refs.length === 0 && cards.length === 0) return null;
  const access = await contentAccessFor(actor);
  return [...refs, ...cards.map((c) => ({ ...c, isOhs: false }))].some((r) => canViewContent(access, r)) ? asset : null;
}
