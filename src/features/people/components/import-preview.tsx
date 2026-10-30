"use client";

import { CheckCircle2, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { ActionButton } from "@/components/forms/action-button";
import { FormError } from "@/components/forms/form-error";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { cancelImportAction, commitImportAction, type CommitImportResult } from "../actions";

export type PreviewRow = {
  rowNumber: number;
  sicilNo: string | null;
  fullName: string | null;
  positionLabel: string | null;
  isUpdate: boolean;
  status: string;
  errors: string[];
};

/** Aktarım önizlemesi ve onay. Geçici şifre PDF'i onay anında bir kez indirilir. */
export function ImportPreview({
  batchId,
  status,
  rows,
  counts,
}: {
  batchId: string;
  status: "validated" | "committed" | "cancelled";
  rows: PreviewRow[];
  counts: { total: number; valid: number; errors: number; creates: number; updates: number };
}) {
  const t = useTranslations("admin.people.import");
  const tc = useTranslations("common");
  const tCol = useTranslations("admin.people.columns");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CommitImportResult | null>(null);
  const [errorsOnly, setErrorsOnly] = useState(counts.errors > 0);

  if (result) {
    return (
      <div role="status" className="flex max-w-2xl flex-col gap-4 rounded-2xl border p-6">
        <div className="flex items-center gap-3">
          <CheckCircle2 aria-hidden="true" className="size-6" />
          <h2 className="text-xl font-semibold">{t("committedTitle")}</h2>
        </div>
        <p>{t("committedSummary", { created: result.created, updated: result.updated, unchanged: result.unchanged })}</p>
        {result.created > 0 && (
          <>
            <p className="text-muted-foreground">{t("inviteHint")}</p>
            <Button size="lg" className="self-start" nativeButton={false} render={<Link href={`/admin/people/invites?import=${batchId}`} />}>
              <Send aria-hidden="true" />
              {t("inviteNow")}
            </Button>
          </>
        )}
        <Button variant="outline" className="self-start" nativeButton={false} render={<Link href="/admin/people" />}>
          {tc("close")}
        </Button>
      </div>
    );
  }

  const visible = errorsOnly ? rows.filter((r) => r.errors.length > 0) : rows;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-x-6 gap-y-2 rounded-2xl border p-5">
        <p className="font-medium">{t("summary", { total: counts.total, valid: counts.valid, errors: counts.errors })}</p>
        <p className="text-muted-foreground">{t("newCount", { count: counts.creates })}</p>
        <p className="text-muted-foreground">{t("updateCount", { count: counts.updates })}</p>
      </div>

      {status === "validated" && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">{t("commitNotice")}</p>
          <FormError error={error} />
          <div className="flex flex-wrap gap-2">
            <Button
              size="lg"
              disabled={pending || counts.valid === 0}
              onClick={() => {
                setError(null);
                startTransition(async () => {
                  const r = await commitImportAction(batchId);
                  if (!r.ok) return setError(r.error);
                  setResult(r.data);
                });
              }}
            >
              {pending ? t("committing") : t("commit")}
            </Button>
            {!pending && (
              <ActionButton variant="ghost" action={cancelImportAction.bind(null, batchId)}>
                {t("cancel")}
              </ActionButton>
            )}
          </div>
        </div>
      )}

      <label className="flex min-h-12 items-center gap-3">
        <input type="checkbox" checked={errorsOnly} onChange={(e) => setErrorsOnly(e.target.checked)} className="size-5 accent-primary" />
        {t("statuses.error")} ({counts.errors})
      </label>

      <div className="overflow-x-auto rounded-2xl border">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="px-3 py-2">{t("row")}</th>
              <th className="px-3 py-2">{tCol("status")}</th>
              <th className="px-3 py-2">{t("action")}</th>
              <th className="px-3 py-2">{tCol("sicil")}</th>
              <th className="px-3 py-2">{tCol("name")}</th>
              <th className="px-3 py-2">{tCol("position")}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {visible.map((r) => (
              <tr key={r.rowNumber} className={r.errors.length ? "bg-destructive/5" : undefined}>
                <td className="px-3 py-2 font-mono">{r.rowNumber}</td>
                <td className="px-3 py-2">
                  {t(`statuses.${r.status as "valid"}`)}
                  {r.errors.length > 0 && (
                    <ul className="mt-1 list-disc pl-4 text-destructive">
                      {r.errors.map((e) => (
                        <li key={e}>{t(`rowErrors.${e as "sicil_missing"}`)}</li>
                      ))}
                    </ul>
                  )}
                </td>
                <td className="px-3 py-2">{r.errors.length ? tc("none") : r.isUpdate ? t("actionUpdate") : t("actionNew")}</td>
                <td className="px-3 py-2 font-mono">{r.sicilNo ?? tc("none")}</td>
                <td className="px-3 py-2">{r.fullName ?? tc("none")}</td>
                <td className="px-3 py-2">{r.positionLabel ?? tc("none")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
