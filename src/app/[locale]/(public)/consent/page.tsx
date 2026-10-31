import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { ConsentForm } from "@/features/legal/components/consent-form";
import { LegalTextBody } from "@/features/legal/components/legal-text-body";
import { redirect } from "@/i18n/navigation";
import { requireUser } from "@/server/auth/current-user";
import { explicitConsentState, pendingConsent, type LegalText } from "@/server/services/legal";
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

/**
 * Aydınlatma metni (onaylanmadan devam edilemez) ve açık rıza metni (ayrı kutu, isteğe bağlı; kararlar #231–232).
 * İkisi de bekliyorsa aynı ekranda, ayrı başlıklarla gösterilir.
 */
async function ConsentSection() {
  const user = await requireUser({ allowPendingConsent: true });
  const [kvkk, explicit] = await Promise.all([pendingConsent(user.userId, user.locale), explicitConsentState(user.userId, user.locale)]);
  const explicitText = explicit.pending ? explicit.text : null;
  if (!kvkk && !explicitText) return redirect({ href: "/", locale: await getLocale() });
  const t = await getTranslations("consent");
  return (
    <div className="flex flex-col gap-6">
      {kvkk && <TextBlock text={kvkk} heading={t("kvkkHeading")} version={t("version", { version: kvkk.version })} />}
      {explicitText && (
        <TextBlock
          text={explicitText}
          heading={t("explicit.heading")}
          intro={t("explicit.intro")}
          version={t("version", { version: explicitText.version })}
        />
      )}
      <ConsentForm kvkkTextId={kvkk?.id ?? null} explicitTextId={explicitText?.id ?? null} />
    </div>
  );
}

function TextBlock({ text, heading, intro, version }: { text: LegalText; heading: string; intro?: string; version: string }) {
  return (
    <section aria-labelledby={`legal-${text.id}`} className="flex flex-col gap-3">
      <div>
        <p className="text-sm font-medium text-muted-foreground">{heading}</p>
        <h2 id={`legal-${text.id}`} lang={text.locale} className="text-lg font-semibold">
          {text.title}
        </h2>
        <p className="text-sm text-muted-foreground">{version}</p>
      </div>
      {intro && <p className="text-sm">{intro}</p>}
      <div lang={text.locale} className="max-h-[40dvh] overflow-y-auto rounded-xl border p-4" tabIndex={0}>
        <LegalTextBody body={text.body} />
      </div>
    </section>
  );
}
