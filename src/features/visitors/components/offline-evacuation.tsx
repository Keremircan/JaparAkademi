"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { clearEvacuationCache, EVACUATION_CACHE_MAX_AGE_MS, readEvacuationCache, type EvacuationCache } from "@/lib/evacuation-cache";

/** Çevrimdışı sayfada son tahliye listesi (karar #160): salt okunur, 24 saatten eskisi gösterilmez. */
export function OfflineEvacuation() {
  const t = useTranslations("evacuation");
  const [data, setData] = useState<EvacuationCache | null>(null);
  const [stale, setStale] = useState(false);
  useEffect(() => {
    void readEvacuationCache().then((c) => {
      if (!c) return;
      if (Date.now() - new Date(c.savedAt).getTime() > EVACUATION_CACHE_MAX_AGE_MS) {
        setStale(true);
        void clearEvacuationCache();
        return;
      }
      setData(c);
    });
  }, []);
  if (stale) return <p className="text-sm text-muted-foreground">{t("offlineStale")}</p>;
  if (!data) return null;
  const savedAt = new Date(data.savedAt).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" });
  return (
    <section aria-labelledby="offline-evac" className="w-full max-w-2xl text-left">
      <h2 id="offline-evac" className="text-xl font-semibold">
        {t("offlineTitle")}
      </h2>
      <p className="text-sm text-muted-foreground">
        {data.rollcall && `${data.rollcall.kind} · ${data.rollcall.startedAt} · `}
        {t("offlineSavedAt", { time: savedAt })}
      </p>
      <ul className="mt-3 divide-y rounded-2xl border">
        {data.people.map((p, i) => (
          <li key={i} className="flex flex-wrap items-center gap-x-3 px-4 py-3">
            <span className="flex-1">
              <span className="block font-medium">{p.name}</span>
              <span className="block text-sm text-muted-foreground">
                {p.type}
                {p.company && ` · ${p.company}`} · {p.host}
                {p.badge && ` · ${p.badge}`} · {p.checkedIn}
              </span>
            </span>
            {p.safe && <span className="rounded-full bg-emerald-600/10 px-2 py-0.5 text-sm text-emerald-700">{t("safe")}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Giriş sayfası açılınca (çıkış yapılmış) cihazdaki tahliye listesi silinir (karar #160). */
export function ClearEvacuationCache() {
  useEffect(() => {
    void clearEvacuationCache();
  }, []);
  return null;
}
