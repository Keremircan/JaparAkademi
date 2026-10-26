"use client";

import { CheckCircle2, Download, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useRef, useState, useTransition } from "react";
import { FormError } from "@/components/forms/form-error";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import type { ActionResult } from "@/features/shared/action-result";
import type { ParsedQuestionRow } from "@/server/services/questions/parse";
import { commitQuestionImportAction, previewQuestionImportAction } from "../actions";

/** Excel'den soru aktarma: hedef birim + dosya → önizleme (satır hataları) → onayla. */
export function QuestionImport({ owners }: { owners: { common: boolean; ohsOnly: boolean; units: { id: string; name: string; parentName: string | null }[] } }) {
  const t = useTranslations("questions.importer");
  const form = useRef<HTMLFormElement>(null);
  const [owner, setOwner] = useState("");
  const [isOhs, setIsOhs] = useState(owners.ohsOnly);
  const [state, action, pending] = useActionState<ActionResult<{ rows: ParsedQuestionRow[] }> | null, FormData>(previewQuestionImportAction, null);
  const [done, setDone] = useState<{ created: number; pending: number; skipped: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [committing, startTransition] = useTransition();
  const rows = state?.ok ? state.data.rows : [];
  const valid = rows.filter((r) => r.errors.length === 0).length;

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <form ref={form} action={action} className="flex max-w-xl flex-col gap-4" onChange={() => setDone(null)}>
        <label className="flex flex-col gap-2">
          <span className="font-medium">{t("owner")}</span>
          <NativeSelect name="owner" required value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value="" disabled>
              {t("choose")}
            </option>
            {owners.common && <option value="common">{t("common")}</option>}
            {owners.units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.parentName ? `${u.parentName} / ${u.name}` : u.name}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="flex min-h-12 items-center gap-3">
          <input
            type="checkbox"
            name="isOhs"
            className="size-5 accent-primary"
            checked={isOhs || owner === "common"}
            disabled={owners.ohsOnly || owner === "common"}
            onChange={(e) => setIsOhs(e.target.checked)}
          />
          {(owners.ohsOnly || owner === "common") && <input type="hidden" name="isOhs" value="on" />}
          <span>{t("isOhs")}</span>
        </label>
        {owner && (
          <Button
            variant="outline"
            className="self-start"
            nativeButton={false}
            render={<a href={`/api/questions/template?owner=${owner}&ohs=${isOhs || owner === "common" ? "1" : "0"}`} />}
          >
            <Download aria-hidden="true" />
            {t("template")}
          </Button>
        )}
        <label className="flex flex-col gap-2">
          <span className="font-medium">{t("file")}</span>
          <input
            name="file"
            type="file"
            required
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="min-h-12 rounded-lg border border-input px-3 py-2 text-base file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5"
          />
        </label>
        {state && !state.ok && <FormError error={state.error} details={state.details} />}
        <Button type="submit" size="lg" disabled={pending || !owner} className="self-start">
          <Upload aria-hidden="true" />
          {pending ? t("checking") : t("preview")}
        </Button>
      </form>

      {rows.length > 0 && (
        <section aria-labelledby="preview-heading" className="flex flex-col gap-3">
          <h2 id="preview-heading" className="text-lg font-semibold">
            {t("previewHeading", { valid, invalid: rows.length - valid })}
          </h2>
          <div className="overflow-x-auto rounded-2xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left">
                <tr>
                  <th className="px-3 py-2">{t("row")}</th>
                  <th className="px-3 py-2">{t("stem")}</th>
                  <th className="px-3 py-2">{t("result")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => (
                  <tr key={r.rowNumber} className={r.errors.length ? "bg-destructive/5" : ""}>
                    <td className="px-3 py-2 font-mono">{r.rowNumber}</td>
                    <td className="px-3 py-2">{r.stem || "—"}</td>
                    <td className="px-3 py-2">
                      {r.errors.length === 0 ? (
                        <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                          <CheckCircle2 aria-hidden="true" className="size-4" />
                          {t("ok")}
                        </span>
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
          <FormError error={error} />
          {done ? (
            <p role="status" className="rounded-xl border border-emerald-600/40 bg-emerald-500/10 p-4">
              {t("done", done)}
            </p>
          ) : (
            <Button
              size="lg"
              className="self-start"
              disabled={committing || valid === 0}
              onClick={() =>
                startTransition(async () => {
                  setError(null);
                  const r = await commitQuestionImportAction(new FormData(form.current!));
                  if (!r.ok) return setError(r.error);
                  setDone(r.data);
                })
              }
            >
              {t("commit", { count: valid })}
            </Button>
          )}
        </section>
      )}
    </div>
  );
}
