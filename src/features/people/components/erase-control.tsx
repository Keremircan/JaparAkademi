"use client";

import { Trash2, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { Field } from "@/components/forms/field";
import { FormError } from "@/components/forms/form-error";
import { keepValues } from "@/components/forms/keep-values";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/features/shared/action-result";
import { cleanEraseReason, confirmationMatches, ERASE_REASON_MAX } from "@/lib/erasure";
import { erasePersonAction } from "../actions";

/**
 * Kişiyi kalıcı silme (üst yönetici, kararlar #264–267). Pencere uyarıyı, silinecekleri ve kalacakları gösterir;
 * "Kalıcı olarak sil" gerekçe ve "<Ad Soyad> silmeyi onaylıyorum" yazılana kadar pasiftir. Sunucu da denetler.
 */
export function EraseControl({ userId, fullName }: { userId: string; fullName: string }) {
  const t = useTranslations("admin.people.erase");
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(async (prev, formData) => {
    const result = await erasePersonAction(userId, prev, formData);
    // Sayfa kişide kalır; "verileri silindi" bilgisi sayfanın başında görünsün (telefonda pencere en alttaydı)
    if (result.ok) window.scrollTo({ top: 0 });
    return result;
  }, null);
  const phrase = t("phrase", { name: fullName });
  const ready = cleanEraseReason(reason) !== null && confirmationMatches(typed, phrase);

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
        if (!next) {
          setReason("");
          setTyped("");
        }
      }}
    >
      <AlertDialogTrigger render={<Button variant="destructive" className="self-start" />}>
        <Trash2 aria-hidden="true" />
        {t("open")}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogTitle>{t("title")}</AlertDialogTitle>
        <AlertDialogDescription className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 font-semibold text-destructive">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          {t("warning")}
        </AlertDialogDescription>
        <dl className="flex flex-col gap-3 text-sm">
          <div>
            <dt className="font-semibold">{t("deletedTitle")}</dt>
            <dd className="text-muted-foreground">{t("deleted")}</dd>
          </div>
          <div>
            <dt className="font-semibold">{t("keptTitle")}</dt>
            <dd className="text-muted-foreground">{t("kept")}</dd>
          </div>
        </dl>
        <form {...keepValues(formAction)} className="flex flex-col gap-4">
          <Field id="erase-reason" label={t("reason")} hint={t("reasonHint")}>
            <Textarea
              id="erase-reason"
              name="reason"
              rows={2}
              maxLength={ERASE_REASON_MAX}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              aria-describedby="erase-reason-hint"
              className="min-h-20"
            />
          </Field>
          <div className="flex flex-col gap-2">
            <Label htmlFor="erase-confirmation" className="block text-sm font-normal pointer-fine:text-base">
              {t.rich("confirmLabel", { phrase, b: (chunks) => <strong className="font-semibold">{chunks}</strong> })}
            </Label>
            <Input
              id="erase-confirmation"
              name="confirmation"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
            />
          </div>
          {state && !state.ok && <FormError error={state.error} details={state.details} />}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialogClose render={<Button variant="outline" disabled={pending} />}>{t("cancel")}</AlertDialogClose>
            <Button type="submit" variant="destructive" disabled={!ready || pending}>
              <Trash2 aria-hidden="true" />
              {pending ? t("submitting") : t("submit")}
            </Button>
          </div>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
