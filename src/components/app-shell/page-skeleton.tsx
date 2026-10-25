import { useTranslations } from "next-intl";

/** Sayfa içeriği yüklenirken gösterilen iskelet (oturum okuyan her sayfa bunu Suspense fallback'i olarak kullanır). */
export function PageSkeleton() {
  const t = useTranslations("common");
  return (
    <div aria-busy="true" className="max-w-2xl">
      <span className="sr-only">{t("loading")}</span>
      <div className="h-8 w-48 animate-pulse rounded-lg bg-muted" />
      <div className="mt-6 h-24 animate-pulse rounded-2xl bg-muted" />
    </div>
  );
}
