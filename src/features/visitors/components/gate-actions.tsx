"use client";

import { LogIn, LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Field } from "@/components/forms/field";
import { FormError } from "@/components/forms/form-error";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { checkInAction, checkOutAction } from "../actions";

/**
 * Kapı satırı eylemleri (karar #148–151): giriş paneli (kimlik no yoksa kimlik, kendi kaydında ev sahibi,
 * kart no, KKD) ve çıkış (kart iadesi). Kara liste eşleşmesinde sunucu girişi reddeder.
 */
export function GateActions({
  visitId,
  mode,
  needsId,
  needsHost,
  hostWritten,
  ppeItems,
}: {
  visitId: string;
  mode: "in" | "out";
  needsId: boolean;
  needsHost: boolean;
  hostWritten: string;
  ppeItems: string[];
}) {
  const t = useTranslations("visitors.gate");
  const tf = useTranslations("visitors.form");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [badge, setBadge] = useState("");
  const [ppe, setPpe] = useState<string[]>([]);
  const [host, setHost] = useState("");
  const [idKind, setIdKind] = useState<"tc" | "passport">("tc");
  const [idNumber, setIdNumber] = useState("");
  const [idCountry, setIdCountry] = useState("");
  const [returned, setReturned] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const p = (k: string) => `gate-${visitId}-${k}`;

  if (!open)
    return (
      <div className="flex flex-col gap-2">
        <Button variant={mode === "in" ? "default" : "outline"} onClick={() => setOpen(true)}>
          {mode === "in" ? <LogIn aria-hidden="true" /> : <LogOut aria-hidden="true" />}
          {mode === "in" ? t("checkIn") : t("checkOut")}
        </Button>
        {notice && (
          <p role={notice.tone === "bad" ? "alert" : "status"} className={notice.tone === "bad" ? "text-destructive" : "text-emerald-700 dark:text-emerald-400"}>
            {notice.text}
          </p>
        )}
      </div>
    );

  if (mode === "out")
    return (
      <div className="flex w-full flex-col gap-3 rounded-xl bg-muted/40 p-4">
        <label htmlFor={p("returned")} className="flex min-h-12 cursor-pointer items-center gap-3">
          <Checkbox id={p("returned")} className="size-6" checked={returned} onCheckedChange={(v) => setReturned(v === true)} />
          <span>{t("badgeReturned")}</span>
        </label>
        <FormError error={error} />
        <div className="flex flex-wrap gap-3">
          <Button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                const r = await checkOutAction(visitId, returned);
                if (!r.ok) return setError(r.error);
                setOpen(false);
                setNotice({ tone: "ok", text: t("checkedOut") });
              })
            }
          >
            <LogOut aria-hidden="true" />
            {t("confirmCheckOut")}
          </Button>
          <Button variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
            {tc("cancel")}
          </Button>
        </div>
      </div>
    );

  return (
    <div className="flex w-full flex-col gap-4 rounded-xl bg-muted/40 p-4">
      <h3 className="font-semibold">{t("checkInTitle")}</h3>
      {needsHost && (
        <Field id={p("host")} label={t("hostSicil")} hint={t("hostSicilHint", { name: hostWritten })}>
          <Input id={p("host")} maxLength={30} value={host} onChange={(e) => setHost(e.target.value)} className="max-w-56" aria-describedby={`${p("host")}-hint`} />
        </Field>
      )}
      {needsId && (
        <div className="grid gap-4 sm:grid-cols-[12rem_8rem_1fr]">
          <Field id={p("kind")} label={tf("idKind")}>
            <NativeSelect id={p("kind")} value={idKind} onChange={(e) => setIdKind(e.target.value as "tc" | "passport")}>
              <option value="tc">{tf("idTc")}</option>
              <option value="passport">{tf("idPassport")}</option>
            </NativeSelect>
          </Field>
          {idKind === "passport" && (
            <Field id={p("country")} label={tf("idCountry")}>
              <Input id={p("country")} maxLength={2} value={idCountry} onChange={(e) => setIdCountry(e.target.value.toUpperCase())} />
            </Field>
          )}
          <Field id={p("number")} label={tf("idNumber")}>
            <Input id={p("number")} autoComplete="off" maxLength={30} value={idNumber} onChange={(e) => setIdNumber(e.target.value)} />
          </Field>
        </div>
      )}
      <Field id={p("badge")} label={t("badgeNo")}>
        <Input id={p("badge")} maxLength={30} value={badge} onChange={(e) => setBadge(e.target.value)} className="max-w-56" />
      </Field>
      {ppeItems.length > 0 && (
        <fieldset>
          <legend className="mb-1 font-medium">{t("ppe")}</legend>
          <div className="flex flex-wrap gap-x-6">
            {ppeItems.map((item) => (
              <label key={item} className="flex min-h-12 cursor-pointer items-center gap-3">
                <Checkbox
                  className="size-6"
                  checked={ppe.includes(item)}
                  onCheckedChange={(v) => setPpe((x) => (v === true ? [...x, item] : x.filter((y) => y !== item)))}
                />
                <span>{item}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <FormError error={error} />
      <div className="flex flex-wrap gap-3">
        <Button
          disabled={pending || !badge.trim() || (needsId && !idNumber.trim()) || (needsHost && !host.trim())}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const r = await checkInAction(visitId, {
                badgeNo: badge,
                ppe,
                hostSicilNo: needsHost ? host : null,
                id: needsId ? { idKind, idNumber, idCountry: idKind === "passport" ? idCountry : null } : null,
              });
              if (!r.ok) return setError(r.error);
              setOpen(false);
              setNotice("denied" in r.data ? { tone: "bad", text: t("denied") } : { tone: "ok", text: t("checkedIn") });
            })
          }
        >
          <LogIn aria-hidden="true" />
          {t("confirmCheckIn")}
        </Button>
        <Button variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
          {tc("cancel")}
        </Button>
      </div>
    </div>
  );
}
