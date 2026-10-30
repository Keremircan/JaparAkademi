import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ForgotPasswordForm } from "@/features/auth/components/reset-forms";
import { AuthCard } from "../auth-card";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.reset");
  return { title: t("forgotTitle") };
}

/** Şifremi unuttum (SPEC 11.4): e-postası kayıtlı kişiye tek kullanımlık bağlantı gönderilir. */
export default async function Page() {
  const t = await getTranslations("auth.reset");
  return (
    <AuthCard title={t("forgotTitle")} intro={t("forgotIntro")} languages>
      <ForgotPasswordForm />
    </AuthCard>
  );
}
