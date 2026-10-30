"use client";

import { BadgeCheck, Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { Field } from "@/components/forms/field";
import { FormError } from "@/components/forms/form-error";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { grantCompetencyAction, revokeGrantAction } from "../actions";

/** Matristeki seçili hücre: elle verme ya da geri alma (gerekçe zorunlu; karar #219). */
export function GrantPanel({ userId, competencyId, activeGrantId }: { userId: string; competencyId: string; activeGrantId: string | null }) {
  const t = useTranslations("competencies.matrix");
  const tc = useTranslations("common");
  const id = useId();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<{ code: string; details?: unknown } | null>(null);
  const [pending, start] = useTransition();

  function run(kind: "grant" | "revoke") {
    setError(null);
    start(async () => {
      const r = kind === "grant" ? await grantCompetencyAction(userId, competencyId, reason) : await revokeGrantAction(activeGrantId!, reason);
      if (!r.ok) setError({ code: r.error, details: r.details });
      else setReason("");
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <Field id={`${id}-reason`} label={activeGrantId ? t("revokeReason") : t("grantReason")} hint={t("reasonHint")}>
        <Textarea id={`${id}-reason`} rows={2} maxLength={2000} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <FormError error={error?.code} details={error?.details} />
      <div className="flex flex-wrap gap-3">
        <Button type="button" disabled={pending || reason.trim().length < 10} onClick={() => run("grant")}>
          <BadgeCheck aria-hidden="true" />
          {pending ? tc("saving") : activeGrantId ? t("renew") : t("grant")}
        </Button>
        {activeGrantId && (
          <Button type="button" variant="outline" disabled={pending || reason.trim().length < 10} onClick={() => run("revoke")}>
            <Undo2 aria-hidden="true" />
            {t("revoke")}
          </Button>
        )}
      </div>
    </div>
  );
}
