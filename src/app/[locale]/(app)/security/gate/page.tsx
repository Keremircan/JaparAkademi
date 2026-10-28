import { Search, ShieldAlert } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GateActions } from "@/features/visitors/components/gate-actions";
import { securityAccess } from "@/features/visitors/guard";
import { Link } from "@/i18n/navigation";
import { can } from "@/server/authz/policy";
import { getSetting } from "@/server/services/settings";
import { gateList } from "@/server/services/visitors";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("visitors.cards.gate");
  return { title: t("title") };
}

/** Kapı (SPEC 8.2/6–8, karar #147): bugünün ziyaretleri ve içeridekiler; giriş/çıkışı yalnızca güvenlik yapar. */
export default function Page({ searchParams }: PageProps<"/[locale]/security/gate">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

async function Content({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const access = await securityAccess("visits.view_all");
  if (!access) return <NotFoundView />;
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 100) : undefined;
  const [t, tv, tNav, format, rows, ppeItems] = await Promise.all([
    getTranslations("visitors.gate"),
    getTranslations("visitors"),
    getTranslations("sections.security"),
    getFormatter(),
    gateList(access.actor, q),
    getSetting("visitor.ppe_items"),
  ]);
  const operate = can(access.actor, "visits.manage_all");
  const inside = rows.filter((r) => r.status === "checked_in");
  const waiting = rows.filter((r) => r.status !== "checked_in");
  const time = (d: Date) => format.dateTime(d, { dateStyle: "short", timeStyle: "short" });
  const date = (d: string) => format.dateTime(new Date(`${d}T12:00:00`), { dateStyle: "medium" });

  const Row = ({ r }: { r: (typeof rows)[number] }) => (
    <li className="flex flex-col gap-3 rounded-2xl border p-4">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-1">
        <span className="font-mono text-lg font-semibold tracking-widest">{r.code}</span>
        <span className="min-w-48 flex-1">
          <Link href={`/security/visits/${r.id}`} className="flex items-center gap-2 font-medium underline-offset-4 hover:underline">
            {r.blacklisted && <ShieldAlert aria-hidden="true" className="size-5 text-destructive" />}
            {r.fullName}
          </Link>
          <span className="block text-sm text-muted-foreground">
            {tv(`types.${r.visitorType}`)}
            {r.companyName && ` · ${r.companyName}`}
            {` · ${r.hostUserId ? tv("list.host", { name: r.hostName }) : tv("detail.hostWritten", { name: r.hostName })}`}
            {r.nationalIdMasked && ` · ${r.nationalIdMasked}`}
          </span>
          <span className="mt-1 flex flex-wrap gap-2 text-xs">
            {r.blacklisted && <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-destructive">{tv("blacklisted")}</span>}
            {r.status === "checked_in" && r.checkedInAt && (
              <span className="rounded-full bg-emerald-600/10 px-2 py-0.5 text-emerald-700 dark:text-emerald-400">
                {t("since", { time: time(r.checkedInAt) })} · {t("badge", { badge: r.badgeNo ?? "" })}
              </span>
            )}
            {r.status === "planned" && <span className="rounded-full bg-muted px-2 py-0.5">{t("notBriefed")}</span>}
            {r.status === "briefed" && <span className="rounded-full bg-muted px-2 py-0.5">{tv("status.briefed")}</span>}
            {!r.hasId && r.status !== "checked_in" && <span className="rounded-full bg-muted px-2 py-0.5">{t("noId")}</span>}
            {r.clearanceUntil && <span className="rounded-full bg-muted px-2 py-0.5">{t("clearance", { date: date(r.clearanceUntil) })}</span>}
          </span>
        </span>
      </div>
      {operate && (r.canCheckIn || r.canCheckOut) && (
        <GateActions
          visitId={r.id}
          mode={r.canCheckIn ? "in" : "out"}
          needsId={!r.hasId}
          needsHost={!r.hostUserId}
          hostWritten={r.hostName}
          ppeItems={ppeItems}
        />
      )}
    </li>
  );

  return (
    <section className="flex max-w-4xl flex-col gap-6">
      <PageHeader title={tv("cards.gate.title")} description={tv("cards.gate.description")} back={{ href: "/security", label: tNav("title") }} />
      <form method="get" className="flex flex-wrap items-end gap-3">
        <Input name="q" defaultValue={q} placeholder={t("search")} aria-label={t("search")} className="max-w-72" />
        <Button type="submit" variant="outline">
          <Search aria-hidden="true" />
          {t("searchButton")}
        </Button>
      </form>
      {inside.length > 0 && (
        <section aria-labelledby="gate-inside" className="flex flex-col gap-3">
          <h2 id="gate-inside" className="text-xl font-semibold">
            {t("inside")} ({inside.length})
          </h2>
          <ul className="flex flex-col gap-3">
            {inside.map((r) => (
              <Row key={r.id} r={r} />
            ))}
          </ul>
        </section>
      )}
      {waiting.length === 0 && inside.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-6 text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {waiting.map((r) => (
            <Row key={r.id} r={r} />
          ))}
        </ul>
      )}
    </section>
  );
}
