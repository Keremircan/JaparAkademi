"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MediaField } from "@/features/content/components/media-upload";
import type { AssetInfo } from "@/server/services/media";

const MAX_PHOTOS = 6;

/** Fotoğraf ekleme (işaretleme ve pratik sınav; en fazla 6 görsel). */
export function PhotoList({ label, value, onChange }: { label: string; value: AssetInfo[]; onChange: (assets: AssetInfo[]) => void }) {
  const t = useTranslations("practice.photos");
  const [key, setKey] = useState(0);
  return (
    <div className="flex flex-col gap-2">
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label={label}>
          {value.map((a) => (
            <li key={a.id} className="relative">
              {a.status === "ready" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/media/${a.id}/thumb`} alt={a.originalName} className="size-20 rounded-lg border object-cover" />
              ) : (
                <span className="flex size-20 items-center justify-center rounded-lg border p-1 text-center text-xs text-muted-foreground">{a.originalName}</span>
              )}
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="absolute -top-3 -right-3 rounded-full"
                aria-label={t("remove", { name: a.originalName })}
                onClick={() => onChange(value.filter((x) => x.id !== a.id))}
              >
                <X aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {value.length < MAX_PHOTOS && (
        <MediaField
          key={key}
          label={label}
          optional
          kinds={["image"]}
          asset={null}
          onChange={(asset) => {
            if (!asset) return;
            onChange([...value, asset]);
            setKey((k) => k + 1);
          }}
        />
      )}
    </div>
  );
}
