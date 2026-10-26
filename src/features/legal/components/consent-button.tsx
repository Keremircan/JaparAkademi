"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { FormError } from "@/components/forms/form-error";
import { Button } from "@/components/ui/button";
import { acceptConsentAction } from "../actions";

export function ConsentButton({ legalTextId }: { legalTextId: string }) {
  const t = useTranslations("consent");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <FormError error={error} />
      <Button
        size="lg"
        className="w-full"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await acceptConsentAction(legalTextId);
            if (r && !r.ok) setError(r.error);
          })
        }
      >
        {pending ? t("accepting") : t("accept")}
      </Button>
    </div>
  );
}
