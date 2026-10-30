"use client";

import { CheckCircle2, Mail, MessageCircle, Printer, Send, Sparkles } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useMemo, useState, useTransition } from "react";
import { FormError } from "@/components/forms/form-error";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useRouter } from "@/i18n/navigation";
import { downloadBase64 } from "@/lib/download";
import { createInvitationBatchAction, markInviteSharedAction } from "../actions";

type Mode = "smart" | "email" | "whatsapp" | "print";
const MODE_ICONS = { smart: Sparkles, email: Mail, whatsapp: MessageCircle, print: Printer } as const;

export type InviteeItem = {
  userId: string;
  sicilNo: string;
  fullName: string;
  place: string | null;
  hasEmail: boolean;
  hasPhone: boolean;
  stateLabel: string;
  pending: boolean;
};

/** Davetler ekranı: kişi seçimi + kanal kipi + "Davet oluştur" (kararlar #199, #200). */
export function InviteeSelector({ items, mailEnabled, max }: { items: InviteeItem[]; mailEnabled: boolean; max: number }) {
  const t = useTranslations("invite.batch");
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<Mode>("smart");
  const [error, setError] = useState<{ code: string; details?: unknown } | null>(null);
  const [pending, startTransition] = useTransition();
  const allSelected = items.length > 0 && selected.size === items.length;
  const pendingCount = useMemo(() => items.filter((i) => i.pending && selected.has(i.userId)).length, [items, selected]);

  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const submit = () =>
    startTransition(async () => {
      setError(null);
      const r = await createInvitationBatchAction([...selected], mode);
      if (!r.ok) return setError({ code: r.error, details: r.details });
      if (r.data.sheetPdf) downloadBase64(`etkinlestirme-kagitlari-${new Date().toISOString().slice(0, 10)}.pdf`, r.data.sheetPdf, "application/pdf");
      router.push(`/admin/people/invites/${r.data.batchId}${r.data.sheetPdf ? "?pdf=1" : ""}`);
    });

  if (items.length === 0) return <p className="rounded-2xl border p-5 text-muted-foreground">{t("empty")}</p>;

  return (
    <div className="flex flex-col gap-5">
      <div className="overflow-x-auto rounded-2xl border">
        <table className="w-full text-left">
          <thead className="border-b bg-muted/50 text-sm">
            <tr>
              <th scope="col" className="w-14 p-3">
                <Checkbox
                  aria-label={t("selectAll")}
                  checked={allSelected}
                  onCheckedChange={(on) => setSelected(on ? new Set(items.map((i) => i.userId)) : new Set())}
                  className="size-6"
                />
              </th>
              <th scope="col" className="p-3">{t("colPerson")}</th>
              <th scope="col" className="hidden p-3 md:table-cell">{t("colUnit")}</th>
              <th scope="col" className="p-3">{t("colContact")}</th>
              <th scope="col" className="hidden p-3 sm:table-cell">{t("colState")}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map((i) => (
              <tr key={i.userId} className={selected.has(i.userId) ? "bg-primary/5" : undefined}>
                <td className="p-3">
                  <Checkbox
                    aria-label={`${i.fullName} (${i.sicilNo})`}
                    checked={selected.has(i.userId)}
                    onCheckedChange={(on) => toggle(i.userId, !!on)}
                    className="size-6"
                  />
                </td>
                <td className="p-3">
                  <span className="block font-medium">{i.fullName}</span>
                  <span className="block text-sm text-muted-foreground">{i.sicilNo}</span>
                </td>
                <td className="hidden p-3 text-sm text-muted-foreground md:table-cell">{i.place ?? "—"}</td>
                <td className="p-3 text-sm">
                  {[i.hasEmail && t("hasEmail"), i.hasPhone && t("hasPhone")].filter(Boolean).join(", ") || t("noContact")}
                </td>
                <td className="hidden p-3 text-sm sm:table-cell">{i.stateLabel}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-base font-medium">{t("modeLabel")}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {(["smart", "whatsapp", "print", "email"] as const).map((m) => {
            const Icon = MODE_ICONS[m];
            const disabled = m === "email" && !mailEnabled;
            return (
              <label
                key={m}
                className="flex min-h-14 cursor-pointer items-start gap-3 rounded-xl border-2 p-3 has-checked:border-primary has-checked:bg-primary/5 has-disabled:cursor-not-allowed has-disabled:opacity-60"
              >
                <input
                  type="radio"
                  name="invite-mode"
                  className="mt-1 size-5 accent-primary"
                  checked={mode === m}
                  disabled={disabled}
                  onChange={() => setMode(m)}
                />
                <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
                <span>
                  <span className="block font-medium">{t(`mode.${m}`)}</span>
                  <span className="block text-sm text-muted-foreground">{t(`mode.${m}Hint`)}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {pendingCount > 0 && (
        <p role="note" className="rounded-xl border border-amber-500/50 bg-amber-500/10 p-3 text-amber-900 dark:text-amber-200">
          {t("pendingWarning", { count: pendingCount })}
        </p>
      )}
      {error && <FormError error={error.code} details={error.details} />}
      <div className="flex flex-wrap items-center gap-3">
        <Button size="lg" disabled={pending || selected.size === 0} onClick={submit}>
          <Send aria-hidden="true" />
          {pending ? t("creating") : t("create")}
        </Button>
        <span role="status" className="text-muted-foreground">
          {t("selected", { count: selected.size })}
        </span>
        <span className="text-sm text-muted-foreground">{t("max", { max })}</span>
      </div>
    </div>
  );
}

export type SendRow = {
  invitationId: string;
  fullName: string;
  sicilNo: string;
  state: "open" | "used" | "revoked" | "expired";
  sharedAt: string | null;
  whatsappUrl: string | null;
};

/** WhatsApp gönderim listesi (karar #201): sırayla gönder, satır "Gönderildi" olur; ilerleme üstte. */
export function WhatsAppSendList({ rows }: { rows: SendRow[] }) {
  const t = useTranslations("invite.batch");
  const format = useFormatter();
  const [shared, setShared] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(rows.filter((r) => r.sharedAt).map((r) => [r.invitationId, true])),
  );
  const done = rows.filter((r) => shared[r.invitationId]).length;
  const next = rows.find((r) => r.state === "open" && r.whatsappUrl && !shared[r.invitationId]);

  if (rows.length === 0) return <p className="text-muted-foreground">{t("noWhatsapp")}</p>;

  return (
    <div className="flex flex-col gap-3">
      <p role="status" className="text-lg font-medium">
        {t("progress", { shared: done, total: rows.length })}
      </p>
      <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div className="h-full bg-primary transition-all" style={{ width: `${Math.round((done / rows.length) * 100)}%` }} />
      </div>
      <ul className="flex flex-col divide-y rounded-2xl border">
        {rows.map((r) => {
          const isShared = !!shared[r.invitationId];
          const canSend = r.state === "open" && !!r.whatsappUrl;
          return (
            <li
              key={r.invitationId}
              className={`flex flex-wrap items-center justify-between gap-3 p-4 ${next?.invitationId === r.invitationId ? "bg-primary/5" : ""}`}
            >
              <span>
                <span className="block font-medium">{r.fullName}</span>
                <span className="block text-sm text-muted-foreground">
                  {r.sicilNo}
                  {r.state !== "open" && ` · ${t(`rowState.${r.state}`)}`}
                  {isShared && r.sharedAt && ` · ${format.dateTime(new Date(r.sharedAt), { dateStyle: "short", timeStyle: "short" })}`}
                </span>
              </span>
              <span className="flex items-center gap-2">
                {isShared && (
                  <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 aria-hidden="true" className="size-5" />
                    {t("sent")}
                  </span>
                )}
                {canSend && (
                  <Button
                    size="lg"
                    variant={isShared ? "outline" : "default"}
                    nativeButton={false}
                    render={
                      <a
                        href={r.whatsappUrl!}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => {
                          setShared((s) => ({ ...s, [r.invitationId]: true }));
                          void markInviteSharedAction(r.invitationId);
                        }}
                      />
                    }
                  >
                    <MessageCircle aria-hidden="true" />
                    {isShared ? t("sendAgain") : t("send")}
                  </Button>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
