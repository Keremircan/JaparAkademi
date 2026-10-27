"use client";

import { Ban } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { FormError } from "@/components/forms/form-error";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { revokeCertificateAction } from "../actions";

/** Sertifika iptali (İK; gerekçe zorunlu, geri alınamaz). */
export function RevokeButton({ id }: { id: string }) {
  const t = useTranslations("certificates.revoke");
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Ban aria-hidden="true" />
        {t("open")}
      </Button>
    );
  }
  return (
    <div className="flex w-full flex-col gap-2 rounded-xl bg-muted/40 p-3">
      <label className="flex flex-col gap-1">
        <span className="font-medium">{t("reason")}</span>
        <Textarea rows={2} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      <p className="text-sm text-muted-foreground">{t("note")}</p>
      <FormError error={error} />
      <div className="flex flex-wrap gap-2">
        <Button
          variant="destructive"
          disabled={pending || reason.trim().length < 3}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const r = await revokeCertificateAction(id, reason);
              if (!r.ok) setError(r.error);
              else setOpen(false);
            })
          }
        >
          <Ban aria-hidden="true" />
          {t("confirm")}
        </Button>
        <Button variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
          {t("cancel")}
        </Button>
      </div>
    </div>
  );
}
