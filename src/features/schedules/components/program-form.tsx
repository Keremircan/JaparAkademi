"use client";

import { Save, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { Field } from "@/components/forms/field";
import { FormError } from "@/components/forms/form-error";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { SCHEDULE_KINDS, SCHEDULE_LIMITS, WEEKDAYS, type ScheduleItem, type ScheduleKind, type Weekday } from "@/lib/schedules";
import { deleteWorkScheduleAction, saveWorkScheduleAction } from "../actions";
import { fromRows, ItemsEditor, rowKey, rowsError, toRows, type EditorRow } from "./items-editor";

type Initial = { name: string; kind: ScheduleKind; days: readonly number[]; startTime: string; items: readonly ScheduleItem[] };

/** İK: pozisyonun (vardiya) programı — oluşturma ya da düzenleme (iş paketi 3.9, karar #251). */
export function ProgramForm({ positionId, scheduleId, initial }: { positionId: string; scheduleId: string | null; initial: Initial | null }) {
  const t = useTranslations("schedules");
  const tf = useTranslations("schedules.manage.form");
  const tc = useTranslations("common");
  const uid = useId();
  const [name, setName] = useState(initial?.name ?? "");
  const [kind, setKind] = useState<ScheduleKind>(initial?.kind ?? "daily");
  const [days, setDays] = useState<number[]>(initial ? [...initial.days] : [1, 2, 3, 4, 5]);
  const [startTime, setStartTime] = useState(initial?.startTime ?? "00:00");
  const [rows, setRows] = useState<EditorRow[]>(() => toRows(initial?.items ?? []));
  const [error, setError] = useState<{ code: string; details?: unknown } | null>(null);
  const [pending, start] = useTransition();

  function switchKind(next: ScheduleKind) {
    if (next === kind) return;
    if (next === "weekly") {
      // Günlük akış seçili her güne kopyalanır
      const target = (days.length ? [...days].sort((a, b) => a - b) : [1]) as Weekday[];
      setRows(target.flatMap((d) => rows.map((r) => ({ ...r, key: rowKey(), weekday: d }))));
    } else {
      // Haftalıktan günlüğe: aynı satır bir kez kalır, günler satırların günlerinden gelir
      const present = WEEKDAYS.filter((d) => rows.some((r) => r.weekday === d));
      if (present.length) setDays([...present]);
      const seen = new Set<string>();
      setRows(
        rows
          .filter((r) => {
            const k = `${r.time}|${r.title.trim()}|${r.note.trim()}`;
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
          })
          .map((r) => ({ ...r, weekday: null })),
      );
    }
    setKind(next);
  }

  function submit() {
    setError(null);
    if (!name.trim()) return setError({ code: "schedule_name_required" });
    if (kind === "daily" && days.length === 0) return setError({ code: "schedule_days_required" });
    const rowsProblem = rowsError(rows, kind);
    if (rowsProblem) return setError({ code: rowsProblem });
    start(async () => {
      const r = await saveWorkScheduleAction(positionId, scheduleId, { name: name.trim(), kind, days, startTime, items: fromRows(rows, kind) });
      if (r && !r.ok) setError({ code: r.error, details: r.details });
    });
  }

  function remove() {
    if (!scheduleId || !window.confirm(tf("deleteConfirm"))) return;
    setError(null);
    start(async () => {
      const r = await deleteWorkScheduleAction(positionId, scheduleId);
      if (r && !r.ok) setError({ code: r.error, details: r.details });
    });
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field id={`${uid}-name`} label={tf("name")} hint={tf("nameHint")}>
          <Input id={`${uid}-name`} aria-describedby={`${uid}-name-hint`} value={name} maxLength={SCHEDULE_LIMITS.name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field id={`${uid}-start`} label={tf("startTime")} hint={tf("startTimeHint")}>
          <Input id={`${uid}-start`} aria-describedby={`${uid}-start-hint`} type="time" required value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        </Field>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium pointer-fine:text-base">{tf("kind")}</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {SCHEDULE_KINDS.map((k) => (
            <label key={k} className="flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border-2 p-3 has-checked:border-primary has-checked:bg-primary/5">
              <input type="radio" name={`${uid}-kind`} className="mt-1 size-5 accent-primary" checked={kind === k} onChange={() => switchKind(k)} />
              <span className="flex flex-col">
                <span className="font-medium">{tf(k)}</span>
                <span className="text-sm text-muted-foreground">{tf(`${k}Hint`)}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {kind === "daily" && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium pointer-fine:text-base">{tf("days")}</legend>
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((d) => (
              <label key={d} className="flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border px-3 has-data-checked:border-primary has-data-checked:bg-primary/5">
                <Checkbox
                  className="size-5"
                  aria-label={t(`days.${d}`)}
                  checked={days.includes(d)}
                  onCheckedChange={(on) => setDays((x) => (on ? [...x, d].sort((a, b) => a - b) : x.filter((y) => y !== d)))}
                />
                {t(`days.${d}`)}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <section aria-labelledby={`${uid}-items`} className="flex flex-col gap-3">
        <h2 id={`${uid}-items`} className="text-base font-semibold">
          {tf("items")}
        </h2>
        <ItemsEditor kind={kind} rows={rows} onChange={setRows} startTime={startTime} />
      </section>

      {scheduleId && <p className="rounded-xl bg-muted p-3 text-sm">{tf("updateNote")}</p>}
      <FormError error={error?.code} details={error?.details} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" disabled={pending} onClick={submit}>
          <Save aria-hidden="true" />
          {pending ? tc("saving") : tf("save")}
        </Button>
        {scheduleId && (
          <Button type="button" variant="destructive" disabled={pending} onClick={remove}>
            <Trash2 aria-hidden="true" />
            {tf("delete")}
          </Button>
        )}
      </div>
    </div>
  );
}
