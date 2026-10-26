import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { ActionButton } from "@/components/forms/action-button";
import { adminAccess } from "@/features/admin/guard";
import { revokeDeviceAction } from "@/features/devices/actions";
import { RegisterDevice } from "@/features/devices/components/register-device";
import { listDevices } from "@/server/services/devices";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("devices");
  return { title: t("title") };
}

/** Ortak cihazlar (FG-4.1): kayıtlı tarayıcıda giriş her zaman ortak modda olur. */
export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const access = await adminAccess("devices.manage");
  if (!access) return <NotFoundView />;
  const [t, tNav, format, rows] = await Promise.all([getTranslations("devices"), getTranslations("sections.admin"), getFormatter(), listDevices(access.actor)]);
  const dt = (d: Date) => format.dateTime(d, { dateStyle: "medium", timeStyle: "short" });
  return (
    <section className="flex max-w-4xl flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} back={{ href: "/admin", label: tNav("title") }} />
      <RegisterDevice />
      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-6 text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="divide-y rounded-2xl border">
          {rows.map((d) => (
            <li key={d.id} className="flex min-h-16 flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
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
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
