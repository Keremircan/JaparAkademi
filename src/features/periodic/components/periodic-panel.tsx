"use client";

import { CalendarCheck, Play } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { Field } from "@/components/forms/field";
import { FormError } from "@/components/forms/form-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import type { PeriodicRow } from "@/server/services/assignments/periodic";
import type { PeriodicState } from "@/server/state/periodic";
import { recordPriorAction, startPeriodicAction } from "../actions";

const STATE_CLASS: Record<PeriodicState, string> = {
  none: "border border-dashed text-muted-foreground",
  scheduled: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300",
  open: "bg-sky-500/15 text-sky-800 dark:text-sky-300",
};

/** Eski personel listesi: kişi seçimi → son eğitim tarihi kaydı ya da "Şimdi başlat" (kararlar #222–223). */
export function PeriodicPanel({
  rows,
  modules,
  canRecord,
  canStart,
  today,
}: {
  rows: PeriodicRow[];
  modules: { id: string; title: string; recordable: boolean }[];
  canRecord: boolean;
  canStart: boolean;
  today: string;
}) {
  const t = useTranslations("periodic");
  const tc = useTranslations("common");
  const format = useFormatter();
  const uid = useId();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [moduleId, setModuleId] = useState("");
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<{ code: string; details?: unknown } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const recordable = modules.filter((m) => m.recordable);
  const day = (d: string) => format.dateTime(new Date(`${d}T12:00:00`), { dateStyle: "short" });
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.userId));

  function record() {
    setError(null);
    setMessage(null);
    start(async () => {
      const r = await recordPriorAction({ userIds: [...selected], moduleId, completedOn: date, note: note.trim() || null });
      if (!r.ok) return setError({ code: r.error, details: r.details });
      setMessage(t("recorded", { saved: r.data.saved, skipped: r.data.skipped }));
      setSelected(new Set());
    });
  }

  function startNow() {
    if (!window.confirm(t("startConfirm", { count: selected.size }))) return;
    setError(null);
    setMessage(null);
    start(async () => {
      const r = await startPeriodicAction([...selected]);
      if (!r.ok) return setError({ code: r.error, details: r.details });
      setMessage(t("started", { started: r.data.started, skipped: r.data.skipped.length }));
      setSelected(new Set());
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {(canRecord || canStart) && rows.length > 0 && (
        <section aria-labelledby={`${uid}-actions`} className="flex flex-col gap-4 rounded-2xl border p-4">
          <h2 id={`${uid}-actions`} className="font-semibold">
            {t("selected", { count: selected.size })}
          </h2>
          {canRecord && recordable.length > 0 && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr_2fr_auto] sm:items-end">
              <Field id={`${uid}-module`} label={t("module")}>
                <NativeSelect id={`${uid}-module`} value={moduleId} onChange={(e) => setModuleId(e.target.value)}>
                  <option value="" disabled>
                    {t("choose")}
                  </option>
                  {recordable.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.title}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field id={`${uid}-date`} label={t("lastDate")}>
                <Input id={`${uid}-date`} type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
              <Field id={`${uid}-note`} label={t("note")} optional={tc("optional")}>
                <Input id={`${uid}-note`} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("notePlaceholder")} />
              </Field>
              <Button type="button" disabled={pending || selected.size === 0 || !moduleId || !date} onClick={record}>
                <CalendarCheck aria-hidden="true" />
                {t("record")}
              </Button>
            </div>
          )}
          {canStart && (
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" variant="outline" disabled={pending || selected.size === 0} onClick={startNow}>
                <Play aria-hidden="true" />
                {t("start")}
              </Button>
              <span className="text-sm text-muted-foreground">{t("startHint")}</span>
            </div>
          )}
          <FormError error={error?.code} details={error?.details} />
          <p role="status" className="text-sm">
            {message ?? ""}
          </p>
        </section>
      )}

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-6 text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="divide-y rounded-2xl border">
          <li className="px-4 py-2">
            <label className="flex min-h-12 items-center gap-3">
              <input
                type="checkbox"
                className="size-5 accent-primary"
                checked={allSelected}
                onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.userId)))}
              />
              <span className="font-medium">{t("selectAll")}</span>
            </label>
          </li>
          {rows.map((r) => (
            <li key={r.userId} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start">
              <label className="flex min-h-12 min-w-64 items-center gap-3">
                <input type="checkbox" className="size-5 accent-primary" checked={selected.has(r.userId)} onChange={() => toggle(r.userId)} />
                <span>
                  <span className="block font-medium">{r.fullName}</span>
                  <span className="block text-sm text-muted-foreground">
                    {r.sicilNo} · {r.positionName}
                    {r.unitName ? ` · ${r.unitName}` : ""}
                  </span>
                </span>
              </label>
              <ul className="flex flex-1 flex-wrap gap-2">
                {r.items.map((i) => (
                  <li key={i.moduleId} className={`rounded-xl px-3 py-1.5 text-sm ${STATE_CLASS[i.state]}`}>
                    <span className="font-medium">{i.title}</span>
                    <span className="block text-xs">
                      {i.state === "open"
                        ? t("states.open")
                        : i.state === "none"
                          ? t("states.none")
                          : i.opensOn
                            ? t("states.scheduled", { last: day(i.lastDate!), opens: day(i.opensOn) })
                            : t("states.noExpiry", { last: day(i.lastDate!) })}
                      {i.source === "prior" && ` · ${t("fromPrior")}`}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
