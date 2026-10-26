"use client";

import { Play } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { FormError } from "@/components/forms/form-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { startExamAction } from "../actions";

/** Sınavı başlatma (gözetmen kodu gerekiyorsa kod alanıyla). */
export function ExamStart({ assignmentModuleId, proctorRequired, resume }: { assignmentModuleId: string; proctorRequired: boolean; resume: boolean }) {
  const t = useTranslations("exams.start");
  const [code, setCode] = useState("");
  const [error, setError] = useState<{ code: string; details?: unknown } | null>(null);
  const [pending, startTransition] = useTransition();
  const needCode = proctorRequired && !resume;
  return (
    <div className="flex flex-col gap-3">
      {needCode && (
        <label className="flex max-w-xs flex-col gap-1">
          <span className="font-medium">{t("code")}</span>
          <Input
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={7}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, ""))}
            className="font-mono text-2xl tracking-widest"
            aria-describedby="code-hint"
          />
          <span id="code-hint" className="text-sm text-muted-foreground">
            {t("codeHint")}
          </span>
        </label>
      )}
      <FormError error={error?.code} details={error?.details} />
      <Button
        size="lg"
        className="self-start"
        disabled={pending || (needCode && code.replace(/\s/g, "").length !== 6)}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const r = await startExamAction(assignmentModuleId, needCode ? code.replace(/\s/g, "") : null);
            if (r && !r.ok) setError({ code: r.error, details: r.details });
          })
        }
      >
        <Play aria-hidden="true" />
        {resume ? t("resume") : t("start")}
      </Button>
    </div>
  );
}
