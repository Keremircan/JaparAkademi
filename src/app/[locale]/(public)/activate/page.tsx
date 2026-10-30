import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ActivationCodeForm } from "@/features/auth/components/activate-forms";
import { AuthCard } from "../auth-card";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.activate");
  return { title: t("title"), robots: { index: false, follow: false } };
}

/** Kağıttaki kodla hesap etkinleştirme (iş paketi 2.6b, karar #187). */
export default async function Page() {
  const t = await getTranslations("auth.activate");
  return (
    <AuthCard title={t("title")} languages>
      <ActivationCodeForm />
    </AuthCard>
  );
}
