import { Filter, Plus } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { VisitList } from "@/features/visitors/components/visit-list";
import { securityAccess } from "@/features/visitors/guard";
import { Link } from "@/i18n/navigation";
import { can } from "@/server/authz/policy";
import { VISIT_STATUSES } from "@/server/state/visits";
import { listVisits } from "@/server/services/visitors";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("visitors.cards.visits");
  return { title: t("title") };
}

/** Ziyaretler (güvenlik ve İSG): tarih ve durum filtresi; ön kaydı yalnızca güvenlik açar. */
export default function Page({ searchParams }: PageProps<"/[locale]/security/visits">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

async function Content({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const access = await securityAccess("visits.view_all");
  if (!access) return <NotFoundView />;
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const from = DATE.test(str("from")) ? str("from") : undefined;
  const to = DATE.test(str("to")) ? str("to") : undefined;
  const status = VISIT_STATUSES.find((s) => s === str("status"));
  const [t, tNav, rows] = await Promise.all([
    getTranslations("visitors"),
    getTranslations("sections.security"),
    listVisits(access.actor, { scope: "all", from, to, status }),
  ]);
  return (
    <section className="flex max-w-5xl flex-col gap-6">
      <PageHeader
        title={t("cards.visits.title")}
        description={t("cards.visits.description")}
        back={{ href: "/security", label: tNav("title") }}
        actions={
          can(access.actor, "visits.manage_all") && (
            <Button nativeButton={false} render={<Link href="/security/visits/new" />}>
              <Plus aria-hidden="true" />
              {t("mine.new")}
            </Button>
          )
        }
      />
      <form className="flex flex-wrap items-end gap-3" method="get">
        <label className="flex flex-col gap-1 text-sm">
          {t("list.from")}
          <Input type="date" name="from" defaultValue={from} className="w-44" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t("list.to")}
          <Input type="date" name="to" defaultValue={to} className="w-44" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t("detail.status")}
          <NativeSelect name="status" defaultValue={status ?? ""} className="w-48">
            <option value="">{t("list.allStatuses")}</option>
            {VISIT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`status.${s}`)}
              </option>
            ))}
          </NativeSelect>
        </label>
        <Button type="submit" variant="outline">
          <Filter aria-hidden="true" />
          {t("list.apply")}
        </Button>
      </form>
      <VisitList rows={rows} base="/security/visits" showHost />
    </section>
  );
}
