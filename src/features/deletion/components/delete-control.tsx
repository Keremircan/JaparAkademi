"use client";

import { Archive, Trash2, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { FormError } from "@/components/forms/form-error";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/features/shared/action-result";
import type { Blocker, DeleteKind, DeletionCheck } from "@/lib/deletion";
import { checkDeletionAction, deleteRecordAction, type AfterDelete } from "../actions";

/** Pencere metinlerinin konusu (`deletion.subjects.<konu>`): departman ve bölüm aynı türün iki konusudur. */
export type DeleteSubject =
  | "department"
  | "section"
  | "position"
  | "person"
  | "module"
  | "content"
  | "question"
  | "tag"
  | "competency"
  | "classroom_session"
  | "company"
  | "visit"
  | "device"
  | "legal_draft";

type View = DeletionCheck | { state: "error"; code: string; details?: unknown };

/**
 * "Sil" düğmesi ve penceresi (iş paketi 3.14, kararlar #283–288). Düğmeye basınca sunucu kaydı dener:
 * - bağlı kayıt varsa onları sayar ("Önce onları silin"), silme düğmesi çıkmaz;
 * - geçmiş kayıtlarda kullanıldıysa silinemez; verilmişse arşivleme/pasife alma düğmesi gösterilir;
 * - bağı yoksa "Silmek istediğinize emin misiniz?" sorulur ve onaylanınca silinir.
 */
export function DeleteControl({
  kind,
  id,
  subject,
  name,
  after = "refresh",
  onDeleted,
  archive,
  label,
  iconOnly = false,
  variant = "ghost",
  size = "default",
}: {
  kind: DeleteKind;
  id: string;
  subject: DeleteSubject;
  /** Onay sorusunda gösterilen ad. */
  name?: string;
  after?: AfterDelete;
  /** `after: "none"` iken silindikten sonra (ör. istemcideki listeden çıkarmak için). */
  onDeleted?: () => void;
  /** Geçmiş kaydı olan kayıt için arşivleme/pasife alma eylemi. */
  archive?: { action: () => Promise<ActionResult<unknown>>; label: string };
  label?: string;
  iconOnly?: boolean;
  variant?: "ghost" | "outline" | "destructive";
  size?: "default" | "sm";
}) {
  const t = useTranslations("deletion");
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View | null>(null);
  const [checking, startCheck] = useTransition();
  const [working, startWork] = useTransition();
  const buttonLabel = label ?? t("delete");
  // Konuya özel isteğe bağlı metinler (ör. pozisyonda kart taslağı notu, kişide geçmiş açıklaması)
  const optional = (key: "history" | "note") => {
    const k = `subjects.${subject}.${key}` as Parameters<typeof t>[0];
    return t.has(k) ? t(k) : null;
  };

  function check() {
    startCheck(async () => {
      const r = await checkDeletionAction(kind, id);
      setView(r.ok ? r.data : { state: "error", code: r.error, details: r.details });
      setOpen(true);
    });
  }

  function remove() {
    startWork(async () => {
      const r = await deleteRecordAction(kind, id, after);
      // Başka sayfaya yönlendiren eylem sonuç döndürmez
      if (!r || r.ok) {
        setOpen(false);
        onDeleted?.();
        return;
      }
      // Pencere açıkken başka biri bağlı kayıt eklediyse ya da kayıt kullanıldıysa
      if (r.error === "delete_blocked" && Array.isArray(r.details)) setView({ state: "blocked", blockers: r.details as Blocker[] });
      else if (r.error === "delete_in_history") setView({ state: "history" });
      else setView({ state: "error", code: r.error, details: r.details });
    });
  }

  function archiveIt() {
    if (!archive) return;
    startWork(async () => {
      const r = await archive.action();
      if (r.ok) setOpen(false);
      else setView({ state: "error", code: r.error, details: r.details });
    });
  }

  const pending = checking || working;
  const historyText = optional("history") ?? t("history");
  const note = optional("note");

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={iconOnly ? (size === "sm" ? "icon-sm" : "icon") : size}
        disabled={pending}
        onClick={check}
        aria-label={iconOnly || name ? `${buttonLabel}${name ? `: ${name}` : ""}` : undefined}
        className="text-destructive hover:text-destructive"
      >
        <Trash2 aria-hidden="true" />
        {!iconOnly && buttonLabel}
      </Button>
      {/* Pencere ilk denemeden sonra oluşturulur: uzun listelerde (organizasyon ağacı) her satırda kapalı pencere çizilmez */}
      {view && (
        <AlertDialog
          open={open}
          onOpenChange={(next) => {
            if (!working) setOpen(next);
          }}
        >
          <AlertDialogContent>
            {view?.state === "ok" && (
              <>
                <AlertDialogTitle>{t("confirmTitle")}</AlertDialogTitle>
                <AlertDialogDescription className="flex flex-col gap-2">
                  <span>{name ? t("confirmNamed", { name }) : t("confirm")}</span>
                  {note && <span>{note}</span>}
                </AlertDialogDescription>
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <AlertDialogClose render={<Button variant="outline" disabled={working} />}>{t("cancel")}</AlertDialogClose>
                  <Button type="button" variant="destructive" disabled={working} onClick={remove}>
                    <Trash2 aria-hidden="true" />
                    {working ? t("deleting") : t("confirmButton")}
                  </Button>
                </div>
              </>
            )}
            {view?.state === "blocked" && (
              <>
                <AlertDialogTitle>{t("blockedTitle")}</AlertDialogTitle>
                <AlertDialogDescription className="flex items-start gap-3 rounded-lg border border-amber-500/50 bg-amber-50 px-4 py-3 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
                  <TriangleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
                  {t(`subjects.${subject}.blocked`)}
                </AlertDialogDescription>
                <ul className="ml-5 list-disc text-sm">
                  {view.blockers.map((b) => (
                    <li key={b.kind}>{t(`blockers.${b.kind}`, { count: b.count })}</li>
                  ))}
                </ul>
                <div className="flex justify-end">
                  <AlertDialogClose render={<Button variant="outline" />}>{t("ok")}</AlertDialogClose>
                </div>
              </>
            )}
            {view?.state === "history" && (
              <>
                <AlertDialogTitle>{t("historyTitle")}</AlertDialogTitle>
                <AlertDialogDescription className="flex flex-col gap-2">
                  <span>{historyText}</span>
                  {archive && <span>{t("archiveHint", { action: archive.label })}</span>}
                </AlertDialogDescription>
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <AlertDialogClose render={<Button variant="outline" disabled={working} />}>{archive ? t("cancel") : t("ok")}</AlertDialogClose>
                  {archive && (
                    <Button type="button" disabled={working} onClick={archiveIt}>
                      <Archive aria-hidden="true" />
                      {archive.label}
                    </Button>
                  )}
                </div>
              </>
            )}
            {view?.state === "error" && (
              <>
                <AlertDialogTitle>{t("errorTitle")}</AlertDialogTitle>
                <FormError error={view.code} details={view.details} />
                <div className="flex justify-end">
                  <AlertDialogClose render={<Button variant="outline" />}>{t("ok")}</AlertDialogClose>
                </div>
              </>
            )}
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}
