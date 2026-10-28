import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NotFoundView } from "@/components/app-shell/not-found-view";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { adminAccess } from "@/features/admin/guard";
import { SettingEditor } from "@/features/settings/components/setting-editor";
import { listSettingsFor, SETTING_GROUPS, type SettingRow } from "@/server/services/settings";
import { NOTIFICATION_KINDS } from "@/server/state/notifications";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings");
  return { title: t("title") };
}

/** Parametreler (SPEC Bölüm 14, iş paketi 2.1): kişi yalnızca yönettiği parametreleri görür. */
export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content />
    </Suspense>
  );
}

/** Mesaj anahtarı: noktalar iç içe anahtar sayılmasın diye alt çizgiye çevrilir. */
const msgKey = (key: string) => key.replace(/\./g, "_");

async function Content() {
  const access = await adminAccess("settings.view");
  if (!access) return <NotFoundView />;
  const [t, tNav, tKinds, tTypes, format, rows] = await Promise.all([
    getTranslations("settings"),
    getTranslations("sections.admin"),
    getTranslations("notifications.email.kinds"),
    getTranslations("visitors.types"),
    getFormatter(),
    listSettingsFor(access.actor),
  ]);
  // Anahtarlar katalogdan gelir; her biri messages/tr.json'da tanımlıdır (birim testi denetler)
  type K = Parameters<typeof t>[0];
  type KK = Parameters<typeof tKinds>[0];

  const display = (row: SettingRow, value: unknown): string => {
    const unit = (n: number) => t(`items.${msgKey(row.key)}.unit` as K, { n });
    switch (row.input.kind) {
      case "boolean":
        return value ? t("yes") : t("no");
      case "hazardClass":
        return value ? t(`hazard.${value as string}` as K) : t("hazard.unset");
      case "perHazardClass": {
        const v = value as Record<"low" | "medium" | "high", number>;
        return (["low", "medium", "high"] as const).map((c) => `${t(`hazard.${c}`)}: ${unit(v[c])}`).join(" · ");
      }
      case "visitorTypes": {
        const v = value as Record<"office" | "site" | "contractor", { enabled: boolean; questionCount: number; passScore: number; validityYears: number }>;
        return (["office", "site", "contractor"] as const)
          .map((k) =>
            v[k].enabled
              ? t("visitorTypes.summary", {
                  type: tTypes(k),
                  questions: v[k].questionCount,
                  score: v[k].passScore,
                  validity: v[k].validityYears === 0 ? t("visitorTypes.visitDay") : t("visitorTypes.years", { n: v[k].validityYears }),
                })
              : t("visitorTypes.off", { type: tTypes(k) }),
          )
          .join(" · ");
      }
      case "events": {
        const v = value as string[];
        return v.length === 0 ? t("events.none") : v.map((k) => tKinds(k as KK)).join(", ");
      }
      case "readonly":
        return String(value);
      default:
        return unit(value as number);
    }
  };

  return (
    <section className="flex max-w-4xl flex-col gap-8">
      <PageHeader title={t("title")} description={t("description")} back={{ href: "/admin", label: tNav("title") }} />
      {SETTING_GROUPS.map((group) => {
        const items = rows.filter((r) => r.group === group);
        if (items.length === 0) return null;
        return (
          <section key={group} aria-labelledby={`group-${group}`} className="flex flex-col gap-3">
            <h2 id={`group-${group}`} className="text-xl font-semibold">
              {t(`groups.${group}`)}
            </h2>
            {group === "retention" && <p className="text-sm text-muted-foreground">{t("retentionHint")}</p>}
            <ul className="flex flex-col gap-3">
              {items.map((row) => (
                <li key={row.key} data-setting={row.key} className="flex flex-col gap-3 rounded-2xl border p-5">
                  <div>
                    <h3 className="text-lg font-medium">{t(`items.${msgKey(row.key)}.label` as K)}</h3>
                    <p className="text-sm text-muted-foreground">{t(`items.${msgKey(row.key)}.hint` as K)}</p>
                  </div>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                    <dt className="text-muted-foreground">{t("current")}</dt>
                    <dd className="font-medium" data-testid="setting-value">
                      {display(row, row.value)}
                    </dd>
                    {!row.isDefault && (
                      <>
                        <dt className="text-muted-foreground">{t("default")}</dt>
                        <dd>{display(row, row.defaultValue)}</dd>
                      </>
                    )}
                    {row.updatedAt && (
                      <>
                        <dt className="text-muted-foreground">{t("lastChange")}</dt>
                        <dd>
                          {t("changedBy", {
                            name: row.updatedByName ?? t("system"),
                            date: format.dateTime(row.updatedAt, { dateStyle: "medium", timeStyle: "short" }),
                          })}
                          {row.changeNote && <span className="block text-muted-foreground">{row.changeNote}</span>}
                        </dd>
                      </>
                    )}
                  </dl>
                  <SettingEditor
                    key={`${row.key}:${row.updatedAt?.getTime() ?? 0}`}
                    settingKey={row.key}
                    input={row.input}
                    value={row.value}
                    isDefault={row.isDefault}
                    requireNote={row.requireNote}
                    eventKinds={NOTIFICATION_KINDS}
                  />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </section>
  );
}
