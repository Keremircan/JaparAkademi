"use client";

import { Check, Pencil, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { FormError } from "@/components/forms/form-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DeleteControl } from "@/features/deletion/components/delete-control";
import type { TagGroup } from "@/server/services/content";
import { createTagAction } from "../actions";

/**
 * Etiket seçimi (makine, bölüm, risk, vardiya). Taslak hazırlayan yeni etiket ekleyebilir; "Etiketleri düzenle" ile
 * hiçbir içerikte kullanılmayan etiketi silebilir (iş paketi 3.14).
 */
export function TagPicker({ groups: initial, value, onChange }: { groups: TagGroup[]; value: string[]; onChange: (ids: string[]) => void }) {
  const t = useTranslations("content.tags");
  const [groups, setGroups] = useState(initial);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [managing, setManaging] = useState(false);
  const selected = new Set(value);

  function removed(id: string) {
    setGroups((gs) => gs.map((g) => ({ ...g, tags: g.tags.filter((x) => x.id !== id) })));
    if (selected.has(id)) onChange(value.filter((v) => v !== id));
  }

  const toggle = (id: string) => onChange(selected.has(id) ? value.filter((v) => v !== id) : [...value, id]);

  function add(group: TagGroup) {
    const name = drafts[group.typeId]?.trim();
    if (!name) return;
    setError(null);
    startTransition(async () => {
      const r = await createTagAction({ tagTypeId: group.typeId, name });
      if (!r.ok) return setError(r.error);
      setGroups((gs) =>
        gs.map((g) =>
          g.typeId === group.typeId && !g.tags.some((x) => x.id === r.data.id)
            ? { ...g, tags: [...g.tags, r.data].sort((a, b) => a.name.localeCompare(b.name, "tr")) }
            : g,
        ),
      );
      setDrafts((d) => ({ ...d, [group.typeId]: "" }));
      if (!selected.has(r.data.id)) onChange([...value, r.data.id]);
    });
  }

  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="mb-2 text-base font-semibold">{t("title")}</legend>
      <Button type="button" variant="ghost" size="sm" className="self-start" aria-pressed={managing} onClick={() => setManaging((m) => !m)}>
        {managing ? <Check aria-hidden="true" /> : <Pencil aria-hidden="true" />}
        {managing ? t("doneManaging") : t("manage")}
      </Button>
      {groups.map((g) => (
        <div key={g.typeId} className="flex flex-col gap-2">
          <span className="font-medium">{t(`types.${g.key}`)}</span>
          <div className="flex flex-wrap gap-2">
            {g.tags.map((tag) =>
              managing ? (
                <span key={tag.id} className="inline-flex min-h-12 items-center gap-1 rounded-full border ps-4 pe-1">
                  {tag.name}
                  <DeleteControl kind="tag" id={tag.id} subject="tag" name={tag.name} iconOnly size="sm" after="none" onDeleted={() => removed(tag.id)} />
                </span>
              ) : (
                <button
                  key={tag.id}
                  type="button"
                  aria-pressed={selected.has(tag.id)}
                  onClick={() => toggle(tag.id)}
                  className="min-h-12 rounded-full border px-4 hover:bg-muted aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground"
                >
                  {tag.name}
                </button>
              ),
            )}
            <div className="flex items-center gap-1">
              <Input
                value={drafts[g.typeId] ?? ""}
                onChange={(e) => setDrafts((d) => ({ ...d, [g.typeId]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    add(g);
                  }
                }}
                maxLength={60}
                placeholder={t("newPlaceholder")}
                aria-label={t("newFor", { type: t(`types.${g.key}`) })}
                className="w-44"
              />
              <Button type="button" variant="outline" size="icon" disabled={pending} onClick={() => add(g)} aria-label={t("add")}>
                <Plus aria-hidden="true" />
              </Button>
            </div>
          </div>
        </div>
      ))}
      <FormError error={error} />
    </fieldset>
  );
}
