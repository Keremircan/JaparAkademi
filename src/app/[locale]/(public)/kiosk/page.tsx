import { CircleAlert } from "lucide-react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { locale as rootLocale } from "next/root-params";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { KioskHome } from "@/features/visitor-flow/components/kiosk-home";
import { RegisterForm } from "@/features/visitor-flow/components/register-form";
import { VisitorFrame } from "@/features/visitor-flow/components/visitor-frame";
import { DEVICE_COOKIE, recognizeKiosk } from "@/server/services/devices";
import { getSettings } from "@/server/services/settings";
import { publicCompanyOptions } from "@/server/services/visitors";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("visitorFlow.kiosk");
  return { title: t("title"), robots: { index: false, follow: false } };
}

/** Kapı tableti (SPEC 8.3 kiosk modu, karar #146): yalnızca kiosk olarak kayıtlı cihazda açılır. */
export default function Page({ searchParams }: PageProps<"/[locale]/kiosk">) {
  return (
    <Suspense fallback={null}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

async function Content({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const device = await recognizeKiosk((await cookies()).get(DEVICE_COOKIE)?.value);
  const [t, tr, locale] = await Promise.all([getTranslations("visitorFlow.kiosk"), getTranslations("visitorFlow.register"), rootLocale()]);
  if (!device) {
    return (
      <VisitorFrame title={t("title")} path="/kiosk" locale={locale} allowLanguage={false}>
        <p role="alert" className="flex items-center gap-3 text-lg">
          <CircleAlert aria-hidden="true" className="size-7 shrink-0 text-destructive" />
          {t("notKiosk")}
        </p>
      </VisitorFrame>
    );
  }
  if (sp.register === "1") {
    const [s, companies] = await Promise.all([getSettings(["visitor.types"]), publicCompanyOptions()]);
    const types = (["office", "site", "contractor"] as const).filter((k) => s["visitor.types"][k].enabled);
    return (
      <VisitorFrame title={tr("title")} path="/kiosk?register=1" locale={locale}>
        <p className="text-lg">{tr("intro")}</p>
        <RegisterForm types={types} companies={companies} viaKiosk />
      </VisitorFrame>
    );
  }
  return (
    <VisitorFrame title={t("title")} path="/kiosk" locale={locale}>
      <KioskHome />
    </VisitorFrame>
  );
}
