import { Pencil, Plus } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { Button } from "@/components/ui/button";
import { NewBriefingButton } from "@/features/visitors/components/new-briefing-button";
import { securityAccess } from "@/features/visitors/guard";
import { Link } from "@/i18n/navigation";
import { getSetting } from "@/server/services/settings";
import { listBriefings } from "@/server/services/visitors";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("visitors.cards.briefings");
  return { title: t("title") };
}

/** Bilgilendirme paketleri (SPEC 8.1, karar #127): tip başına güncel yayın ve taslak. Yalnızca İSG uzmanı. */
export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const access = await securityAccess("visitor_briefings.manage");
  if (!access) return <NotFoundView />;
  const [t, tNav, format, rows, types] = await Promise.all([
    getTranslations("visitors"),
    getTranslations("sections.security"),
    getFormatter(),
    listBriefings(access.actor),
    getSetting("visitor.types"),
  ]);
  return (
    <section className="flex max-w-4xl flex-col gap-6">
      <PageHeader title={t("cards.briefings.title")} description={t("briefings.intro")} back={{ href: "/security", label: tNav("title") }} />
      <ul className="flex flex-col gap-3">
        {rows.map((r) => (
          <li key={r.type} className="flex flex-wrap items-center gap-4 rounded-2xl border p-5">
            <span className="min-w-48 flex-1">
              <span className="block text-lg font-medium">{t(`types.${r.type}`)}</span>
              <span className="block text-sm text-muted-foreground">
                {r.current
                  ? t("briefings.current", {
                      version: r.current.version,
                      date: format.dateTime(r.current.publishedAt!, { dateStyle: "medium" }),
                    })
                  : t("briefings.none")}
                {!types[r.type].enabled && ` · ${t("briefings.typeDisabled")}`}
              </span>
            </span>
            {r.draft ? (
              <Button nativeButton={false} render={<Link href={`/security/briefings/${r.draft.id}`} />}>
                <Pencil aria-hidden="true" />
                {t("briefings.editDraft", { version: r.draft.version })}
              </Button>
            ) : (
              <NewBriefingButton type={r.type}>
                <Plus aria-hidden="true" />
                {t("briefings.newDraft")}
              </NewBriefingButton>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
