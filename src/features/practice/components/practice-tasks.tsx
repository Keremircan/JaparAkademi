"use client";

import { ArrowDown, ArrowUp, Check, Star } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { FormError } from "@/components/forms/form-error";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import type { AssetInfo } from "@/server/services/media";
import type { PracticeTaskView } from "@/server/services/practice";
import type { PracticeLevel } from "@/server/state/practice";
import { markTaskAction } from "../actions";
import { PhotoList } from "./photo-list";

const LEVELS: PracticeLevel[] = ["demonstrated", "supervised", "independent"];

/** Seviye göstergesi: üç adım, ikon + metin (yalnızca renge dayanmaz). */
export function LevelSteps({ level }: { level: PracticeLevel | null }) {
  const t = useTranslations("practice.levels");
  const rank = level ? LEVELS.indexOf(level) : -1;
  return (
    <span className="flex items-center gap-2">
      <span className="flex gap-1" aria-hidden="true">
        {LEVELS.map((l, i) => (
          <span key={l} className={`h-2.5 w-6 rounded-full ${i <= rank ? (rank === 2 ? "bg-emerald-600" : "bg-primary") : "bg-muted"}`} />
        ))}
      </span>
      <span className="text-sm font-medium">{level ? t(level) : t("none")}</span>
    </span>
  );
}

/** Görev listesi (FG-5.1/5.2): kursiyer okur; eğitmen/bölüm sorumlusu seviye işaretler. */
export function PracticeTasks({ assignmentModuleId, tasks, canMark }: { assignmentModuleId: string; tasks: PracticeTaskView[]; canMark: boolean }) {
  return (
    <ol className="flex flex-col gap-3">
      {tasks.map((task, i) => (
        <TaskCard key={task.taskId} index={i} task={task} assignmentModuleId={assignmentModuleId} canMark={canMark} />
      ))}
    </ol>
  );
}

function TaskCard({ task, index, assignmentModuleId, canMark }: { task: PracticeTaskView; index: number; assignmentModuleId: string; canMark: boolean }) {
  const t = useTranslations("practice");
  const format = useFormatter();
  const [mode, setMode] = useState<"up" | "down" | null>(null);
  const [note, setNote] = useState("");
  const [down, setDown] = useState<PracticeLevel | "">("");
  const [photos, setPhotos] = useState<AssetInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(level: PracticeLevel) {
    startTransition(async () => {
      setError(null);
      const r = await markTaskAction({ assignmentModuleId, taskId: task.taskId, level, note: note.trim() || null, photoAssetIds: photos.map((p) => p.id) });
      if (!r.ok) return setError(r.error);
      setMode(null);
      setNote("");
      setDown("");
      setPhotos([]);
    });
  }

  const headingId = `task-${task.taskId}`;
  return (
    <li className="flex flex-col gap-3 rounded-2xl border p-4" aria-labelledby={headingId}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        <div className="min-w-0 flex-1">
          <h3 id={headingId} className="font-medium">
            {index + 1}. {task.title}
            {task.isCritical && (
              <span className="ms-2 inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 align-middle text-xs">
                <Star aria-hidden="true" className="size-3" />
                {t("critical")}
              </span>
            )}
          </h3>
          {task.description && <p className="text-sm text-muted-foreground">{task.description}</p>}
        </div>
        <LevelSteps level={task.level} />
      </div>

      {canMark && mode === null && (
        <div className="flex flex-wrap gap-2">
          {task.next && (
            <Button onClick={() => setMode("up")}>
              <ArrowUp aria-hidden="true" />
              {t("markAs", { level: t(`levels.${task.next}`) })}
            </Button>
          )}
          {task.lower.length > 0 && (
            <Button variant="outline" onClick={() => setMode("down")}>
              <ArrowDown aria-hidden="true" />
              {t("lower")}
            </Button>
          )}
        </div>
      )}

      {canMark && mode !== null && (
        <div className="flex flex-col gap-3 rounded-xl bg-muted/40 p-3">
          {mode === "down" && (
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">{t("lowerTo")}</span>
              <NativeSelect value={down} onChange={(e) => setDown(e.target.value as PracticeLevel)}>
                <option value="">{t("choose")}</option>
                {task.lower.map((l) => (
                  <option key={l} value={l}>
                    {t(`levels.${l}`)}
                  </option>
                ))}
              </NativeSelect>
            </label>
          )}
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">{mode === "down" ? t("reason") : t("note")}</span>
            <Textarea value={note} maxLength={1000} rows={2} onChange={(e) => setNote(e.target.value)} />
          </label>
          <PhotoList label={t("photo")} value={photos} onChange={setPhotos} />
          <FormError error={error} />
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={pending || (mode === "down" && (!down || note.trim().length < 3))}
              onClick={() => submit(mode === "up" ? task.next! : (down as PracticeLevel))}
            >
              <Check aria-hidden="true" />
              {mode === "up" ? t("confirmUp", { level: t(`levels.${task.next!}`) }) : t("confirmDown")}
            </Button>
            <Button variant="ghost" disabled={pending} onClick={() => setMode(null)}>
              {t("cancel")}
            </Button>
          </div>
        </div>
      )}

      {task.history.length > 0 && (
        <details>
          <summary className="flex min-h-12 cursor-pointer items-center text-sm text-muted-foreground">{t("history", { count: task.history.length })}</summary>
          <ul className="flex flex-col gap-2 border-s-2 ps-3 text-sm">
            {task.history.map((h) => (
              <li key={h.id} className="flex flex-col gap-1">
                <span>
                  <span className="font-medium">{t(`levels.${h.level}`)}</span>
                  {h.direction === "down" && ` · ${t("lowered")}`} · {h.source === "exam_fail" ? t("examFail") : h.source === "readiness" ? t("readinessReopen") : h.markedByName} ·{" "}
                  {format.dateTime(h.markedAt, { dateStyle: "medium", timeStyle: "short" })}
                </span>
                {h.note && <span className="text-muted-foreground">{h.note}</span>}
                {h.photoAssetIds.length > 0 && (
                  <span className="flex flex-wrap gap-2">
                    {h.photoAssetIds.map((id) => (
                      <a key={id} href={`/api/media/${id}/file`} target="_blank" rel="noreferrer" aria-label={t("openPhoto")}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/api/media/${id}/thumb`} alt="" className="size-14 rounded-md border object-cover" />
                      </a>
                    ))}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </li>
  );
}
