"use client";

import { Plus, Save, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { FormError } from "@/components/forms/form-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MediaField } from "@/features/content/components/media-upload";
import type { AssetInfo } from "@/server/services/media";
import { saveSignatoriesAction } from "../actions";

type Row = { key: number; name: string; title: string; signature: AssetInfo | null };

/** Belgelerdeki imza yetkilileri (karar #79): en fazla 3 kişi; taranmış imza PNG/JPG. */
export function SignatoriesForm({ initial }: { initial: { name: string; title: string; signature: AssetInfo | null }[] }) {
  const t = useTranslations("certificates.signatories");
  const tc = useTranslations("common");
  const [rows, setRows] = useState<Row[]>(initial.map((r, i) => ({ ...r, key: i })));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const set = (key: number, patch: Partial<Row>) => {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    setSaved(false);
  };

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      {rows.map((r, i) => (
        <fieldset key={r.key} className="flex flex-col gap-3 rounded-2xl border p-4">
          <legend className="px-1 font-medium">{t("person", { n: i + 1 })}</legend>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">{t("name")}</span>
            <Input value={r.name} maxLength={100} onChange={(e) => set(r.key, { name: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">{t("titleLabel")}</span>
            <Input value={r.title} maxLength={100} onChange={(e) => set(r.key, { title: e.target.value })} />
          </label>
          <MediaField label={t("signature")} optional kinds={["image"]} asset={r.signature} onChange={(a) => set(r.key, { signature: a })} />
          <Button type="button" variant="ghost" className="self-start" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>
            <Trash2 aria-hidden="true" />
            {t("remove")}
          </Button>
        </fieldset>
      ))}
      {rows.length < 3 && (
        <Button type="button" variant="outline" className="self-start" onClick={() => setRows((rs) => [...rs, { key: Date.now(), name: "", title: "", signature: null }])}>
          <Plus aria-hidden="true" />
          {t("add")}
        </Button>
      )}
      <p className="text-sm text-muted-foreground">{t("hint")}</p>
      <FormError error={error} />
      <div className="flex items-center gap-3">
        <Button
          size="lg"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const r = await saveSignatoriesAction(rows.map((x) => ({ name: x.name, title: x.title, signatureAssetId: x.signature?.id ?? null })));
              if (!r.ok) return setError(r.error);
              setSaved(true);
            })
          }
        >
          <Save aria-hidden="true" />
          {pending ? tc("saving") : tc("save")}
        </Button>
        <span role="status" className="text-sm text-muted-foreground">
          {saved ? tc("saved") : ""}
        </span>
      </div>
    </div>
  );
}
