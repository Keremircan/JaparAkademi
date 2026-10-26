"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, GripVertical, Lock, Plus, Save, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { FormError } from "@/components/forms/form-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import type { ModuleKind } from "@/server/services/modules";
import type { PlanItemView, PlanModuleSettings, PlanOverrides } from "@/server/services/positions";
import type { PlanDefaults } from "@/server/services/positions/plan-settings";
import { savePlanAction } from "../actions";

type Item = PlanItemView;
type Candidate = { id: string; kind: ModuleKind; title: string; durationMin: number; isOhs: boolean; isCardModule: boolean };

const THEORY_FIELDS = ["questionCount", "durationMin", "passScore", "maxAttempts", "cooldownHours"] as const;
const PRACTICE_FIELDS = ["passScore", "maxAttempts"] as const;

/** Ön koşullar yalnızca önceki modüllere işaret edebilir; sıralama sonrası temizlenir. Kart modülü hep ilk sıradadır. */
function normalize(items: Item[]): Item[] {
  const cardIdx = items.findIndex((i) => i.isCardModule);
  const ordered = cardIdx > 0 ? [items[cardIdx]!, ...items.filter((_, j) => j !== cardIdx)] : items;
  return ordered.map((item, i) => {
    const earlier = new Set(ordered.slice(0, i).map((x) => x.moduleId));
    return { ...item, prerequisiteModuleIds: item.prerequisiteModuleIds.filter((p) => earlier.has(p)) };
  });
}

export function PlanDesigner({
  positionId,
  initialItems,
  initialOverrides,
  commonModules,
  candidates,
  defaults,
  mode,
  questionIndex = {},
  poolMinRatio = 2,
}: {
  positionId: string;
  initialItems: Item[];
  initialOverrides: PlanOverrides;
  commonModules: { id: string; kind: ModuleKind; title: string; durationMin: number }[];
  candidates: Candidate[];
  defaults: PlanDefaults;
  mode: "full" | "ohs";
  /** Modül → etkin soru numaraları (havuz uyarısı için; karar #59). */
  questionIndex?: Record<string, number[]>;
  /** `exam.question_pool_min_ratio`: havuz bu oranın altındaysa uyarı. */
  poolMinRatio?: number;
}) {
  const t = useTranslations("plans");
  const tk = useTranslations("modules.kinds");
  const tc = useTranslations("common");
  const [items, setItems] = useState(initialItems);
  const [ratio, setRatio] = useState(initialOverrides.videoWatchRatio !== undefined ? String(Math.round(initialOverrides.videoWatchRatio * 100)) : "");
  const [adding, setAdding] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const editable = (i: Item) => !i.isCardModule && (mode === "full" || i.isOhs);
  const update = (next: Item[]) => {
    setItems(normalize(next));
    setDirty(true);
    setSaved(false);
  };
  const change = (id: string, patch: Partial<Item>) => update(items.map((x) => (x.moduleId === id ? { ...x, ...patch } : x)));

  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const from = items.findIndex((i) => i.moduleId === e.active.id);
    const to = items.findIndex((i) => i.moduleId === e.over!.id);
    update(arrayMove(items, from, to));
  }

  const available = candidates.filter((c) => !items.some((i) => i.moduleId === c.id) && !c.isCardModule && (mode === "full" || c.isOhs));

  function add() {
    const c = candidates.find((x) => x.id === adding);
    if (!c) return;
    const prev = items[items.length - 1];
    update([
      ...items,
      {
        moduleId: c.id,
        kind: c.kind,
        title: c.title,
        durationMin: c.durationMin,
        isOhs: c.isOhs,
        remoteAllowed: true,
        validityMonths: null,
        archived: false,
        isCardModule: false,
        itemCount: 1,
        isRequired: true,
        prerequisiteModuleIds: prev ? [prev.moduleId] : [],
        settings: {},
      },
    ]);
    setAdding("");
  }

  function save() {
    const pct = ratio.trim() === "" ? undefined : Number(ratio) / 100;
    startTransition(async () => {
      setError(null);
      const r = await savePlanAction(positionId, {
        overrides: pct === undefined ? {} : { videoWatchRatio: pct },
        items: items.map((i) => ({ moduleId: i.moduleId, isRequired: i.isRequired, prerequisiteModuleIds: i.prerequisiteModuleIds, settings: i.settings })),
      });
      if (!r.ok) return setError(r.error);
      setDirty(false);
      setSaved(true);
    });
  }

  const total = [...commonModules, ...items].reduce((a, m) => a + m.durationMin, 0);
  // Havuz: ortak teorik modüller + plandaki sınavdan önceki teorik modüller (ortaklar yaka tipine göre değişebilir; uyarı yaklaşıktır)
  const poolFor = (index: number) => {
    const ids = new Set<number>();
    const moduleIds = [...commonModules.filter((c) => c.kind === "theory").map((c) => c.id), ...items.slice(0, index).filter((x) => x.kind === "theory").map((x) => x.moduleId)];
    for (const id of moduleIds) for (const q of questionIndex[id] ?? []) ids.add(q);
    return ids.size;
  };

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      {mode === "ohs" && <p className="rounded-xl border bg-muted/50 p-4">{t("ohsMode")}</p>}
      <p className="text-muted-foreground" role="status">
        {t("total", { hours: Math.floor(total / 60), minutes: total % 60 })}
      </p>

      {commonModules.length > 0 && (
        <section aria-labelledby="common-heading" className="flex flex-col gap-2">
          <h2 id="common-heading" className="font-semibold">
            {t("commonHeading")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("commonHint")}</p>
          <ol className="flex flex-col gap-2">
            {commonModules.map((m) => (
              <li key={m.id} className="flex min-h-12 items-center gap-3 rounded-xl border border-dashed px-3 text-muted-foreground">
                <Lock aria-hidden="true" className="size-4" />
                {m.title} <span className="text-sm">· {tk(`${m.kind}.label`)}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section aria-labelledby="modules-heading" className="flex flex-col gap-3">
        <h2 id="modules-heading" className="font-semibold">
          {t("modulesHeading")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("dragHint")}</p>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={items.map((i) => i.moduleId)} strategy={verticalListSortingStrategy}>
            <ol className="flex flex-col gap-3">
              {items.map((item, i) => (
                <SortableItem
                  key={item.moduleId}
                  item={item}
                  index={i}
                  count={items.length}
                  earlier={items.slice(0, i)}
                  editable={editable(item)}
                  movable={!item.isCardModule && (mode === "full" || item.isOhs)}
                  defaults={defaults}
                  pool={item.kind === "theory_exam" ? { size: poolFor(i), minRatio: poolMinRatio } : null}
                  onMove={(dir) => update(arrayMove(items, i, i + dir))}
                  onRemove={() => update(items.filter((x) => x.moduleId !== item.moduleId))}
                  onChange={(patch) => change(item.moduleId, patch)}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>

        <div className="flex flex-wrap items-end gap-2 rounded-xl border p-3">
          <label className="flex min-w-60 flex-1 flex-col gap-1">
            <span className="text-sm font-medium">{t("addModule")}</span>
            <NativeSelect value={adding} onChange={(e) => setAdding(e.target.value)}>
              <option value="">{available.length ? t("choose") : t("noCandidates")}</option>
              {available.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title} ({tk(`${c.kind}.label`)})
                </option>
              ))}
            </NativeSelect>
          </label>
          <Button type="button" variant="outline" disabled={!adding} onClick={add}>
            <Plus aria-hidden="true" />
            {t("add")}
          </Button>
        </div>
      </section>

      {mode === "full" && (
        <section aria-labelledby="overrides-heading" className="flex flex-col gap-2 rounded-xl border p-4">
          <h2 id="overrides-heading" className="font-semibold">
            {t("overridesHeading")}
          </h2>
          <label className="flex max-w-xs flex-col gap-1">
            <span className="text-sm font-medium">{t("videoRatioLabel")}</span>
            <Input
              type="number"
              inputMode="numeric"
              min={50}
              max={100}
              value={ratio}
              placeholder={t("defaultValue", { value: `%${Math.round(defaults.plan.videoWatchRatio * 100)}` })}
              onChange={(e) => {
                setRatio(e.target.value);
                setDirty(true);
                setSaved(false);
              }}
            />
          </label>
        </section>
      )}

      <FormError error={error} />
      <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] z-10 flex flex-wrap items-center gap-3 rounded-2xl border bg-background/95 p-3 shadow-sm backdrop-blur lg:bottom-4">
        <Button type="button" size="lg" disabled={pending} onClick={save}>
          <Save aria-hidden="true" />
          {pending ? tc("saving") : t("save")}
        </Button>
        <span role="status" className="text-sm text-muted-foreground">
          {saved ? tc("saved") : dirty ? t("unsaved") : ""}
        </span>
      </div>
    </div>
  );
}

function SortableItem({
  item,
  index,
  count,
  earlier,
  editable,
  movable,
  defaults,
  pool,
  onMove,
  onRemove,
  onChange,
}: {
  item: Item;
  index: number;
  count: number;
  earlier: Item[];
  editable: boolean;
  movable: boolean;
  defaults: PlanDefaults;
  pool: { size: number; minRatio: number } | null;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  onChange: (patch: Partial<Item>) => void;
}) {
  const t = useTranslations("plans");
  const tk = useTranslations("modules.kinds");
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: item.moduleId, disabled: !movable });
  const setSetting = (key: keyof PlanModuleSettings, value: number | boolean | undefined) => {
    const next = { ...item.settings };
    if (value === undefined) delete next[key];
    else (next as Record<string, unknown>)[key] = value;
    onChange({ settings: next });
  };
  const examDefaults = item.kind === "theory_exam" ? defaults.theory_exam : item.kind === "practice_exam" ? defaults.practice_exam : null;
  const fields = item.kind === "theory_exam" ? THEORY_FIELDS : item.kind === "practice_exam" ? PRACTICE_FIELDS : [];

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex flex-col gap-3 rounded-xl border bg-card p-3 ${isDragging ? "z-10 shadow-lg" : ""}`}
    >
      <div className="flex items-center gap-2">
        {movable ? (
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            aria-label={t("dragHandle", { title: item.title })}
            className="flex size-12 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg hover:bg-muted active:cursor-grabbing"
          >
            <GripVertical aria-hidden="true" />
          </button>
        ) : (
          <span className="flex size-12 shrink-0 items-center justify-center text-muted-foreground">
            <Lock aria-hidden="true" className="size-4" />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block font-medium">
            {index + 1}. {item.title}
          </span>
          <span className="block text-sm text-muted-foreground">
            {tk(`${item.kind}.label`)} · {t("minutes", { n: item.durationMin })}
            {item.isCardModule && ` · ${t("cardModule")}`}
            {item.isOhs && ` · ${t("ohs")}`}
          </span>
          {item.archived && <span className="block text-sm text-destructive">{t("archivedWarning")}</span>}
          {pool !== null && (() => {
            const needed = item.settings.questionCount ?? defaults.theory_exam.questionCount;
            const size = pool.size;
            if (size >= needed * pool.minRatio) return <span className="block text-sm text-muted-foreground">{t("poolOk", { pool: size })}</span>;
            return (
              <span role="status" className={`block text-sm ${size < needed ? "text-destructive" : "text-amber-700 dark:text-amber-400"}`}>
                {size < needed
                  ? t("poolInsufficient", { pool: size, needed })
                  : t("poolSmall", { pool: size, needed, recommended: Math.ceil(needed * pool.minRatio) })}
              </span>
            );
          })()}
        </span>
        {movable && (
          <div className="flex shrink-0 gap-1">
            <Button type="button" variant="ghost" size="icon" disabled={index <= 1} onClick={() => onMove(-1)} aria-label={t("moveUp", { title: item.title })}>
              <ArrowUp aria-hidden="true" />
            </Button>
            <Button type="button" variant="ghost" size="icon" disabled={index === count - 1} onClick={() => onMove(1)} aria-label={t("moveDown", { title: item.title })}>
              <ArrowDown aria-hidden="true" />
            </Button>
            <Button type="button" variant="ghost" size="icon" onClick={onRemove} aria-label={t("remove", { title: item.title })}>
              <Trash2 aria-hidden="true" />
            </Button>
          </div>
        )}
      </div>

      {editable && (
        <div className="flex flex-col gap-3 ps-0 sm:ps-14">
          <label className="flex min-h-12 items-center gap-3">
            <input type="checkbox" checked={item.isRequired} onChange={(e) => onChange({ isRequired: e.target.checked })} className="size-5 accent-primary" />
            <span>{t("required")}</span>
          </label>
          {earlier.length > 0 && (
            <fieldset className="flex flex-col gap-1">
              <legend className="mb-1 text-sm font-medium">{t("prerequisites")}</legend>
              <div className="flex flex-wrap gap-x-4">
                {earlier.map((e) => (
                  <label key={e.moduleId} className="flex min-h-12 items-center gap-2">
                    <input
                      type="checkbox"
                      className="size-5 accent-primary"
                      checked={item.prerequisiteModuleIds.includes(e.moduleId)}
                      onChange={(ev) =>
                        onChange({
                          prerequisiteModuleIds: ev.target.checked ? [...item.prerequisiteModuleIds, e.moduleId] : item.prerequisiteModuleIds.filter((p) => p !== e.moduleId),
                        })
                      }
                    />
                    <span className="text-sm">{e.title}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          {examDefaults && (
            <fieldset className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <legend className="mb-1 text-sm font-medium">{t("examSettings")}</legend>
              {fields.map((f) => (
                <label key={f} className="flex flex-col gap-1">
                  <span className="text-sm">{t(`settings.${f}`)}</span>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={item.settings[f] ?? ""}
                    placeholder={t("defaultValue", { value: String((examDefaults as Record<string, unknown>)[f]) })}
                    onChange={(e) => setSetting(f, e.target.value === "" ? undefined : Number(e.target.value))}
                  />
                </label>
              ))}
              {item.kind === "theory_exam" && (
                <label className="flex flex-col gap-1">
                  <span className="text-sm">{t("settings.proctorRequired")}</span>
                  <NativeSelect
                    value={item.settings.proctorRequired === undefined ? "" : String(item.settings.proctorRequired)}
                    onChange={(e) => setSetting("proctorRequired", e.target.value === "" ? undefined : e.target.value === "true")}
                  >
                    <option value="">{t("defaultValue", { value: defaults.theory_exam.proctorRequired ? t("yes") : t("no") })}</option>
                    <option value="true">{t("yes")}</option>
                    <option value="false">{t("no")}</option>
                  </NativeSelect>
                </label>
              )}
            </fieldset>
          )}
        </div>
      )}
    </li>
  );
}
