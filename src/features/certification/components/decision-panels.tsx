"use client";

import { Check, Gavel, Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { FormError } from "@/components/forms/form-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { approveReadinessAction, decideProcessAction, rejectReadinessAction } from "../actions";

type Option = { id: string; title: string };

function ModuleChecks({ options, value, onChange, legend }: { options: Option[]; value: string[]; onChange: (v: string[]) => void; legend: string }) {
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="mb-1 font-medium">{legend}</legend>
      {options.map((o) => (
        <label key={o.id} className="flex min-h-12 items-center gap-3 rounded-lg px-2 hover:bg-muted">
          <input
            type="checkbox"
            className="size-5 accent-primary"
            checked={value.includes(o.id)}
            onChange={(e) => onChange(e.target.checked ? [...value, o.id] : value.filter((x) => x !== o.id))}
          />
          {o.title}
        </label>
      ))}
    </fieldset>
  );
}

/** İşe başlama onayı / ret (FG-7.1, karar #75). */
export function ReadinessPanel({ assignmentId, reopenable }: { assignmentId: string; reopenable: Option[] }) {
  const t = useTranslations("readiness.panel");
  const [mode, setMode] = useState<"approve" | "reject">("approve");
  const [comment, setComment] = useState("");
  const [modules, setModules] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string } | undefined>) =>
    startTransition(async () => {
      setError(null);
      const r = await fn();
      if (r && !r.ok) setError(r.error ?? "unexpected");
    });

  return (
    <section aria-labelledby="readiness-heading" className="flex flex-col gap-4 rounded-2xl border-2 border-primary p-5">
      <h2 id="readiness-heading" className="text-lg font-semibold">
        {t("title")}
      </h2>
      <div role="radiogroup" aria-label={t("title")} className="grid grid-cols-2 gap-2">
        {(["approve", "reject"] as const).map((m) => (
          <label key={m} className="flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 px-3 font-medium has-checked:border-primary has-checked:bg-primary/10">
            <input type="radio" className="sr-only" name="readiness-mode" checked={mode === m} onChange={() => setMode(m)} />
            {m === "approve" ? <Check aria-hidden="true" /> : <Undo2 aria-hidden="true" />}
            {t(m)}
          </label>
        ))}
      </div>
      {mode === "reject" && <ModuleChecks legend={t("reopen")} options={reopenable} value={modules} onChange={setModules} />}
      <label className="flex flex-col gap-1">
        <span className="font-medium">{mode === "approve" ? t("commentOptional") : t("reason")}</span>
        <Textarea rows={3} maxLength={2000} value={comment} onChange={(e) => setComment(e.target.value)} />
      </label>
      <p className="text-sm text-muted-foreground">{mode === "approve" ? t("approveNote") : t("rejectNote")}</p>
      <FormError error={error} />
      <Button
        size="lg"
        className="self-start"
        variant={mode === "approve" ? "default" : "destructive"}
        disabled={pending || (mode === "reject" && (modules.length === 0 || comment.trim().length < 3))}
        onClick={() =>
          run(() =>
            mode === "approve"
              ? approveReadinessAction(assignmentId, comment.trim() || null)
              : rejectReadinessAction(assignmentId, { comment, reopenModuleIds: modules }),
          )
        }
      >
        {mode === "approve" ? <Check aria-hidden="true" /> : <Undo2 aria-hidden="true" />}
        {mode === "approve" ? t("confirmApprove") : t("confirmReject")}
      </Button>
    </section>
  );
}

/** Tüm haklarda başarısızlık kararı (SPEC 3.1, karar #76). */
export function ProcessPanel({
  assignmentId,
  exams,
  reopenable,
  defaultExtra,
}: {
  assignmentId: string;
  exams: Option[];
  reopenable: Option[];
  defaultExtra: number;
}) {
  const t = useTranslations("readiness.process");
  const [decision, setDecision] = useState<"extra_attempt" | "extra_training" | "end_process">("extra_attempt");
  const [reason, setReason] = useState("");
  const [exam, setExam] = useState(exams[0]?.id ?? "");
  const [extra, setExtra] = useState(String(defaultExtra));
  const [modules, setModules] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const valid =
    reason.trim().length >= 3 &&
    (decision === "extra_attempt" ? !!exam && Number(extra) >= 1 && Number(extra) <= 10 : decision === "extra_training" ? modules.length > 0 : true);

  function submit() {
    if (decision === "end_process" && !window.confirm(t("endConfirm"))) return;
    startTransition(async () => {
      setError(null);
      const r =
        decision === "extra_attempt"
          ? await decideProcessAction(assignmentId, { decision, reason, examModuleId: exam, extraAttempts: Number(extra) })
          : decision === "extra_training"
            ? await decideProcessAction(assignmentId, { decision, reason, reopenModuleIds: modules })
            : await decideProcessAction(assignmentId, { decision, reason });
      if (r && !r.ok) setError(r.error);
    });
  }

  return (
    <section aria-labelledby="process-heading" className="flex flex-col gap-4 rounded-2xl border-2 border-amber-500 p-5">
      <h2 id="process-heading" className="flex items-center gap-2 text-lg font-semibold">
        <Gavel aria-hidden="true" />
        {t("title")}
      </h2>
      <p className="text-sm text-muted-foreground">{t("intro")}</p>
      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">{t("title")}</legend>
        {(["extra_attempt", "extra_training", "end_process"] as const).map((d) => (
          <label key={d} className="flex min-h-14 cursor-pointer items-start gap-3 rounded-xl border-2 p-3 has-checked:border-primary has-checked:bg-primary/5">
            <input type="radio" className="mt-1 size-5 accent-primary" name="process-decision" checked={decision === d} onChange={() => setDecision(d)} />
            <span>
              <span className="block font-medium">{t(`options.${d}.label`)}</span>
              <span className="block text-sm text-muted-foreground">{t(`options.${d}.hint`)}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {decision === "extra_attempt" && (
        <div className="flex flex-wrap gap-3">
          <label className="flex min-w-60 flex-1 flex-col gap-1">
            <span className="font-medium">{t("exam")}</span>
            <NativeSelect value={exam} onChange={(e) => setExam(e.target.value)}>
              {exams.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label className="flex w-32 flex-col gap-1">
            <span className="font-medium">{t("extraAttempts")}</span>
            <Input type="number" inputMode="numeric" min={1} max={10} value={extra} onChange={(e) => setExtra(e.target.value)} />
          </label>
        </div>
      )}
      {decision === "extra_training" && <ModuleChecks legend={t("reopen")} options={reopenable} value={modules} onChange={setModules} />}
      <label className="flex flex-col gap-1">
        <span className="font-medium">{t("reason")}</span>
        <Textarea rows={3} maxLength={2000} value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      <FormError error={error} />
      <Button size="lg" className="self-start" variant={decision === "end_process" ? "destructive" : "default"} disabled={pending || !valid} onClick={submit}>
        <Gavel aria-hidden="true" />
        {t(`confirm.${decision}`)}
      </Button>
    </section>
  );
}
