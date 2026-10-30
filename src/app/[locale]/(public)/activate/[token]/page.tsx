import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { connection } from "next/server";
import { Suspense } from "react";
import { ActivatePasswordForm } from "@/features/auth/components/activate-forms";
import { Link } from "@/i18n/navigation";
import { invitationForToken } from "@/server/services/invitations";
import { getSetting } from "@/server/services/settings";
import { AuthCard } from "../../auth-card";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.activate");
  return { title: t("title"), robots: { index: false, follow: false } };
}

/** Davet bağlantısıyla (e-posta, WhatsApp, QR) hesap etkinleştirme (karar #187). */
export default function Page({ params }: PageProps<"/[locale]/activate/[token]">) {
  return (
    <Suspense fallback={null}>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // Davetin geçerliliği istek anında kontrol edilir (önceden üretilmez)
  await connection();
  const [t, invite, minLength] = await Promise.all([
    getTranslations("auth.activate"),
    invitationForToken(token),
    getSetting("auth.password_min_length"),
  ]);
  if (!invite) {
    return (
      <AuthCard title={t("title")} languages>
        <div className="flex flex-col gap-4">
          <p role="alert">{t("invalid")}</p>
          <Link href="/login" className="inline-flex min-h-12 items-center underline underline-offset-4">
            {t("toLogin")}
          </Link>
        </div>
      </AuthCard>
    );
  }
  return (
    <AuthCard title={t("welcome", { name: invite.fullName })} languages>
      <p className="mb-5">{t("setIntro", { sicil: invite.sicilNo })}</p>
      <ActivatePasswordForm token={token} minLength={minLength} />
    </AuthCard>
  );
}
