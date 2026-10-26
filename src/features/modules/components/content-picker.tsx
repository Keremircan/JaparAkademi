"use client";

import { Plus, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { searchContentsAction } from "../actions";

export type PickedContent = { id: string; title: string; type: string };

/** Yayındaki içeriklerden arayıp seçme (modül içerikleri, kart bağlantıları). */
export function ContentPicker({
  exclude,
  onPick,
  filterType,
}: {
  exclude: readonly string[];
  onPick: (c: PickedContent) => void;
  filterType?: string;
}) {
  const t = useTranslations("modules.picker");
  const tt = useTranslations("content.types");
  const id = useId();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<(PickedContent & { ownerName: string | null })[] | null>(null);
  const [pending, startTransition] = useTransition();

  const search = () =>
    startTransition(async () => {
      const r = await searchContentsAction(q);
      setResults(r.ok ? r.data : []);
    });

  const visible = (results ?? []).filter((r) => !exclude.includes(r.id) && (!filterType || r.type === filterType));

  return (
    <div className="flex flex-col gap-2 rounded-xl border p-3">
      <div className="flex items-end gap-2">
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor={id} className="text-sm font-medium">
            {t("label")}
          </label>
          <Input
            id={id}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                search();
              }
            }}
            placeholder={t("placeholder")}
          />
        </div>
        <Button type="button" variant="secondary" disabled={pending} onClick={search}>
          <Search aria-hidden="true" />
          {t("search")}
        </Button>
      </div>
      {results && (
        <ul className="flex max-h-72 flex-col divide-y overflow-y-auto" aria-live="polite">
          {visible.length === 0 && <li className="p-2 text-sm text-muted-foreground">{t("empty")}</li>}
          {visible.map((r) => (
            <li key={r.id} className="flex items-center gap-2 py-1">
              <span className="min-w-0 flex-1">
                <span className="block truncate">{r.title}</span>
                <span className="block text-xs text-muted-foreground">
                  {tt(`${r.type as "text"}.label`)} · {r.ownerName ?? t("common")}
                </span>
              </span>
              <Button type="button" variant="outline" size="sm" onClick={() => onPick(r)}>
                <Plus aria-hidden="true" />
                {t("add")}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
