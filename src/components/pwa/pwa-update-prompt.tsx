"use client";

import { useSerwist } from "@serwist/turbopack/react";
import { RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Yeni service worker beklemedeyse "Yeni sürüm hazır" bildirimi gösterir; onaylanınca sayfayı yeniler.
 * Sayfa yalnızca kullanıcı onayından sonra yenilenir: ilk kurulumda da "controlling" olayı gelir
 * (clientsClaim) ve o anda yenilemek kullanıcının doldurduğu formu siler.
 */
export function PwaUpdatePrompt() {
  const t = useTranslations("pwa");
  const { serwist } = useSerwist();
  const [waiting, setWaiting] = useState(false);
  const updateRequested = useRef(false);

  useEffect(() => {
    if (!serwist) return;
    const onWaiting = () => setWaiting(true);
    const onControlling = () => {
      if (updateRequested.current) window.location.reload();
    };
    serwist.addEventListener("waiting", onWaiting);
    serwist.addEventListener("controlling", onControlling);
    return () => {
      serwist.removeEventListener("waiting", onWaiting);
      serwist.removeEventListener("controlling", onControlling);
    };
  }, [serwist]);

  if (!waiting || !serwist) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl border bg-background p-4 shadow-lg lg:bottom-6"
    >
      <p className="flex-1">{t("updateAvailable")}</p>
      <Button
        onClick={() => {
          updateRequested.current = true;
          serwist.messageSkipWaiting();
        }}
      >
        <RefreshCw aria-hidden="true" />
        {t("reload")}
      </Button>
    </div>
  );
}
