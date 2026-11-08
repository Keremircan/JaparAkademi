"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { FormError } from "@/components/forms/form-error";
import { Button } from "@/components/ui/button";
import { submitConsentAction } from "../actions";

/**
 * Onay ekranı düğmesi: aydınlatma metni onayı (bekliyorsa, zorunlu) ve açık rıza kararı (bekliyorsa). Açık rıza
 * "veriyorum / vermiyorum" seçimiyle alınır; hiçbiri önceden seçili değildir ve seçim yapılmadan devam edilmez
 * (karar #281, KVKK Kurulu ilke kararı 2026/347). "Vermiyorum" sistemi kullanmayı etkilemez.
 */
export function ConsentForm({ kvkkTextId, explicitTextId }: { kvkkTextId: string | null; explicitTextId: string | null }) {
  const t = useTranslations("consent");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [granted, setGranted] = useState<boolean | null>(null);
  return (
    <div className="flex flex-col gap-4">
      {explicitTextId && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 font-medium">{t("explicit.choiceLabel")}</legend>
          {([true, false] as const).map((value) => (
            <label
              key={String(value)}
              className="flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border-2 p-3 has-checked:border-primary has-checked:bg-primary/5"
            >
              <input
                type="radio"
                name="explicitDecision"
                className="mt-1 size-5 shrink-0 accent-primary"
                checked={granted === value}
                onChange={() => {
                  setGranted(value);
                  if (error === "explicit_choice_required") setError(null);
                }}
              />
              <span>
                <span className="block font-medium">{value ? t("explicit.give") : t("explicit.refuse")}</span>
                <span className="block text-sm text-muted-foreground">{value ? t("explicit.giveHint") : t("explicit.refuseHint")}</span>
              </span>
            </label>
          ))}
        </fieldset>
      )}
      <FormError error={error} />
      <Button
        size="lg"
        className="w-full"
        disabled={pending}
        onClick={() => {
          if (explicitTextId && granted === null) {
            setError("explicit_choice_required");
            return;
          }
          startTransition(async () => {
            const r = await submitConsentAction({
              kvkkTextId,
              explicit: explicitTextId && granted !== null ? { legalTextId: explicitTextId, granted } : null,
            });
            if (r && !r.ok) setError(r.error);
          });
        }}
      >
        {pending ? t("accepting") : kvkkTextId ? t("accept") : t("continue")}
      </Button>
    </div>
  );
}
