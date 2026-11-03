"use client";

import { Eye, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { FormError } from "@/components/forms/form-error";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type { ScheduleItem, ScheduleKind } from "@/lib/schedules";
import { saveMyScheduleAction } from "../actions";
import { fromRows, ItemsEditor, rowsError, toRows, type EditorRow } from "./items-editor";

/** Personel: programı kendine göre değiştirir (karar #253); değişiklikleri İK görebilir (karar #255). */
export function MyScheduleForm({ scheduleId, kind, startTime, items }: { scheduleId: string; kind: ScheduleKind; startTime: string; items: readonly ScheduleItem[] }) {
  const t = useTranslations("schedules.editor");
  const tc = useTranslations("common");
  const [rows, setRows] = useState<EditorRow[]>(() => toRows(items));
  const [error, setError] = useState<{ code: string; details?: unknown } | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    setError(null);
    const problem = rowsError(rows, kind);
    if (problem) return setError({ code: problem });
    start(async () => {
      const r = await saveMyScheduleAction(scheduleId, fromRows(rows, kind));
      if (r && !r.ok) setError({ code: r.error, details: r.details });
    });
  }

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <p className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 font-medium">
        <Eye aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
        {t("visibleToHr")}
      </p>
      <ItemsEditor kind={kind} rows={rows} onChange={setRows} startTime={startTime} />
      <FormError error={error?.code} details={error?.details} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" disabled={pending} onClick={submit}>
          <Save aria-hidden="true" />
          {pending ? tc("saving") : t("save")}
        </Button>
        <Button nativeButton={false} variant="ghost" render={<Link href="/schedule" />}>
          {t("cancel")}
        </Button>
      </div>
    </div>
  );
}
