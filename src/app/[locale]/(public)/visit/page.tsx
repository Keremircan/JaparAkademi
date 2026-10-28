import type { Metadata } from "next";
import { connection } from "next/server";
import { locale as rootLocale } from "next/root-params";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { RegisterForm } from "@/features/visitor-flow/components/register-form";
import { VisitorFrame } from "@/features/visitor-flow/components/visitor-frame";
import { getSettings } from "@/server/services/settings";
import { publicCompanyOptions } from "@/server/services/visitors";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("visitorFlow.register");
  return { title: t("title"), robots: { index: false, follow: false } };
}

/** Kapıdaki QR ile kendi kaydı (karar #140): ziyaretçinin kendi telefonu; IP başına hız sınırı serviste. */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  // Prerender env/DB'ye dokunmasın diye önce istek verisi okunur
  await connection();
  const [t, locale, s, companies] = await Promise.all([getTranslations("visitorFlow.register"), rootLocale(), getSettings(["visitor.types"]), publicCompanyOptions()]);
  const types = (["office", "site", "contractor"] as const).filter((k) => s["visitor.types"][k].enabled);
  return (
    <VisitorFrame title={t("title")} path="/visit" locale={locale}>
      <p className="text-lg">{t("intro")}</p>
      <RegisterForm types={types} companies={companies} viaKiosk={false} />
    </VisitorFrame>
  );
}
