import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { adminAccess } from "@/features/admin/guard";
import { InviteeSelector } from "@/features/people/components/invite-batch";
import { Link } from "@/i18n/navigation";
import { listInvitees, recentInvitationBatches, type InviteeFilter } from "@/server/services/invitation-batches";
import { inviteMailEnabled } from "@/server/services/invitations";
import { listUnitOptions } from "@/server/services/org";
import { getSettings } from "@/server/services/settings";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("invite.batch");
  return { title: t("title") };
}

const STATES = ["not_invited", "invite_pending", "invite_expired", "not_activated"] as const;
const UUID = /^[0-9a-f-]{36}$/;

/** Davetler (iş paketi 2.6c, karar #199): etkinleşmemiş personel, seçim ve toplu davet. */
export default function Page({ searchParams }: PageProps<"/[locale]/admin/people/invites">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

async function Content({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const access = await adminAccess("people.manage");
  if (!access) return <NotFoundView />;
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
  const state = STATES.find((s) => s === one(sp.state));
  const importBatchId = UUID.test(one(sp.import) ?? "") ? one(sp.import) : undefined;
  const orgUnitId = UUID.test(one(sp.unit) ?? "") ? one(sp.unit) : undefined;
  const q = one(sp.q)?.slice(0, 100);
  const filter: InviteeFilter = { state, importBatchId, orgUnitId, q };

  const [t, tInvite, tp, format, rows, units, recent, settings] = await Promise.all([
    getTranslations("invite.batch"),
    getTranslations("invite"),
    getTranslations("admin.people"),
    getFormatter(),
    listInvitees(access.actor, filter),
    listUnitOptions(access.actor),
    recentInvitationBatches(access.actor),
    getSettings(["auth.invite_batch_max"]),
  ]);

  // Yalnızca yarım kalmış WhatsApp listeleri: açık WhatsApp daveti olan ve hepsi gönderilmemiş gruplar
  const unfinished = recent.filter((b) => b.whatsapp > 0 && b.open > 0 && b.shared < b.whatsapp).slice(0, 5);

  const items = rows.map((r) => ({
    userId: r.userId,
    sicilNo: r.sicilNo,
    fullName: r.fullName,
    place: r.positionName ? [r.unitName, r.positionName].filter(Boolean).join(" / ") : null,
    hasEmail: r.hasEmail,
    hasPhone: r.hasPhone,
    pending: r.state === "invite_pending",
    stateLabel: tInvite(`status.${r.state}`, {
      channel: r.channel ? tInvite(`channel.${r.channel}`) : "",
      date: r.expiresAt ? format.dateTime(r.expiresAt, { dateStyle: "short", timeStyle: "short" }) : "",
    }),
  }));

  return (
    <section className="flex max-w-6xl flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} back={{ href: "/admin/people", label: tp("title") }} />

      {unfinished.length > 0 && (
        <section aria-labelledby="recent-heading" className="rounded-2xl border p-5">
          <h2 id="recent-heading" className="mb-3 text-lg font-semibold">
            {t("recent")}
          </h2>
          <ul className="flex flex-col divide-y">
            {unfinished.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <span>
                  <span className="block">
                    {t("recentRow", { date: format.dateTime(b.createdAt, { dateStyle: "medium", timeStyle: "short" }), name: b.createdByName, total: b.total })}
                  </span>
                  {b.whatsapp > 0 && (
                    <span className="block text-sm text-muted-foreground">{t("recentWhatsapp", { shared: b.shared, whatsapp: b.whatsapp })}</span>
                  )}
                </span>
                <Button variant="outline" nativeButton={false} render={<Link href={`/admin/people/invites/${b.id}`} />}>
                  {t("open")}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {importBatchId ? (
        <p className="flex flex-wrap items-center gap-3 rounded-2xl border p-4">
          {t("importFilter")}
          <Link href="/admin/people/invites" className="inline-flex min-h-12 items-center underline underline-offset-4">
            {t("clearImport")}
          </Link>
        </p>
      ) : (
        <form method="get" className="flex flex-wrap items-end gap-3" role="search">
          <div className="flex min-w-56 flex-1 flex-col gap-2">
            <label htmlFor="q" className="text-sm font-medium">
              {t("search")}
            </label>
            <Input id="q" name="q" defaultValue={q} />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="state" className="text-sm font-medium">
              {t("filterState")}
            </label>
            <NativeSelect id="state" name="state" defaultValue={state ?? ""} className="w-56">
              <option value="">{t("stateAll")}</option>
              {STATES.map((s) => (
                <option key={s} value={s}>
                  {t(`states.${s}`)}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="unit" className="text-sm font-medium">
              {t("filterUnit")}
            </label>
            <NativeSelect id="unit" name="unit" defaultValue={orgUnitId ?? ""} className="w-64">
              <option value="">{t("unitAll")}</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label}
                </option>
              ))}
            </NativeSelect>
          </div>
          <Button type="submit" variant="outline" size="lg">
            {t("filter")}
          </Button>
        </form>
      )}

      <InviteeSelector items={items} mailEnabled={inviteMailEnabled()} max={settings["auth.invite_batch_max"]} />
    </section>
  );
}
