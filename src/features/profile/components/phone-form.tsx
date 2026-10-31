"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { FormError } from "@/components/forms/form-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/features/shared/action-result";
import { updatePhoneAction } from "../actions";

/** Kişi kendi telefonunu değiştirir (iş paketi 3.4, karar #234). */
export function PhoneForm({ phone }: { phone: string | null }) {
  const t = useTranslations("profile.contact");
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(updatePhoneAction, null);
  return (
    <form action={action} className="mt-2 flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Input
          key={phone ?? ""}
          id="phone"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          defaultValue={phone ?? ""}
          aria-label={t("phone")}
          aria-describedby="phone-hint"
          className="min-w-48 flex-1"
        />
        <Button type="submit" size="lg" variant="outline" disabled={pending}>
          <Check aria-hidden="true" />
          {t("save")}
        </Button>
      </div>
      <p id="phone-hint" className="text-sm text-muted-foreground">
        {t("phoneHint")}
      </p>
      {state?.ok && (
        <p role="status" className="text-sm">
          {t("saved")}
        </p>
      )}
      <FormError error={state && !state.ok ? state.error : null} />
    </form>
  );
}
