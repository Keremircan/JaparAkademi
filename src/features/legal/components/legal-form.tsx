"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Field } from "@/components/forms/field";
import { FormError } from "@/components/forms/form-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/features/shared/action-result";
import { saveLegalDraftAction } from "../actions";

export function LegalForm({ text }: { text?: { id: string; title: string; body: string } }) {
  const t = useTranslations("admin.legal");
  const tc = useTranslations("common");
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(
    saveLegalDraftAction.bind(null, text?.id ?? null),
    null,
  );
  return (
    <form action={action} className="flex max-w-3xl flex-col gap-5">
      {state && !state.ok && <FormError error={state.error} />}
      <Field id="title" label={t("titleField")}>
        <Input id="title" name="title" required maxLength={200} defaultValue={text?.title} />
      </Field>
      <Field id="body" label={t("body")} hint={t("bodyHint")}>
        <Textarea id="body" name="body" required rows={18} defaultValue={text?.body} aria-describedby="body-hint" />
      </Field>
      <Button type="submit" size="lg" disabled={pending} className="self-start">
        {pending ? tc("saving") : tc("save")}
      </Button>
    </form>
  );
}
