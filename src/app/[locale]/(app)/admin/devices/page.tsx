import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { ActionButton } from "@/components/forms/action-button";
import { adminAccess } from "@/features/admin/guard";
import { DeleteControl } from "@/features/deletion/components/delete-control";
import { Link } from "@/i18n/navigation";
import { revokeDeviceAction } from "@/features/devices/actions";
import { RegisterDevice } from "@/features/devices/components/register-device";
import { listDevices } from "@/server/services/devices";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("devices");
  return { title: t("title") };
}

/** Ortak cihazlar (FG-4.1): kayıtlı tarayıcıda giriş her zaman ortak modda olur. */
export default function Page({ searchParams }: PageProps<"/[locale]/admin/devices">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

async function Content({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const access = await adminAccess("devices.manage");
  if (!access) return <NotFoundView />;
  // İptal edilen cihazlar istenmedikçe gizlenir (iş paketi 3.14)
  const showRevoked = (await searchParams).revoked === "1";
  const [t, tNav, format, all] = await Promise.all([getTranslations("devices"), getTranslations("sections.admin"), getFormatter(), listDevices(access.actor)]);
  const revokedCount = all.filter((d) => d.revokedAt).length;
  const rows = showRevoked ? all : all.filter((d) => !d.revokedAt);
  const dt = (d: Date) => format.dateTime(d, { dateStyle: "medium", timeStyle: "short" });
  return (
    <section className="flex max-w-4xl flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} back={{ href: "/admin", label: tNav("title") }} />
      <RegisterDevice />
      {revokedCount > 0 && (
        <Link href={showRevoked ? "/admin/devices" : "/admin/devices?revoked=1"} className="inline-flex min-h-12 items-center self-end underline underline-offset-4">
          {showRevoked ? t("hideRevoked") : t("showRevoked", { count: revokedCount })}
        </Link>
      )}
      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed p-5 text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="divide-y rounded-xl border">
          {rows.map((d) => (
            <li key={d.id} className="flex min-h-16 flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
              <span className="min-w-48 flex-1">
                <span className="block font-medium">{d.name}</span>
                <span className="block text-sm text-muted-foreground">
                  {t("registeredBy", { name: d.registeredByName, date: dt(d.createdAt) })}
                  {d.lastSeenAt && ` · ${t("lastSeen", { date: dt(d.lastSeenAt) })}`}
                </span>
              </span>
              {d.revokedAt ? (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{t("revoked")}</span>
              ) : (
                <ActionButton variant="destructive" confirmText={t("revokeConfirm")} action={revokeDeviceAction.bind(null, d.id)}>
                  {t("revoke")}
                </ActionButton>
              )}
              <DeleteControl
                kind="device"
                id={d.id}
                subject="device"
                name={d.name}
                archive={d.revokedAt ? undefined : { action: revokeDeviceAction.bind(null, d.id), label: t("revoke") }}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
