"use client";

import { TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { Field } from "@/components/forms/field";
import { FormError } from "@/components/forms/form-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/features/shared/action-result";
import { placeholderLabel, placeholdersIn } from "@/lib/legal";
import { saveLegalDraftAction } from "../actions";

export function LegalForm({ kind, locale, text }: { kind: string; locale: string; text?: { id: string; title: string; body: string } }) {
  const t = useTranslations("admin.legal");
  const tc = useTranslations("common");
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(
    saveLegalDraftAction.bind(null, { id: text?.id || null, kind, locale }),
    null,
  );
  // Doldurulmamış `[[...]]` alanları yazdıkça güncellenir (karar #246); taslak kaydedilebilir, yayın engellenir
  const [title, setTitle] = useState(text?.title ?? "");
  const [body, setBody] = useState(text?.body ?? "");
  const unfilled = placeholdersIn(title, body);
  return (
    <form action={action} className="flex max-w-3xl flex-col gap-5">
      {state && !state.ok && <FormError error={state.error} />}
      <Field id="title" label={t("titleField")}>
        <Input id="title" name="title" required maxLength={200} defaultValue={text?.title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field id="body" label={t("body")} hint={t("bodyHint")}>
        <Textarea
          id="body"
          name="body"
          required
          rows={18}
          defaultValue={text?.body}
          aria-describedby="body-hint"
          onChange={(e) => setBody(e.target.value)}
        />
      </Field>
      {unfilled.length > 0 && (
        <div className="flex gap-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-amber-600" />
          <div className="flex min-w-0 flex-col gap-2">
            <p className="font-medium">{t("sample.unfilledTitle")}</p>
            <div className="flex flex-wrap gap-1.5">
              {unfilled.map((name) => (
                <code key={name} className="rounded-md border bg-background px-1.5 py-0.5 text-sm">
                  {placeholderLabel(name)}
                </code>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">{t("sample.formHint")}</p>
          </div>
        </div>
      )}
      <Button type="submit" size="lg" disabled={pending} className="self-start">
        {pending ? tc("saving") : tc("save")}
      </Button>
    </form>
  );
}
