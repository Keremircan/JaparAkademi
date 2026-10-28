"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Field } from "@/components/forms/field";
import { FormError } from "@/components/forms/form-error";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/features/shared/action-result";

/** Gerekçe isteyen tek eylem (ziyaret iptali, kara listeden kaldırma). Önce buton, sonra gerekçe alanı açılır. */
export function ReasonAction({
  id,
  label,
  reasonLabel,
  confirmLabel,
  action,
}: {
  id: string;
  label: string;
  reasonLabel: string;
  confirmLabel: string;
  action: (reason: string) => Promise<ActionResult>;
}) {
  const t = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  if (!open)
    return (
      <Button variant="outline" className="self-start" onClick={() => setOpen(true)}>
        {label}
      </Button>
    );
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-muted/40 p-4">
      <Field id={`${id}-reason`} label={reasonLabel}>
        <Textarea id={`${id}-reason`} rows={2} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <FormError error={error} />
      <div className="flex flex-wrap gap-3">
        <Button
          variant="destructive"
          disabled={pending || reason.trim().length < 3}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const r = await action(reason);
              if (!r.ok) return setError(r.error);
              setOpen(false);
              setReason("");
            })
          }
        >
          {confirmLabel}
        </Button>
        <Button variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
          {t("cancel")}
        </Button>
      </div>
    </div>
  );
}
