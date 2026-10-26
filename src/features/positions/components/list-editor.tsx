"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

/**
 * Kart bölümlerindeki madde listeleri için ortak düzenleyici: ekle, sırala, kaldır.
 * Her madde için alanları `render` verir.
 */
export function ListEditor<T>({
  items,
  onChange,
  render,
  blank,
  itemLabel,
  addLabel,
  disabled,
}: {
  items: T[];
  onChange: (items: T[]) => void;
  render: (item: T, change: (patch: Partial<T>) => void, index: number) => ReactNode;
  blank: () => T;
  itemLabel: (index: number) => string;
  addLabel: string;
  disabled?: boolean;
}) {
  const t = useTranslations("cards.editor");
  const move = (i: number, dir: -1 | 1) => {
    const next = [...items];
    const [x] = next.splice(i, 1);
    next.splice(i + dir, 0, x!);
    onChange(next);
  };
  return (
    <div className="flex flex-col gap-3">
      {items.length > 0 && (
        <ol className="flex flex-col gap-3">
          {items.map((item, i) => (
            <li key={i} className="flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-start">
              <div className="flex min-w-0 flex-1 flex-col gap-3">{render(item, (patch) => onChange(items.map((x, j) => (j === i ? { ...x, ...patch } : x))), i)}</div>
              {!disabled && (
                <div className="flex shrink-0 gap-1 self-end sm:self-start">
                  <Button type="button" variant="ghost" size="icon" disabled={i === 0} onClick={() => move(i, -1)} aria-label={t("moveUp", { item: itemLabel(i) })}>
                    <ArrowUp aria-hidden="true" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" disabled={i === items.length - 1} onClick={() => move(i, 1)} aria-label={t("moveDown", { item: itemLabel(i) })}>
                    <ArrowDown aria-hidden="true" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label={t("remove", { item: itemLabel(i) })}>
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
      {!disabled && (
        <Button type="button" variant="outline" className="self-start" onClick={() => onChange([...items, blank()])}>
          <Plus aria-hidden="true" />
          {addLabel}
        </Button>
      )}
    </div>
  );
}
