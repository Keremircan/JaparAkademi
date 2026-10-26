"use client";

import { FileUp, Loader2, RefreshCw, TriangleAlert, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { FormError } from "@/components/forms/form-error";
import { Button } from "@/components/ui/button";
import type { AssetInfo, MediaKind } from "@/server/services/media";
import { assetStatusAction, completeUploadAction, startUploadAction } from "../actions";
import { formatBytes } from "../format";

export const ACCEPT: Record<MediaKind, string> = {
  image: "image/jpeg,image/png,image/webp",
  pdf: "application/pdf",
  video: "video/mp4,video/quicktime,video/webm",
  document:
    "application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/msword",
};

const PARALLEL_PARTS = 3;

function putWithProgress(url: string, body: Blob, contentType: string | null, onProgress: (loaded: number) => void): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    if (contentType) xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve(xhr.getResponseHeader("ETag")) : reject(new Error(String(xhr.status))));
    xhr.onerror = () => reject(new Error("network"));
    xhr.send(body);
  });
}

/** Dosyayı tarayıcıdan doğrudan depolamaya yükler, sonra işlenmesini bekler. */
export async function uploadFile(
  file: File,
  kinds: readonly MediaKind[],
  onProgress: (ratio: number) => void,
): Promise<{ ok: true; assetId: string } | { ok: false; error: string }> {
  const kind = kinds.find((k) => ACCEPT[k].split(",").includes(file.type));
  if (!kind) return { ok: false, error: "file_type_not_allowed" };
  const plan = await startUploadAction({ kind, mime: file.type, size: file.size, fileName: file.name });
  if (!plan.ok) return plan;
  try {
    if (plan.data.mode === "single") {
      await putWithProgress(plan.data.url, file, file.type, (loaded) => onProgress(loaded / file.size));
      const done = await completeUploadAction({ assetId: plan.data.assetId });
      if (!done.ok) return done;
    } else {
      const { partSize, partUrls } = plan.data;
      const loaded = new Array<number>(partUrls.length).fill(0);
      const parts: { partNumber: number; etag: string }[] = [];
      let next = 0;
      const worker = async () => {
        while (next < partUrls.length) {
          const i = next++;
          const blob = file.slice(i * partSize, Math.min(file.size, (i + 1) * partSize));
          const etag = await putWithProgress(partUrls[i]!, blob, null, (l) => {
            loaded[i] = l;
            onProgress(loaded.reduce((a, b) => a + b, 0) / file.size);
          });
          if (!etag) throw new Error("etag");
          parts.push({ partNumber: i + 1, etag });
        }
      };
      await Promise.all(Array.from({ length: Math.min(PARALLEL_PARTS, partUrls.length) }, worker));
      const done = await completeUploadAction({ assetId: plan.data.assetId, parts });
      if (!done.ok) return done;
    }
  } catch {
    return { ok: false, error: "upload_failed" };
  }
  return { ok: true, assetId: plan.data.assetId };
}

/** İşleme bitene kadar durum sorgular. */
export function useAssetStatus(asset: AssetInfo | null, onUpdate: (a: AssetInfo) => void) {
  const pending = asset && (asset.status === "uploaded" || asset.status === "processing");
  const ref = useRef(onUpdate);
  useEffect(() => {
    ref.current = onUpdate;
  });
  useEffect(() => {
    if (!pending || !asset) return;
    const timer = setInterval(async () => {
      const r = await assetStatusAction(asset.id);
      if (r.ok && r.data.status !== asset.status) ref.current(r.data);
    }, 2500);
    return () => clearInterval(timer);
  }, [pending, asset]);
}

/**
 * Tek medya alanı: dosya seç → yükle → işleniyor → hazır.
 * `asset` alanın güncel değeridir; değişiklikler `onChange` ile bildirilir (null = kaldırıldı).
 */
export function MediaField({
  label,
  kinds,
  asset,
  onChange,
  optional,
}: {
  label: string;
  kinds: readonly MediaKind[];
  asset: AssetInfo | null;
  onChange: (asset: AssetInfo | null) => void;
  optional?: boolean;
}) {
  const t = useTranslations("content.media");
  const id = useId();
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  useAssetStatus(asset, onChange);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setProgress(0);
    const result = await uploadFile(file, kinds, setProgress);
    setProgress(null);
    if (!result.ok) return setError(result.error);
    const status = await assetStatusAction(result.assetId);
    if (status.ok) onChange(status.data);
  }

  const accept = kinds.map((k) => ACCEPT[k]).join(",");

  return (
    <div className="flex flex-col gap-2">
      <span className="text-base font-medium">
        {label}
        {optional && <span className="font-normal text-muted-foreground"> ({t("optional")})</span>}
      </span>
      {asset ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border p-3">
          {asset.kind === "image" && asset.status === "ready" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/media/${asset.id}/thumb`} alt="" className="size-16 rounded-lg object-cover" />
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{asset.originalName}</p>
            <p className="flex items-center gap-1 text-sm text-muted-foreground">
              {(asset.status === "uploaded" || asset.status === "processing") && <Loader2 aria-hidden="true" className="size-4 animate-spin" />}
              {asset.status === "failed" && <TriangleAlert aria-hidden="true" className="size-4 text-destructive" />}
              <span role="status">
                {t(`status.${asset.status}`)} · {formatBytes(asset.size)}
                {asset.pageCount ? ` · ${t("pages", { count: asset.pageCount })}` : ""}
                {asset.durationSec ? ` · ${t("duration", { minutes: Math.floor(asset.durationSec / 60), seconds: String(asset.durationSec % 60).padStart(2, "0") })}` : ""}
              </span>
            </p>
          </div>
          <label htmlFor={id} className="flex min-h-12 cursor-pointer items-center gap-2 rounded-lg border px-3 hover:bg-muted">
            <RefreshCw aria-hidden="true" className="size-4" />
            {t("replace")}
          </label>
          <Button type="button" variant="ghost" size="icon" onClick={() => onChange(null)} aria-label={t("remove")}>
            <X aria-hidden="true" />
          </Button>
        </div>
      ) : progress === null ? (
        <label
          htmlFor={id}
          className="flex min-h-20 cursor-pointer items-center justify-center gap-3 rounded-xl border-2 border-dashed p-4 text-muted-foreground hover:bg-muted"
        >
          <FileUp aria-hidden="true" className="size-6" />
          <span>{t("choose")}</span>
        </label>
      ) : null}
      {progress !== null && (
        <div className="flex flex-col gap-1">
          <progress max={1} value={progress} className="h-3 w-full accent-primary" aria-label={t("uploading")} />
          <span className="text-sm text-muted-foreground" aria-live="polite">
            {t("uploadingPercent", { percent: Math.round(progress * 100) })}
          </span>
        </div>
      )}
      <input
        id={id}
        type="file"
        accept={accept}
        className="sr-only"
        disabled={progress !== null}
        onChange={(e) => {
          void onFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <FormError error={error} />
    </div>
  );
}
