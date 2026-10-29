"use client";

import { Copy, Download, Mail, MessageCircle, Printer, Send } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useActionState, useState, type ReactNode } from "react";
import { FormError } from "@/components/forms/form-error";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/features/shared/action-result";
import { downloadBase64 } from "@/lib/download";
import { type InviteResult, reinviteAction } from "../actions";

type Channel = InviteResult["channel"];
const ICONS = { email: Mail, whatsapp: MessageCircle, print: Printer } as const;

/** Davet kanalı seçimi (karar #185). E-posta gönderimi kapalıysa e-posta seçilemez (karar #191). */
export function ChannelPicker({ mailEnabled, defaultChannel = "print" }: { mailEnabled: boolean; defaultChannel?: Channel }) {
  const t = useTranslations("invite.channel");
  const [value, setValue] = useState<Channel>(defaultChannel);
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-base font-medium">{t("label")}</legend>
      {(["email", "whatsapp", "print"] as const).map((c) => {
        const Icon = ICONS[c];
        const disabled = c === "email" && !mailEnabled;
        return (
          <label
            key={c}
            className="flex min-h-14 cursor-pointer items-start gap-3 rounded-xl border-2 p-3 has-checked:border-primary has-checked:bg-primary/5 has-disabled:cursor-not-allowed has-disabled:opacity-60"
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
    <div role="status" className="flex max-w-xl flex-col gap-4 rounded-2xl border border-primary/30 bg-muted p-6">
      <h2 className="text-xl font-semibold">{title}</h2>
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

/** Kişi kaydında "Yeniden davet" (şifre sıfırlamanın yerini alır). */
export function ReinviteControl({ userId, mailEnabled }: { userId: string; mailEnabled: boolean }) {
  const t = useTranslations("invite");
  const [state, action, pending] = useActionState<ActionResult<InviteResult> | null, FormData>(reinviteAction.bind(null, userId), null);
  if (state?.ok) return <InvitePanel title={t("panel.reinvitedTitle")} invite={state.data} />;
  return (
    <form
      action={action}
      className="flex max-w-xl flex-col gap-4"
      onSubmit={(e) => {
        if (!window.confirm(t("reinvite.confirm"))) e.preventDefault();
      }}
    >
      <h3 className="text-base font-semibold">{t("reinvite.title")}</h3>
      <p className="text-sm text-muted-foreground">{t("reinvite.hint")}</p>
      <ChannelPicker mailEnabled={mailEnabled} />
      {state && !state.ok && <FormError error={state.error} details={state.details} />}
      <Button type="submit" size="lg" disabled={pending} className="self-start">
        {t("reinvite.submit")}
      </Button>
    </form>
  );
}
