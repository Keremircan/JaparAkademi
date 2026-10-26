"use client";

import { Play, Save, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Field } from "@/components/forms/field";
import { FormError } from "@/components/forms/form-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { cancelAssignmentAction, startAssignmentAction, updateAssignmentAction } from "../actions";

type Trainer = { userId: string; name: string; sicilNo: string };

/** İK: eğitimi başlatma, pratik eğitmen ve hedef tarih, iptal (FG-3.2). */
export function AssignmentControls(
  props:
    | { mode: "start"; userId: string; trainers: Trainer[] }
    | { mode: "edit"; assignmentId: string; trainers: Trainer[]; trainerUserId: string | null; targetDate: string | null; needsTrainer: boolean },
) {
  const t = useTranslations("assignments.controls");
  const tc = useTranslations("common");
  const [trainer, setTrainer] = useState(props.mode === "edit" ? (props.trainerUserId ?? "") : "");
  const [date, setDate] = useState(props.mode === "edit" ? (props.targetDate ?? "") : "");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const values = { trainerUserId: trainer || null, targetDate: date || null };
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      setError(null);
      setSaved(false);
      const r = await fn();
      if (!r.ok) setError(r.error ?? "unexpected");
      else setSaved(true);
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field id="trainer" label={t("trainer")} hint={props.mode === "edit" && props.needsTrainer && !trainer ? t("trainerNeeded") : undefined}>
          <NativeSelect id="trainer" value={trainer} onChange={(e) => setTrainer(e.target.value)}>
            <option value="">{t("noTrainer")}</option>
            {props.trainers.map((x) => (
              <option key={x.userId} value={x.userId}>
                {x.name} ({x.sicilNo})
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field id="targetDate" label={t("targetDate")} hint={props.mode === "start" ? t("targetHint") : undefined}>
          <Input id="targetDate" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <FormError error={error} />
      <div className="flex flex-wrap items-center gap-3">
        {props.mode === "start" ? (
          <Button disabled={pending} onClick={() => run(() => startAssignmentAction(props.userId, values))}>
            <Play aria-hidden="true" />
            {t("start")}
          </Button>
        ) : (
          <Button disabled={pending} onClick={() => run(() => updateAssignmentAction(props.assignmentId, values))}>
            <Save aria-hidden="true" />
            {tc("save")}
          </Button>
        )}
        <span role="status" className="text-sm text-muted-foreground">
          {saved ? tc("saved") : ""}
        </span>
      </div>
      {props.mode === "edit" && (
        <details className="rounded-xl border p-3">
          <summary className="min-h-12 cursor-pointer content-center">{t("cancelTitle")}</summary>
          <div className="flex flex-col gap-3 pt-2">
            <Field id="cancelReason" label={t("cancelReason")}>
              <Textarea id="cancelReason" rows={2} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
            <Button
              variant="destructive"
              className="self-start"
              disabled={pending}
              onClick={() => {
                if (window.confirm(t("cancelConfirm"))) run(() => cancelAssignmentAction(props.assignmentId, reason));
              }}
            >
              <XCircle aria-hidden="true" />
              {t("cancel")}
            </Button>
          </div>
        </details>
      )}
    </div>
  );
}
