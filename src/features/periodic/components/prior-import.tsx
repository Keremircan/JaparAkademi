"use client";

import { CheckCircle2, Download, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useRef, useState, useTransition } from "react";
import { FormError } from "@/components/forms/form-error";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/features/shared/action-result";
import type { PriorPreviewRow } from "@/server/services/assignments/periodic";
import { commitPriorImportAction, previewPriorImportAction } from "../actions";

type Preview = { rows: PriorPreviewRow[]; missingColumns: string[]; tooManyRows: boolean };

/** Excel'den son eğitim tarihleri: şablon → dosya → önizleme (satır hataları) → onayla (karar #223). */
export function PriorImport() {
  const t = useTranslations("periodic.import");
  const form = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState<ActionResult<Preview> | null, FormData>(previewPriorImportAction, null);
  const [done, setDone] = useState<{ saved: number; skipped: number } | null>(null);
  const [error, setError] = useState<{ code: string; details?: unknown } | null>(null);
  const [committing, start] = useTransition();
  const preview = state?.ok ? state.data : null;
  const valid = preview?.rows.filter((r) => r.errors.length === 0).length ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{t("intro")}</p>
      <Button variant="outline" className="self-start" nativeButton={false} render={<a href="/api/manage/periodic/template" download />}>
        <Download aria-hidden="true" />
        {t("template")}
      </Button>
      <form ref={form} action={action} className="flex flex-wrap items-end gap-3" onChange={() => setDone(null)}>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">{t("file")}</span>
          <input name="file" type="file" accept=".xlsx" required className="min-h-12 text-sm" />
        </label>
        <Button type="submit" disabled={pending}>
          <Upload aria-hidden="true" />
          {pending ? t("checking") : t("preview")}
        </Button>
      </form>
      {state && !state.ok && <FormError error={state.error} details={state.details} />}
      {preview && preview.missingColumns.length > 0 && <FormError error="missing_columns" details={{ columns: preview.missingColumns.join(", ") }} />}
      {preview && preview.rows.length > 0 && !done && (
        <section className="flex flex-col gap-3">
          <h3 className="font-semibold">{t("previewHeading", { valid, invalid: preview.rows.length - valid })}</h3>
          <div className="max-h-96 overflow-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-start">
                  <th scope="col" className="p-2 text-start">{t("row")}</th>
                  <th scope="col" className="p-2 text-start">{t("person")}</th>
                  <th scope="col" className="p-2 text-start">{t("module")}</th>
                  <th scope="col" className="p-2 text-start">{t("date")}</th>
                  <th scope="col" className="p-2 text-start">{t("result")}</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => (
                  <tr key={r.rowNumber} className="border-t align-top">
                    <td className="p-2">{r.rowNumber}</td>
                    <td className="p-2">
                      {r.sicilNo}
                      {r.fullName && <span className="block text-muted-foreground">{r.fullName}</span>}
                    </td>
                    <td className="p-2">{r.moduleTitle}</td>
                    <td className="p-2">{r.completedOn ?? "—"}</td>
                    <td className="p-2">
                      {r.errors.length === 0 ? (
                        <span className="text-emerald-700 dark:text-emerald-400">{t("ok")}</span>
                      ) : (
                        <ul className="text-destructive">
                          {r.errors.map((e) => (
                            <li key={e}>{t(`rowErrors.${e}`)}</li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <FormError error={error?.code} details={error?.details} />
          <Button
            type="button"
            className="self-start"
            disabled={committing || valid === 0}
            onClick={() => {
              setError(null);
              start(async () => {
                const r = await commitPriorImportAction(new FormData(form.current!));
                if (!r.ok) setError({ code: r.error, details: r.details });
                else setDone(r.data);
              });
            }}
          >
            <CheckCircle2 aria-hidden="true" />
            {t("commit", { count: valid })}
          </Button>
        </section>
      )}
      {done && (
        <p role="status" className="rounded-xl border bg-emerald-500/10 p-3">
          {t("done", { saved: done.saved, skipped: done.skipped })}
        </p>
      )}
    </div>
  );
}
