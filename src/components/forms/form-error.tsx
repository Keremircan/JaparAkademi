"use client";

import { useTranslations } from "next-intl";

/** Eylem hatasını "errors.<kod>" metniyle gösterir. Bilinmeyen kod genel hata metnine düşer. */
export function FormError({ error, details }: { error?: string | null; details?: unknown }) {
  const t = useTranslations("errors");
  if (!error) return null;
  const key = (t.has(error as never) ? error : "unexpected") as Parameters<typeof t>[0];
  const columns = Array.isArray(details) ? details.join(", ") : "";
  return (
    <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-destructive">
      {t(key, { columns })}
    </p>
  );
}
