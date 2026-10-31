"use client";

import { Camera, Loader2, Trash2, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { FormError } from "@/components/forms/form-error";
import { Button } from "@/components/ui/button";
import { assetStatusAction } from "@/features/content/actions";
import { ACCEPT, uploadFile, useAssetStatus } from "@/features/content/components/media-upload";
import type { AssetInfo } from "@/server/services/media";
import { removePhotoAction, setPhotoAction } from "../actions";

/**
 * Profil fotoğrafı (iş paketi 3.4). `userId` null ise kişinin kendi fotoğrafı, doluysa İK'nın düzenlediği personel.
 * Yükleme yalnızca kişinin açık rızası varken açıktır; dosya sunucuda yeniden kodlanır (konum/EXIF silinir).
 */
export function ProfilePhoto({
  userId,
  name,
  photo,
  consent,
  canEdit,
}: {
  userId: string | null;
  name: string;
  photo: AssetInfo | null;
  consent: boolean;
  canEdit: boolean;
}) {
  const t = useTranslations("profile.photo");
  const inputId = useId();
  const [asset, setAsset] = useState<AssetInfo | null>(photo);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  useAssetStatus(asset, setAsset);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setProgress(0);
    const uploaded = await uploadFile(file, ["image"], setProgress, "profile_photo");
    setProgress(null);
    if (!uploaded.ok) return setError(uploaded.error);
    startTransition(async () => {
      const r = await setPhotoAction(userId, uploaded.assetId);
      if (!r.ok) return setError(r.error);
      const status = await assetStatusAction(uploaded.assetId);
      if (status.ok) setAsset(status.data);
    });
  }

  const busy = pending || progress !== null;
  const ready = asset?.status === "ready";

  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-muted">
        {asset && ready ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/media/${asset.id}/thumb`} alt={t("alt", { name })} className="size-full object-cover" />
        ) : asset ? (
          <Loader2 aria-label={t("processing")} className="size-8 animate-spin text-muted-foreground" />
        ) : (
          <UserRound aria-hidden="true" className="size-12 text-muted-foreground" />
        )}
      </div>
      {canEdit && (
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {consent ? (
            <div className="flex flex-wrap gap-2">
              <input
                id={inputId}
                type="file"
                accept={ACCEPT.image}
                className="sr-only"
                disabled={busy}
                onChange={(e) => {
                  void onFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              <Button
                variant="outline"
                size="lg"
                disabled={busy}
                nativeButton={false}
                render={<label htmlFor={inputId} />}
                className="cursor-pointer"
              >
                <Camera aria-hidden="true" />
                {progress !== null ? t("uploading", { percent: Math.round(progress * 100) }) : asset ? t("change") : t("add")}
              </Button>
              {asset && (
                <Button
                  variant="outline"
                  size="lg"
                  disabled={busy}
                  onClick={() => {
                    if (!window.confirm(t("removeConfirm"))) return;
                    setError(null);
                    startTransition(async () => {
                      const r = await removePhotoAction(userId);
                      if (!r.ok) return setError(r.error);
                      setAsset(null);
                    });
                  }}
                >
                  <Trash2 aria-hidden="true" />
                  {t("remove")}
                </Button>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{userId ? t("noConsentOther") : t("noConsentSelf")}</p>
          )}
          {asset && !ready && <p role="status" className="text-sm text-muted-foreground">{t("processing")}</p>}
          <FormError error={error} />
        </div>
      )}
    </div>
  );
}
