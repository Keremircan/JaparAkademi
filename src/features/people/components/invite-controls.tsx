"use client";

import { Clock, Copy, Download, KeyRound, Mail, MessageCircle, Printer, Send } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useActionState, useState, type ReactNode } from "react";
import { FormError } from "@/components/forms/form-error";
import { keepValues } from "@/components/forms/keep-values";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/features/shared/action-result";
import { downloadBase64 } from "@/lib/download";
import { type InviteResult, reinviteAction } from "../actions";

type Channel = InviteResult["channel"];
const ICONS = { none: Clock, email: Mail, whatsapp: MessageCircle, print: Printer } as const;

/**
 * Davet kanalı seçimi (karar #185). E-posta gönderimi kapalıysa e-posta seçilemez (karar #191).
 * `allowNone`: personel eklerken "Şimdi davet etme" seçeneği (varsayılan, karar #198).
 */
export function ChannelPicker({ mailEnabled, allowNone = false }: { mailEnabled: boolean; allowNone?: boolean }) {
  const t = useTranslations("invite.channel");
  const [value, setValue] = useState<Channel | "none">(allowNone ? "none" : "print");
  const options = allowNone ? (["none", "email", "whatsapp", "print"] as const) : (["email", "whatsapp", "print"] as const);
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-base font-medium">{t("label")}</legend>
      {options.map((c) => {
        const Icon = ICONS[c];
        const disabled = c === "email" && !mailEnabled;
        return (
          <label
            key={c}
            className="flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border-2 p-3 has-checked:border-primary has-checked:bg-primary/5 has-disabled:cursor-not-allowed has-disabled:opacity-60"
          >
            <input
              type="radio"
              name="channel"
              value={c}
              className="mt-1 size-5 accent-primary"
              checked={value === c}
              disabled={disabled}
              onChange={() => setValue(c)}
            />
            <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
            <span>
              <span className="block font-medium">{t(c)}</span>
              <span className="block text-sm text-muted-foreground">{disabled ? t("emailDisabled") : t(`${c}Hint`)}</span>
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}

/** Davetten sonra kanala göre yapılacak iş: e-posta gitti / WhatsApp'ta gönder / kağıdı yazdır. */
export function InvitePanel({ title, invite, children }: { title: string; invite: InviteResult; children?: ReactNode }) {
  const t = useTranslations("invite.panel");
  const format = useFormatter();
  const [copied, setCopied] = useState(false);
  return (
    <div role="status" className="flex max-w-xl flex-col gap-4 rounded-xl border border-primary/30 bg-muted p-5">
      <h2 className="text-lg font-semibold">{title}</h2>
      {invite.channel === "email" && <p>{t("emailSent")}</p>}
      {invite.channel === "whatsapp" && invite.whatsappUrl && (
        <>
          <p>{t("whatsappIntro")}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="lg" nativeButton={false} render={<a href={invite.whatsappUrl} target="_blank" rel="noopener noreferrer" />}>
              <Send aria-hidden="true" />
              {t("whatsappOpen")}
            </Button>
            {invite.link && (
              <Button
                variant="outline"
                size="lg"
                onClick={() => {
                  void navigator.clipboard?.writeText(invite.link!).then(() => setCopied(true));
                }}
              >
                <Copy aria-hidden="true" />
                {copied ? t("copied") : t("copyLink")}
              </Button>
            )}
          </div>
        </>
      )}
      {invite.channel === "print" && (
        <>
          <p>{t("printIntro")}</p>
          <div>
            <p className="text-sm text-muted-foreground">{t("code")}</p>
            <p className="font-mono text-3xl tracking-widest" data-testid="invite-code">
              {invite.code}
            </p>
          </div>
          {invite.sheetPdf && (
            <Button
              variant="outline"
              size="lg"
              className="self-start"
              onClick={() => downloadBase64(`etkinlestirme-${invite.sicilNo}.pdf`, invite.sheetPdf!, "application/pdf")}
            >
              <Download aria-hidden="true" />
              {t("printSheet")}
            </Button>
          )}
        </>
      )}
      <p className="text-sm text-muted-foreground">
        {t("expires", { date: format.dateTime(new Date(invite.expiresAt), { dateStyle: "medium", timeStyle: "short" }) })}
      </p>
      {children}
    </div>
  );
}

/**
 * Kişi sayfasında "Şifreyi sıfırla" (etkin hesap) ya da "Davet gönder" (etkinleşmemiş hesap; iş paketi 3.7, karar #259).
 * Düğme kanal seçimini açar; sıfırlamada mevcut şifrenin geçersiz olacağı ayrıca onaylatılır.
 */
export function ResetControl({ userId, mailEnabled, mode }: { userId: string; mailEnabled: boolean; mode: "reset" | "invite" }) {
  const t = useTranslations("invite.reset");
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ActionResult<InviteResult> | null, FormData>(reinviteAction.bind(null, userId), null);
  // Sonuç sayfa yenilendikten sonra da kalır (basılı kod yalnızca bir kez gösterilir)
  if (state?.ok) return <InvitePanel title={t(state.data.purpose === "reset" ? "doneReset" : "doneInvite")} invite={state.data} />;
  const Icon = mode === "reset" ? KeyRound : Send;
  const label = t(mode === "reset" ? "button" : "inviteButton");
  if (!open) {
    return (
      <div className="flex flex-col items-start gap-2">
        <Button size="lg" onClick={() => setOpen(true)}>
          <Icon aria-hidden="true" />
          {label}
        </Button>
        <p className="text-sm text-muted-foreground">{t(mode === "reset" ? "hint" : "inviteHint")}</p>
      </div>
    );
  }
  const submit = keepValues(action);
  return (
    <form
      action={submit.action}
      className="flex max-w-xl flex-col gap-4"
      onSubmit={(e) => {
        if (mode === "reset" && !window.confirm(t("confirm"))) return e.preventDefault();
        submit.onSubmit(e);
      }}
    >
      <h3 className="flex items-center gap-2 text-base font-semibold">
        <Icon aria-hidden="true" className="size-5" />
        {label}
      </h3>
      <p className="text-sm text-muted-foreground">{t("channelIntro")}</p>
      <ChannelPicker mailEnabled={mailEnabled} />
      {state && !state.ok && <FormError error={state.error} details={state.details} />}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="lg" disabled={pending}>
          {t("submit")}
        </Button>
        <Button type="button" variant="outline" size="lg" onClick={() => setOpen(false)}>
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}
