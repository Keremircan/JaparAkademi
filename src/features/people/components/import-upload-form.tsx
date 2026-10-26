"use client";

import { Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { FormError } from "@/components/forms/form-error";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { ActionResult } from "@/features/shared/action-result";
import { uploadImportAction } from "../actions";

export function ImportUploadForm() {
  const t = useTranslations("admin.people.import");
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(uploadImportAction, null);

  return (
    <form action={action} className="flex max-w-xl flex-col gap-6">
      {state && !state.ok && <FormError error={state.error} details={state.details} />}
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-base font-medium">{t("mode")}</legend>
        {(["existing_staff", "new_hires"] as const).map((mode) => (
          <Label
            key={mode}
            htmlFor={`mode-${mode}`}
            className="flex min-h-16 cursor-pointer items-start gap-3 rounded-xl border p-4 text-base font-normal has-checked:border-primary has-checked:bg-muted"
          >
            <input
              type="radio"
              id={`mode-${mode}`}
              name="mode"
              value={mode}
              required
              defaultChecked={mode === "new_hires"}
              className="mt-1 size-5 accent-primary"
            />
            <span className="flex flex-col gap-1">
              <span className="font-medium">{t(`modes.${mode}.label`)}</span>
              <span className="text-sm text-muted-foreground">{t(`modes.${mode}.description`)}</span>
            </span>
          </Label>
        ))}
      </fieldset>
      <div className="flex flex-col gap-2">
        <Label htmlFor="file" className="text-base">
          {t("file")}
        </Label>
        <input
          id="file"
          name="file"
          type="file"
          required
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="min-h-12 rounded-lg border border-input px-3 py-2 text-base file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5"
        />
      </div>
      <Button type="submit" size="lg" disabled={pending} className="self-start">
        <Upload aria-hidden="true" />
        {pending ? t("uploading") : t("upload")}
      </Button>
    </form>
  );
}
