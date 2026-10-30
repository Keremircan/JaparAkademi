import { Download, Filter } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { GrantPanel } from "@/features/competencies/components/grant-panel";
import { Link } from "@/i18n/navigation";
import { can } from "@/server/authz/policy";
import { getSectionUser } from "@/server/auth/current-user";
import { toActor } from "@/server/services/auth";
import { competencyMatrix, grantHistory } from "@/server/services/competencies";
import type { CompetencyState } from "@/server/state/competencies";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("competencies.matrix");
  return { title: t("title") };
}

/** Yetkinlik matrisi (FG-7.4, Ekran 16): personel × yetkinlik, süresi dolanlar renkli. */
export default function Page({ searchParams }: PageProps<"/[locale]/reports/competency">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

const UUID = /^[0-9a-f-]{36}$/;
const STATE_CLASS: Record<CompetencyState, string> = {
  valid: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300",
  expiring: "bg-amber-400/25 text-amber-900 dark:text-amber-200",
  expired: "bg-destructive/15 text-destructive",
};

async function Content({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getSectionUser("reports");
  if (!user) return <NotFoundView />;
  const actor = toActor(user);
  if (!can(actor, "competencies.view")) return <NotFoundView />;
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const unitParam = UUID.test(str("unit")) ? str("unit") : null;
  const m = await competencyMatrix(actor, unitParam);
  const [t, tNav, format] = await Promise.all([getTranslations("competencies"), getTranslations("reports"), getFormatter()]);
  const date = (d: Date) => format.dateTime(d, { dateStyle: "short" });
  const [cellUser, cellComp] = str("cell").split(":");
  const selected =
    m.unitId && cellUser && cellComp && UUID.test(cellUser) && UUID.test(cellComp)
      ? { person: m.people.find((p) => p.userId === cellUser), competency: m.competencies.find((c) => c.id === cellComp) }
      : null;
  const history = selected?.person && selected.competency ? await grantHistory(actor, cellUser!, cellComp!) : [];
  const cellHref = (userId: string, compId: string) => `/reports/competency?unit=${m.unitId}&cell=${userId}:${compId}#cell`;

  return (
    <section className="flex flex-col gap-6">
      <PageHeader title={t("matrix.title")} description={t("matrix.description", { days: m.alertDays })} back={{ href: "/reports", label: tNav("back") }} />

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-2xl border p-4" aria-label={t("matrix.unit")}>
        <label className="flex min-w-60 flex-1 flex-col gap-1">
          <span className="text-sm font-medium">{t("matrix.unit")}</span>
          <NativeSelect name="unit" defaultValue={m.unitId ?? ""}>
            <option value="" disabled>
              {t("form.choose")}
            </option>
            {m.units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.parentName ? `${u.parentName} / ${u.name}` : u.name}
              </option>
            ))}
          </NativeSelect>
        </label>
        <Button type="submit">
          <Filter aria-hidden="true" />
          {t("matrix.show")}
        </Button>
        {m.unitId && (
          <Button variant="outline" nativeButton={false} render={<a href={`/api/reports/competency?unit=${m.unitId}`} download />}>
            <Download aria-hidden="true" />
            {t("matrix.export")}
          </Button>
        )}
      </form>

      <ul aria-label={t("matrix.legend")} className="flex flex-wrap gap-2 text-sm">
        {(["valid", "expiring", "expired"] as const).map((s) => (
          <li key={s} className={`rounded-full px-3 py-1 ${STATE_CLASS[s]}`}>
            {t(`matrix.states.${s}`)}
          </li>
        ))}
        <li className="rounded-full border px-3 py-1">{t("matrix.states.none")}</li>
      </ul>

      {!m.unitId ? (
        <p className="rounded-2xl border border-dashed p-6 text-muted-foreground">{t("matrix.chooseUnit")}</p>
      ) : m.competencies.length === 0 || m.people.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-6 text-muted-foreground">
          {m.competencies.length === 0 ? t("matrix.noCompetencies") : t("matrix.noPeople")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">{t("matrix.title")}</caption>
            <thead>
              <tr>
                <th scope="col" className="sticky left-0 z-10 min-w-48 bg-background p-3 text-start font-medium">
                  {t("matrix.person")}
                </th>
                {m.competencies.map((c) => (
                  <th key={c.id} scope="col" className="min-w-32 p-3 text-start align-bottom font-medium">
                    {c.name}
                    <span className="block text-xs font-normal text-muted-foreground">{t(`form.kinds.${c.kind}`)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {m.people.map((p) => (
                <tr key={p.userId} className="border-t">
                  <th scope="row" className="sticky left-0 z-10 bg-background p-3 text-start font-normal">
                    <span className="block font-medium">{p.fullName}</span>
                    <span className="block text-xs text-muted-foreground">
                      {p.sicilNo}
                      {p.positionName ? ` · ${p.positionName}` : ""}
                    </span>
                  </th>
                  {m.competencies.map((c) => {
                    const cell = p.cells[c.id];
                    const label = cell ? (cell.validUntil ? date(cell.validUntil) : t("matrix.unlimited")) : "—";
                    return (
                      <td key={c.id} className="p-1">
                        <Link
                          href={cellHref(p.userId, c.id)}
                          aria-label={t("matrix.cellLabel", { person: p.fullName, competency: c.name, state: t(`matrix.states.${cell?.state ?? "none"}`) })}
                          className={`flex min-h-12 items-center justify-center rounded-lg px-2 text-center ${cell ? STATE_CLASS[cell.state] : "border border-dashed text-muted-foreground"}`}
                        >
                          {label}
                        </Link>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected?.person && selected.competency && (
        <section id="cell" aria-labelledby="cell-heading" className="flex max-w-2xl flex-col gap-4 rounded-2xl border p-5">
          <h2 id="cell-heading" className="text-lg font-semibold">
            {selected.person.fullName} · {selected.competency.name}
          </h2>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("matrix.noHistory")}</p>
          ) : (
            <ol className="flex flex-col gap-2 text-sm">
              {history.map((h) => (
                <li key={h.id} className="rounded-xl border p-3">
                  <span className="font-medium">{t(`matrix.sources.${h.source}`)}</span> · {date(h.createdAt)}
                  {h.grantedByName && ` · ${h.grantedByName}`}
                  <span className="block text-muted-foreground">{h.validUntil ? t("matrix.validUntil", { date: date(h.validUntil) }) : t("matrix.unlimited")}</span>
                  {h.reason && <span className="block whitespace-pre-line">{h.reason}</span>}
                  {h.revokedAt && (
                    <span className="mt-1 block text-destructive">
                      {t("matrix.revokedOn", { date: date(h.revokedAt) })}: {h.revokeReason}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          )}
          {m.canGrant && selected.person.userId !== user.userId && (
            <GrantPanel
              key={`${cellUser}:${cellComp}:${history.length}`}
              userId={selected.person.userId}
              competencyId={selected.competency.id}
              activeGrantId={selected.person.cells[selected.competency.id]?.grantId ?? null}
            />
          )}
        </section>
      )}
    </section>
  );
}
