import { ShieldCheck } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { ActionButton } from "@/components/forms/action-button";
import { LegalTextBody } from "@/features/legal/components/legal-text-body";
import type { ExplicitConsentState } from "@/server/services/legal";
import { decideConsentAction } from "../actions";

/**
 * Profil fotoğrafı alanındaki açık rıza (iş paketi 3.8, karar #248): rıza yoksa açıklama, metin ve "Açık rıza ver";
 * verildiyse durum ve "geri al". Yayınlanmış açık rıza metni yoksa fotoğrafın metin yayınlanınca ekleneceği söylenir.
 */
export async function PhotoConsent({ consent }: { consent: ExplicitConsentState }) {
  const [t, format] = await Promise.all([getTranslations("profile.consent"), getFormatter()]);
  const { text } = consent;
  return (
    <section aria-labelledby="photo-consent-title" className="mt-4 flex flex-col gap-3 border-t pt-4">
      <h2 id="photo-consent-title" className="flex items-center gap-2 text-base font-semibold">
        <ShieldCheck aria-hidden="true" className="size-5" />
        {t("title")}
      </h2>
      <p role="status" className="text-sm">
        {!text
          ? t("unavailable")
          : consent.granted
            ? t("granted", { date: format.dateTime(consent.decidedAt!, { dateStyle: "medium", timeStyle: "short" }) })
            : t("needed")}
      </p>
      {text && (
        <>
          <details className="rounded-xl border p-3">
            <summary className="flex min-h-12 cursor-pointer items-center font-medium">{t("read", { title: text.title })}</summary>
            <div lang={text.locale} className="mt-3 max-h-[40dvh] overflow-y-auto" tabIndex={0}>
              <LegalTextBody body={text.body} />
            </div>
          </details>
          <div className="self-start">
            {consent.granted ? (
              <ActionButton action={decideConsentAction.bind(null, text.id, false)} confirmText={t("withdrawConfirm")}>
                {t("withdraw")}
              </ActionButton>
            ) : (
              <ActionButton action={decideConsentAction.bind(null, text.id, true)} variant="default">
                {t("grant")}
              </ActionButton>
            )}
          </div>
        </>
      )}
    </section>
  );
}
