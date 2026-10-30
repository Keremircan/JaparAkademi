import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { ConsentButton } from "@/features/legal/components/consent-button";
import { LegalTextBody } from "@/features/legal/components/legal-text-body";
import { redirect } from "@/i18n/navigation";
import { requireUser } from "@/server/auth/current-user";
import { pendingConsent } from "@/server/services/legal";
import { AuthCard } from "../auth-card";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("consent");
  return { title: t("title") };
}

export default async function ConsentPage() {
  const t = await getTranslations();
  return (
    <AuthCard title={t("consent.title")} intro={t("consent.intro")}>
      <Suspense fallback={<p className="text-muted-foreground">{t("common.loading")}</p>}>
        <ConsentSection />
      </Suspense>
    </AuthCard>
  );
}

async function ConsentSection() {
  const user = await requireUser({ allowPendingConsent: true });
  const text = await pendingConsent(user.userId, user.locale);
  if (!text) return redirect({ href: "/", locale: await getLocale() });
  const t = await getTranslations("consent");
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 lang={text.locale} className="text-lg font-semibold">
          {text.title}
        </h2>
        <p className="text-sm text-muted-foreground">{t("version", { version: text.version })}</p>
      </div>
      <div lang={text.locale} className="max-h-[50dvh] overflow-y-auto rounded-xl border p-4" tabIndex={0}>
        <LegalTextBody body={text.body} />
      </div>
      <ConsentButton legalTextId={text.id} />
    </div>
  );
}
