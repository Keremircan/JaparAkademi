import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { connection } from "next/server";
import { Suspense } from "react";
import { ResetPasswordForm } from "@/features/auth/components/reset-forms";
import { Link } from "@/i18n/navigation";
import { isResetTokenValid } from "@/server/services/password-reset";
import { getSetting } from "@/server/services/settings";
import { AuthCard } from "../../auth-card";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.reset");
  return { title: t("resetTitle"), robots: { index: false, follow: false } };
}

/** E-postadaki bağlantıyla yeni şifre belirleme (tek kullanımlık, süreli). */
export default function Page({ params }: PageProps<"/[locale]/reset-password/[token]">) {
  return (
    <Suspense fallback={null}>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // Bağlantının süresi istek anında kontrol edilir (önceden üretilmez)
  await connection();
  const [t, valid, minLength] = await Promise.all([getTranslations("auth.reset"), isResetTokenValid(token), getSetting("auth.password_min_length")]);
  return (
    <AuthCard title={t("resetTitle")} languages>
      {valid ? (
        <ResetPasswordForm token={token} minLength={minLength} />
      ) : (
        <div className="flex flex-col gap-4">
          <p role="alert">{t("invalid")}</p>
          <Link href="/forgot-password" className="inline-flex min-h-12 items-center underline underline-offset-4">
            {t("again")}
          </Link>
        </div>
      )}
    </AuthCard>
  );
}
