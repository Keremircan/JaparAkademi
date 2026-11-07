"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, type ReactNode } from "react";
import { revealElement } from "@/lib/reveal";

/**
 * Kaydırma payları. Üstte: telefondaki üst çubuk (3.5rem). Altta: alt menü (4rem) + mesajın hemen altındaki
 * düğme ve boşluğu: mesaja kayınca "Kaydet" de ekranda kalır. Geniş ekranda çubuk yok, yalnızca düğme payı.
 */
const REVEAL_MARGINS =
  "scroll-mt-[calc(env(safe-area-inset-top)+4.5rem)] scroll-mb-[calc(env(safe-area-inset-bottom)+9rem)] lg:scroll-mt-6 lg:scroll-mb-20";

/**
 * Hata/uyarı kutusu (kararlar #269–270). Formda gönder düğmesinin hemen üstünde durur;
 * çıktığında ya da metni değiştiğinde ekranda değilse görünür alana kayar.
 * `revealKey` mesajın kimliğidir (genelde metnin kendisi): değişince yeniden kaydırılır.
 */
export function AlertMessage({ children, id, revealKey }: { children: ReactNode; id?: string; revealKey: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) revealElement(ref.current);
  }, [revealKey]);
  return (
    <div ref={ref} id={id} role="alert" className={`${REVEAL_MARGINS} rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-destructive`}>
      {children}
    </div>
  );
}

/** Eylem hatasını "errors.<kod>" metniyle gösterir. Bilinmeyen kod genel hata metnine düşer. */
export function FormError({ error, details }: { error?: string | null; details?: unknown }) {
  const t = useTranslations("errors");
  if (!error) return null;
  const key = (t.has(error as never) ? error : "unexpected") as Parameters<typeof t>[0];
  const columns = Array.isArray(details) ? details.join(", ") : "";
  // Nesne olarak gelen ayrıntılar metin parametresi olur (ör. { max: 200 })
  const params = details && typeof details === "object" && !Array.isArray(details) ? (details as Record<string, string | number>) : {};
  const text = t(key, { ...params, columns });
  return <AlertMessage revealKey={text}>{text}</AlertMessage>;
}
