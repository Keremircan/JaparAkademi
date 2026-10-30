import { Filter } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { PeriodicPanel } from "@/features/periodic/components/periodic-panel";
import { PriorImport } from "@/features/periodic/components/prior-import";
import { todayIn } from "@/lib/dates";
import { can } from "@/server/authz/policy";
import { getSectionUser } from "@/server/auth/current-user";
import { toActor } from "@/server/services/auth";
import { periodicOverview, type PeriodicFilters } from "@/server/services/assignments/periodic";
import { getSettings } from "@/server/services/settings";
import type { PeriodicState } from "@/server/state/periodic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("periodic");
  return { title: t("title") };
}

/** Eski personelin periyodik eğitimleri (iş paketi 3.2, kararlar #222–225). */
export default function Page({ searchParams }: PageProps<"/[locale]/manage/periodic">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

const UUID = /^[0-9a-f-]{36}$/;
const STATES: PeriodicState[] = ["none", "scheduled", "open"];

async function Content({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getSectionUser("manage");
  if (!user) return <NotFoundView />;
  const actor = toActor(user);
  if (!can(actor, "periodic.view")) return <NotFoundView />;
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).trim() : "");
  const filters: PeriodicFilters = {
    unitId: UUID.test(str("unit")) ? str("unit") : null,
    moduleId: UUID.test(str("module")) ? str("module") : null,
    state: STATES.includes(str("state") as PeriodicState) ? (str("state") as PeriodicState) : null,
    q: str("q").slice(0, 100) || null,
  };
  const [t, tNav, data, { "org.timezone": tz }] = await Promise.all([
    getTranslations("periodic"),
    getTranslations("sections.manage"),
    periodicOverview(actor, filters),
    getSettings(["org.timezone"]),
  ]);

  return (
    <section className="flex max-w-6xl flex-col gap-6">
      <PageHeader title={t("title")} description={t("description", { days: data.leadDays })} back={{ href: "/manage", label: tNav("title") }} />

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-2xl border p-4" aria-label={t("filters.apply")}>
        <label className="flex min-w-48 flex-1 flex-col gap-1">
          <span className="text-sm font-medium">{t("filters.q")}</span>
          <Input name="q" type="search" defaultValue={filters.q ?? ""} maxLength={100} />
        </label>
        <label className="flex min-w-48 flex-col gap-1">
          <span className="text-sm font-medium">{t("filters.unit")}</span>
          <NativeSelect name="unit" defaultValue={filters.unitId ?? ""}>
            <option value="">{t("filters.all")}</option>
            {data.units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.parentName ? `${u.parentName} / ${u.name}` : u.name}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="flex min-w-48 flex-col gap-1">
          <span className="text-sm font-medium">{t("filters.module")}</span>
          <NativeSelect name="module" defaultValue={filters.moduleId ?? ""}>
            <option value="">{t("filters.all")}</option>
            {data.modules.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="flex min-w-40 flex-col gap-1">
          <span className="text-sm font-medium">{t("filters.state")}</span>
          <NativeSelect name="state" defaultValue={filters.state ?? ""}>
            <option value="">{t("filters.all")}</option>
            {STATES.map((s) => (
              <option key={s} value={s}>
                {t(`filters.states.${s}`)}
              </option>
            ))}
          </NativeSelect>
        </label>
        <Button type="submit">
          <Filter aria-hidden="true" />
          {t("filters.apply")}
        </Button>
      </form>

      {data.truncated && <p className="rounded-xl border bg-muted p-3 text-sm">{t("truncated")}</p>}

      <PeriodicPanel rows={data.rows} modules={data.modules} canRecord={data.can.record} canStart={data.can.start} today={todayIn(tz)} />

      {data.can.record && (
        <section aria-labelledby="import-heading" className="flex flex-col gap-3 rounded-2xl border p-5">
          <h2 id="import-heading" className="text-lg font-semibold">
            {t("import.heading")}
          </h2>
          <PriorImport />
        </section>
      )}
    </section>
  );
}
