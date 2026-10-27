import { BarChart3, ClipboardList, HardHat, History, Timer } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { Link } from "@/i18n/navigation";
import { getSectionUser } from "@/server/auth/current-user";
import { can } from "@/server/authz/policy";
import { toActor } from "@/server/services/auth";
import { canViewReport, REPORT_KINDS } from "@/server/services/reports";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("sections.reports");
  return { title: t("title") };
}

const ICONS = { training: BarChart3, exams: ClipboardList, ohs: HardHat, onboarding: Timer } as const;

/** Raporlar (SPEC 10.1): role göre görülebilen Faz 1 raporları. */
export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const user = await getSectionUser("reports");
  if (!user) return <NotFoundView />;
  const actor = toActor(user);
  const [t, ts, ta] = await Promise.all([getTranslations("reports"), getTranslations("sections.reports"), getTranslations("admin.cards.audit")]);
  const kinds = REPORT_KINDS.filter((k) => canViewReport(actor, k));
  const audit = can(actor, "audit.view");
  return (
    <section className="max-w-4xl">
      <PageHeader title={ts("title")} description={t("intro")} />
      {kinds.length === 0 && !audit ? (
        <p className="rounded-2xl border border-dashed p-6 text-muted-foreground">{t("none")}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {kinds.map((k) => {
            const Icon = ICONS[k];
            return (
              <li key={k}>
                <Link href={`/reports/${k}`} className="flex min-h-24 items-start gap-4 rounded-2xl border bg-card p-5 hover:bg-muted">
                  <Icon aria-hidden="true" className="mt-0.5 size-6 shrink-0 text-muted-foreground" />
                  <span>
                    <span className="block text-lg font-medium">{t(`kinds.${k}.title`)}</span>
                    <span className="mt-1 block text-sm text-muted-foreground">{t(`kinds.${k}.description`)}</span>
                  </span>
                </Link>
              </li>
            );
          })}
          {audit && (
            <li>
              <Link href="/admin/audit" className="flex min-h-24 items-start gap-4 rounded-2xl border bg-card p-5 hover:bg-muted">
                <History aria-hidden="true" className="mt-0.5 size-6 shrink-0 text-muted-foreground" />
                <span>
                  <span className="block text-lg font-medium">{ta("title")}</span>
                  <span className="mt-1 block text-sm text-muted-foreground">{ta("description")}</span>
                </span>
              </Link>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
