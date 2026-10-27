"use client";

import { PenLine, Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { FormError } from "@/components/forms/form-error";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { returnPracticalExamAction, secondSignPracticalExamAction } from "../actions";
import { SignaturePad } from "./signature-pad";

/** Bölüm sorumlusu 2. imzası ya da gerekçeli geri gönderme (karar #71). */
export function SecondSign({ id, managerName }: { id: string; managerName: string }) {
  const t = useTranslations("practice.second");
  const [sig, setSig] = useState<string | null>(null);
  const [returning, setReturning] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) setError(r.error ?? "unexpected");
    });

  return (
    <section aria-labelledby="second-heading" className="flex max-w-3xl flex-col gap-4 rounded-2xl border p-5">
      <h2 id="second-heading" className="text-lg font-semibold">
        {t("title")}
      </h2>
      <p className="text-sm text-muted-foreground">{t("intro")}</p>
      {returning ? (
        <label className="flex flex-col gap-1">
          <span className="font-medium">{t("reason")}</span>
          <Textarea rows={3} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
      ) : (
        <SignaturePad label={t("signature", { name: managerName })} onChange={setSig} />
      )}
      <FormError error={error} />
      <div className="flex flex-wrap gap-3">
        {returning ? (
          <>
            <Button size="lg" variant="destructive" disabled={pending || reason.trim().length < 3} onClick={() => run(() => returnPracticalExamAction(id, reason))}>
              <Undo2 aria-hidden="true" />
              {t("confirmReturn")}
            </Button>
            <Button size="lg" variant="ghost" disabled={pending} onClick={() => setReturning(false)}>
              {t("cancel")}
            </Button>
          </>
        ) : (
          <>
            <Button size="lg" disabled={pending || !sig} onClick={() => run(() => secondSignPracticalExamAction(id, sig!))}>
              <PenLine aria-hidden="true" />
              {t("sign")}
            </Button>
            <Button size="lg" variant="outline" disabled={pending} onClick={() => setReturning(true)}>
              <Undo2 aria-hidden="true" />
              {t("return")}
            </Button>
          </>
        )}
      </div>
    </section>
  );
}
