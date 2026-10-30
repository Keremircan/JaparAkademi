"use client";

import { ArrowDown, ArrowUp, Plus, Save, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { FormError } from "@/components/forms/form-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { saveTasksAction, setModuleContentsAction } from "../actions";
import { ContentPicker, type PickedContent } from "./content-picker";

function move<T>(list: T[], i: number, dir: -1 | 1): T[] {
  const next = [...list];
  const [x] = next.splice(i, 1);
  next.splice(i + dir, 0, x!);
  return next;
}

function RowControls({ i, n, onMove, onRemove, label }: { i: number; n: number; onMove: (d: -1 | 1) => void; onRemove: () => void; label: string }) {
  const t = useTranslations("modules.items");
  return (
    <div className="flex shrink-0 gap-1">
      <Button type="button" variant="ghost" size="icon" disabled={i === 0} onClick={() => onMove(-1)} aria-label={t("moveUp", { item: label })}>
        <ArrowUp aria-hidden="true" />
      </Button>
      <Button type="button" variant="ghost" size="icon" disabled={i === n - 1} onClick={() => onMove(1)} aria-label={t("moveDown", { item: label })}>
        <ArrowDown aria-hidden="true" />
      </Button>
      <Button type="button" variant="ghost" size="icon" onClick={onRemove} aria-label={t("remove", { item: label })}>
        <Trash2 aria-hidden="true" />
      </Button>
    </div>
  );
}

function useSave() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      setError(null);
      setSaved(false);
      const r = await fn();
      if (r.ok) setSaved(true);
      else setError(r.error ?? "unexpected");
    });
  return { pending, error, saved, run, reset: () => setSaved(false) };
}

/** Teorik modülün içerik listesi. */
export function ModuleContentsEditor({ moduleId, initial }: { moduleId: string; initial: (PickedContent & { published: boolean; archived: boolean })[] }) {
  const t = useTranslations("modules.items");
  const tc = useTranslations("common");
  const [items, setItems] = useState<PickedContent[]>(initial);
  const s = useSave();
  const warn = new Map(initial.map((i) => [i.id, i.archived || !i.published]));
  const update = (next: PickedContent[]) => {
    setItems(next);
    s.reset();
  };

  return (
    <section aria-labelledby="contents-heading" className="flex flex-col gap-3">
      <h2 id="contents-heading" className="text-lg font-semibold">
        {t("contentsHeading")}
      </h2>
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed p-4 text-muted-foreground">{t("contentsEmpty")}</p>
      ) : (
        <ol className="flex flex-col divide-y rounded-xl border">
          {items.map((c, i) => (
            <li key={c.id} className="flex min-h-14 items-center gap-3 px-3 py-2">
              <span className="w-6 text-sm text-muted-foreground">{i + 1}.</span>
              <span className="min-w-0 flex-1">
                <span className="block">{c.title}</span>
                {warn.get(c.id) && <span className="block text-sm text-destructive">{t("contentUnavailable")}</span>}
              </span>
              <RowControls i={i} n={items.length} label={c.title} onMove={(d) => update(move(items, i, d))} onRemove={() => update(items.filter((x) => x.id !== c.id))} />
            </li>
          ))}
        </ol>
      )}
      <ContentPicker exclude={items.map((i) => i.id)} onPick={(c) => update([...items, c])} />
      <FormError error={s.error} />
      <div className="flex items-center gap-3">
        <Button type="button" disabled={s.pending} onClick={() => s.run(() => setModuleContentsAction(moduleId, items.map((i) => i.id)))}>
          <Save aria-hidden="true" />
          {s.pending ? tc("saving") : tc("save")}
        </Button>
        <span role="status" className="text-sm text-muted-foreground">
          {s.saved ? tc("saved") : ""}
        </span>
      </div>
    </section>
  );
}

type Task = { key: string; id?: string; title: string; description: string; isCritical: boolean; competencyId: string };
let seq = 0;

/** Pratik modülün görev listesi (FG-5.1). */
export function ModuleTasksEditor({
  moduleId,
  initial,
  competencies,
}: {
  moduleId: string;
  initial: { id: string; title: string; description: string | null; isCritical: boolean; competencyId: string | null }[];
  /** Görevin bağlanabileceği yetkinlikler (karar #219) */
  competencies: { id: string; name: string }[];
}) {
  const t = useTranslations("modules.items");
  const tc = useTranslations("common");
  const [tasks, setTasks] = useState<Task[]>(() => initial.map((x) => ({ ...x, key: x.id, description: x.description ?? "", competencyId: x.competencyId ?? "" })));
  const s = useSave();
  const update = (next: Task[]) => {
    setTasks(next);
    s.reset();
  };
  const change = (i: number, patch: Partial<Task>) => update(tasks.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <section aria-labelledby="tasks-heading" className="flex flex-col gap-3">
      <h2 id="tasks-heading" className="text-lg font-semibold">
        {t("tasksHeading")}
      </h2>
      <p className="text-sm text-muted-foreground">{t("tasksHint")}</p>
      <ol className="flex flex-col gap-3">
        {tasks.map((task, i) => (
          <li key={task.key} className="flex flex-col gap-3 rounded-xl border p-4">
            <div className="flex items-center gap-2">
              <span className="flex-1 font-medium">{t("taskN", { n: i + 1 })}</span>
              <RowControls i={i} n={tasks.length} label={task.title || t("taskN", { n: i + 1 })} onMove={(d) => update(move(tasks, i, d))} onRemove={() => update(tasks.filter((_, j) => j !== i))} />
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">{t("taskTitle")}</span>
              <Input value={task.title} maxLength={200} onChange={(e) => change(i, { title: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">
                {t("taskDescription")} <span className="font-normal text-muted-foreground">({tc("optional")})</span>
              </span>
              <Textarea rows={2} maxLength={2000} value={task.description} onChange={(e) => change(i, { description: e.target.value })} />
            </label>
            <label className="flex min-h-12 items-center gap-3">
              <input type="checkbox" checked={task.isCritical} onChange={(e) => change(i, { isCritical: e.target.checked })} className="size-5 accent-primary" />
              <span>{t("taskCritical")}</span>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">
                {t("taskCompetency")} <span className="font-normal text-muted-foreground">({tc("optional")})</span>
              </span>
              <NativeSelect value={task.competencyId} onChange={(e) => change(i, { competencyId: e.target.value })}>
                <option value="">{t("noCompetency")}</option>
                {competencies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </NativeSelect>
              <span className="text-sm text-muted-foreground">{t("taskCompetencyHint")}</span>
            </label>
          </li>
        ))}
      </ol>
      <Button type="button" variant="outline" className="self-start" onClick={() => update([...tasks, { key: `n${++seq}`, title: "", description: "", isCritical: false, competencyId: "" }])}>
        <Plus aria-hidden="true" />
        {t("addTask")}
      </Button>
      <FormError error={s.error} />
      <div className="flex items-center gap-3">
        <Button
          type="button"
          disabled={s.pending}
          onClick={() =>
            s.run(() => saveTasksAction(moduleId, tasks.map((x) => ({
                  id: x.id,
                  title: x.title,
                  description: x.description.trim() || null,
                  isCritical: x.isCritical,
                  competencyId: x.competencyId || null,
                })),))
          }
        >
          <Save aria-hidden="true" />
          {s.pending ? tc("saving") : tc("save")}
        </Button>
        <span role="status" className="text-sm text-muted-foreground">
          {s.saved ? tc("saved") : ""}
        </span>
      </div>
    </section>
  );
}
