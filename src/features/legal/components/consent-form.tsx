"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { FormError } from "@/components/forms/form-error";
import { Button } from "@/components/ui/button";
import { submitConsentAction } from "../actions";

/**
 * Onay ekranı düğmesi: aydınlatma metni onayı (bekliyorsa, zorunlu) ve açık rıza kararı (bekliyorsa; kutu boş
 * gelir, işaretlemek isteğe bağlıdır — iş paketi 3.4).
 */
export function ConsentForm({ kvkkTextId, explicitTextId }: { kvkkTextId: string | null; explicitTextId: string | null }) {
  const t = useTranslations("consent");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [granted, setGranted] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      {explicitTextId && (
        <label className="flex min-h-12 items-start gap-3 rounded-xl border p-4">
          <input
            type="checkbox"
            name="explicitGranted"
            checked={granted}
            onChange={(e) => setGranted(e.target.checked)}
            className="mt-1 size-5 shrink-0 accent-primary"
          />
          <span>
            <span className="block font-medium">{t("explicit.checkbox")}</span>
            <span className="block text-sm text-muted-foreground">{t("explicit.checkboxHint")}</span>
          </span>
        </label>
      )}
      <FormError error={error} />
      <Button
        size="lg"
        className="w-full"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await submitConsentAction({
              kvkkTextId,
              explicit: explicitTextId ? { legalTextId: explicitTextId, granted } : null,
            });
            if (r && !r.ok) setError(r.error);
          })
        }
      >
        {pending ? t("accepting") : kvkkTextId ? t("accept") : t("continue")}
      </Button>
    </div>
  );
}
