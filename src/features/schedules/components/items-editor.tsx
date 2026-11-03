"use client";

import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { SCHEDULE_LIMITS, TIME_RE, WEEKDAYS, type ScheduleItem, type ScheduleKind, type Weekday } from "@/lib/schedules";

/** Düzenlenen satır: `key` yalnızca React listesi içindir. */
export type EditorRow = { key: string; weekday: Weekday | null; time: string; title: string; note: string };

let seq = 0;
export const rowKey = () => `row-${++seq}`;

export function toRows(items: readonly ScheduleItem[]): EditorRow[] {
  return items.map((i) => ({ key: rowKey(), weekday: i.weekday, time: i.time, title: i.title, note: i.note ?? "" }));
}

export function fromRows(rows: readonly EditorRow[], kind: ScheduleKind): ScheduleItem[] {
  return rows.map((r) => ({ weekday: kind === "weekly" ? r.weekday : null, time: r.time, title: r.title.trim(), note: r.note.trim() || null }));
}

/** Gönderimden önce istemcide ön kontrol (sunucu da doğrular): her satırda geçerli saat ve başlık. */
export function rowsError(rows: readonly EditorRow[], kind: ScheduleKind): string | null {
  if (rows.length === 0 || rows.some((r) => !TIME_RE.test(r.time) || !r.title.trim())) return "schedule_item_incomplete";
  if (kind === "weekly" && rows.some((r) => r.weekday === null)) return "schedule_weekday_required";
  return null;
}

/**
 * Program satırları: haftalık programda her satırın günü seçilir; günlükte seçilen günlerin hepsinde aynı akış.
 * Sıralama kayıtta yapılır (gün, sonra vardiya başlangıcına göre saat).
 */
export function ItemsEditor({
  kind,
  rows,
  onChange,
  startTime,
}: {
  kind: ScheduleKind;
  rows: EditorRow[];
  onChange: (rows: EditorRow[]) => void;
  startTime: string;
}) {
  const t = useTranslations("schedules");
  const tc = useTranslations("common");
  const uid = useId();
  const change = (i: number, patch: Partial<EditorRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const add = () => {
    const last = rows.at(-1);
    onChange([...rows, { key: rowKey(), weekday: kind === "weekly" ? (last?.weekday ?? 1) : null, time: last?.time ?? startTime, title: "", note: "" }]);
  };

  return (
    <div className="flex flex-col gap-3">
      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed p-4 text-muted-foreground">{t("editor.empty")}</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {rows.map((row, i) => {
            const id = `${uid}-${i}`;
            return (
              <li key={row.key} className="flex flex-col gap-3 rounded-xl border p-3">
                <div className="flex items-center gap-2">
                  <span className="flex-1 font-medium">{t("editor.row", { n: i + 1 })}</span>
                  <Button type="button" variant="ghost" size="icon" onClick={() => onChange(rows.filter((_, j) => j !== i))} aria-label={t("editor.remove", { n: i + 1 })}>
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>
                <div className={kind === "weekly" ? "grid grid-cols-2 gap-3 sm:grid-cols-[minmax(9rem,auto)_minmax(8rem,auto)_1fr]" : "grid grid-cols-1 gap-3 sm:grid-cols-[minmax(8rem,auto)_1fr]"}>
                  {kind === "weekly" && (
                    <Field id={`${id}-day`} label={t("editor.day")}>
                      <NativeSelect id={`${id}-day`} value={row.weekday ?? 1} onChange={(e) => change(i, { weekday: Number(e.target.value) as Weekday })}>
                        {WEEKDAYS.map((d) => (
                          <option key={d} value={d}>
                            {t(`days.${d}`)}
                          </option>
                        ))}
                      </NativeSelect>
                    </Field>
                  )}
                  <Field id={`${id}-time`} label={t("editor.time")}>
                    <Input id={`${id}-time`} type="time" required value={row.time} onChange={(e) => change(i, { time: e.target.value })} />
                  </Field>
                  <div className={kind === "weekly" ? "col-span-2 sm:col-span-1" : undefined}>
                    <Field id={`${id}-title`} label={t("editor.itemTitle")}>
                      <Input
                        id={`${id}-title`}
                        required
                        maxLength={SCHEDULE_LIMITS.title}
                        value={row.title}
                        onChange={(e) => change(i, { title: e.target.value })}
                      />
                    </Field>
                  </div>
                </div>
                <Field id={`${id}-note`} label={t("editor.note")} optional={tc("optional")}>
                  <Input id={`${id}-note`} maxLength={SCHEDULE_LIMITS.note} value={row.note} onChange={(e) => change(i, { note: e.target.value })} />
                </Field>
              </li>
            );
          })}
        </ol>
      )}
      <Button type="button" variant="outline" className="self-start" disabled={rows.length >= SCHEDULE_LIMITS.items} onClick={add}>
        <Plus aria-hidden="true" />
        {t("editor.add")}
      </Button>
    </div>
  );
}
