"use client";

import { CircleAlert, CircleCheck, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { FormError } from "@/components/forms/form-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/features/shared/action-result";
import type { TestMailResult } from "@/server/services/mail-status";
import type { MailProblem } from "@/server/state/mail";
import { sendTestEmailAction } from "../actions";

/** Sorunun sağlayıcıya özel ipucu; yoksa genel ipucu (karar #261). */
export function useMailHint() {
  const t = useTranslations("mailStatus.hints");
  return (transport: string, problem: MailProblem) => {
    const specific = `${transport}.${problem}`;
    return t.has(specific as never) ? t(specific as never) : t(`common.${problem}` as never);
  };
}

/** Deneme e-postası: sonuç ve sağlayıcıya özel ipucu hemen gösterilir. */
export function TestMailForm({ defaultTo, transport }: { defaultTo: string; transport: string }) {
  const t = useTranslations("mailStatus");
  const hint = useMailHint();
  const [state, action, pending] = useActionState<ActionResult<TestMailResult> | null, FormData>(sendTestEmailAction, null);
  return (
    <form action={action} className="flex max-w-xl flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">{t("test.to")}</span>
        <Input name="to" type="email" defaultValue={defaultTo} required maxLength={254} autoComplete="email" />
      </label>
      <Button type="submit" size="lg" disabled={pending} className="self-start">
        <Send aria-hidden="true" />
        {pending ? t("test.sending") : t("test.submit")}
      </Button>
      {state && !state.ok && <FormError error={state.error} details={state.details} />}
      {state?.ok && state.data.ok && (
        <p role="status" className="flex items-start gap-2 rounded-xl border p-4">
          <CircleCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-emerald-700 dark:text-emerald-400" />
          {t("test.ok")}
        </p>
      )}
      {state?.ok && !state.data.ok && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/5 p-4">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-destructive" />
          <div className="flex flex-col gap-1">
            <p className="font-medium">{t(`problems.${state.data.problem}`)}</p>
            <p className="text-sm">{hint(transport, state.data.problem)}</p>
            <p className="font-mono text-xs text-muted-foreground">{state.data.detail}</p>
          </div>
        </div>
      )}
    </form>
  );
}
