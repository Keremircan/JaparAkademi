"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Field } from "@/components/forms/field";
import { FormError } from "@/components/forms/form-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/features/shared/action-result";
import { saveOrgUnitAction } from "../actions";

export function UnitForm({
  unit,
  kind,
  parent,
}: {
  unit?: { id: string; name: string; code: string };
  kind: "department" | "section";
  parent?: { id: string; name: string } | null;
}) {
  const t = useTranslations("admin.org.unitForm");
  const tc = useTranslations("common");
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(saveOrgUnitAction, null);

  return (
    <form action={action} className="flex max-w-xl flex-col gap-5">
      {state && !state.ok && <FormError error={state.error} details={state.details} />}
      <input type="hidden" name="id" value={unit?.id ?? ""} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="parentId" value={parent?.id ?? ""} />
      {parent && (
        <p className="text-muted-foreground">
          {t("parent")}: <span className="font-medium text-foreground">{parent.name}</span>
        </p>
      )}
      <Field id="name" label={t("name")}>
        <Input id="name" name="name" required defaultValue={unit?.name} maxLength={120} />
      </Field>
      <Field id="code" label={t("code")} hint={t("codeHint")}>
        <Input
          id="code"
          name="code"
          required
          defaultValue={unit?.code}
          maxLength={24}
          autoCapitalize="characters"
          aria-describedby="code-hint"
        />
      </Field>
      <Button type="submit" size="lg" disabled={pending} className="self-start">
        {pending ? tc("saving") : tc("save")}
      </Button>
    </form>
  );
}
