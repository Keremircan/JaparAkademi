import { AlertTriangle } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { StatusBadge } from "@/features/content/components/status-badge";
import { libraryAccess } from "@/features/content/guard";
import { Link } from "@/i18n/navigation";
import { listPositionCards } from "@/server/services/positions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("positions");
  return { title: t("title") };
}

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const access = await libraryAccess();
  if (!access) return <NotFoundView />;
  const [t, tNav, format, items] = await Promise.all([
    getTranslations("positions"),
    getTranslations("sections.manage"),
    getFormatter(),
    listPositionCards(access.actor),
  ]);

  return (
    <section className="max-w-5xl">
      <PageHeader title={t("title")} description={t("description")} back={{ href: "/manage", label: tNav("title") }} />
      {items.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-6 text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="divide-y rounded-2xl border">
          {items.map((p) => (
            <li key={p.positionId}>
              <Link href={`/manage/positions/${p.positionId}`} className="flex min-h-16 flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 hover:bg-muted">
                <span className="min-w-48 flex-1">
                  <span className="block font-medium">{p.name}</span>
                  <span className="block text-sm text-muted-foreground">
                    {[p.parentName, p.unitName].filter(Boolean).join(" / ")} · {p.code}
                    {p.lastReviewedAt && ` · ${t("lastReviewed", { date: format.dateTime(p.lastReviewedAt, { dateStyle: "medium" }) })}`}
                  </span>
                </span>
                <span className="flex flex-wrap gap-1 text-xs">
                  {p.latestVersion === null && <span className="rounded-full bg-muted px-2 py-0.5">{t("noCard")}</span>}
                  {p.publishedVersion && <StatusBadge status="published" version={p.publishedVersion} />}
                  {p.latestStatus && p.latestStatus !== "published" && <StatusBadge status={p.latestStatus} version={p.latestVersion!} />}
                  {p.stale && (
                    <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-800 dark:text-amber-300">
                      <AlertTriangle aria-hidden="true" className="size-3" />
                      {t("stale")}
                    </span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
