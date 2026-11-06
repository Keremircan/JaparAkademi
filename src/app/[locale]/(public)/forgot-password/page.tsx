import { MailX } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { connection } from "next/server";
import { Suspense } from "react";
import { ForgotPasswordForm } from "@/features/auth/components/reset-forms";
import { Link } from "@/i18n/navigation";
import { mailEnabled } from "@/server/mail";
import { AuthCard } from "../auth-card";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.reset");
  return { title: t("forgotTitle") };
}

/**
 * Şifremi unuttum (SPEC 11.4): e-postası kayıtlı kişiye tek kullanımlık bağlantı gönderilir. E-posta gönderimi
 * kapalıyken form gösterilmez; kişi İK'ya yönlendirilir (iş paketi 3.7).
 */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  // Gönderim durumu istek anında okunur (önceden üretilmez)
  await connection();
  const t = await getTranslations("auth.reset");
  if (!mailEnabled()) {
    return (
      <AuthCard title={t("forgotTitle")} languages>
        <div className="flex flex-col gap-4">
          <p role="status" className="flex items-start gap-3">
            <MailX aria-hidden="true" className="mt-0.5 size-6 shrink-0 text-muted-foreground" />
            {t("mailOff")}
          </p>
          <Link href="/login" className="inline-flex min-h-12 items-center underline underline-offset-4">
            {t("backToLogin")}
          </Link>
        </div>
      </AuthCard>
    );
  }
  return (
    <AuthCard title={t("forgotTitle")} intro={t("forgotIntro")} languages>
      <ForgotPasswordForm />
    </AuthCard>
  );
}
