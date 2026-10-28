import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { liftBlacklistAction } from "@/features/visitors/actions";
import { BlacklistForm } from "@/features/visitors/components/blacklist-form";
import { ReasonAction } from "@/features/visitors/components/reason-action";
import { securityAccess } from "@/features/visitors/guard";
import { todayIn } from "@/lib/dates";
import { getSetting } from "@/server/services/settings";
import { listBlacklist } from "@/server/services/visitors";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("visitors.cards.blacklist");
  return { title: t("title") };
}

/** Kara liste (FG-8.4): yalnızca İSG uzmanı ve güvenlik; kayıtlar değiştirilemez, kaldırma gerekçeli. */
export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const access = await securityAccess("blacklist.manage");
  if (!access) return <NotFoundView />;
  const [t, tNav, format, rows, tz] = await Promise.all([
    getTranslations("visitors"),
    getTranslations("sections.security"),
    getFormatter(),
    listBlacklist(access.actor),
    getSetting("org.timezone"),
  ]);
  const dt = (d: Date) => format.dateTime(d, { dateStyle: "medium" });
  return (
    <section className="flex max-w-4xl flex-col gap-8">
      <PageHeader title={t("cards.blacklist.title")} description={t("cards.blacklist.description")} back={{ href: "/security", label: tNav("title") }} />
      <BlacklistForm minDate={todayIn(tz)} />
      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-6 text-muted-foreground">{t("blacklist.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-col gap-2 rounded-2xl border p-5">
              <div className="flex flex-wrap items-center gap-3">
                <span className="flex-1 font-medium">
                  {r.fullName}
                  {r.nationalIdMasked && <span className="ml-2 text-sm text-muted-foreground">{r.nationalIdMasked}</span>}
                </span>
                <span className={r.active ? "rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive" : "rounded-full bg-muted px-2 py-0.5 text-xs"}>
                  {r.active ? t("blacklist.active") : r.liftedAt ? t("blacklist.lifted") : t("blacklist.expired")}
                </span>
              </div>
              <p>{r.reason}</p>
              <p className="text-sm text-muted-foreground">
                {t("blacklist.addedBy", { name: r.createdByName, date: dt(r.createdAt) })}
                {r.endsAt && ` · ${t("blacklist.until", { date: format.dateTime(new Date(`${r.endsAt}T12:00:00`), { dateStyle: "medium" }) })}`}
              </p>
              {r.liftedAt && (
                <p className="text-sm text-muted-foreground">
                  {t("blacklist.liftedBy", { name: r.liftedByName ?? "", date: dt(r.liftedAt) })}: {r.liftedReason}
                </p>
              )}
              {!r.liftedAt && (
                <ReasonAction
                  id={`lift-${r.id}`}
                  label={t("blacklist.lift")}
                  reasonLabel={t("blacklist.liftReason")}
                  confirmLabel={t("blacklist.liftConfirm")}
                  action={liftBlacklistAction.bind(null, r.id)}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
