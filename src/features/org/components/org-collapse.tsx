"use client";

import { ChevronRight, ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSyncExternalStore, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Organizasyon ağacında açık departman ve bölümler (karar #294). Hepsi kapalı başlar. Durum sekme boyunca bellekte
 * tutulur: kayıttan, silmeden ya da başka sayfadan dönünce açık olanlar açık kalır. Tarayıcı deposu kullanılmaz.
 */
const EMPTY: ReadonlySet<string> = new Set();
let openIds: ReadonlySet<string> = EMPTY;
const listeners = new Set<() => void>();

function setOpen(next: ReadonlySet<string>) {
  openIds = next;
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function useOpenIds() {
  // Sunucu çiziminde ve ilk eşlemede hepsi kapalı; sonra bellekteki durum uygulanır
  return useSyncExternalStore(subscribe, () => openIds, () => EMPTY);
}

const bodyId = (id: string) => `org-unit-${id}`;

/**
 * Birim başlığındaki aç/kapa düğmesi. Başlığın (h2/h3) içindedir, adı birimin adıdır; tıklama alanı simge, ad ve
 * sayılarla birlikte bütün sol bloğu kaplar (kapsayan öğe `relative` olmalı).
 */
export function UnitToggle({ id, name, className }: { id: string; name: string; className?: string }) {
  const open = useOpenIds().has(id);
  const toggle = () => {
    const next = new Set(openIds);
    if (open) next.delete(id);
    else next.add(id);
    setOpen(next);
  };
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={bodyId(id)}
      onClick={toggle}
      className={cn(
        "group/toggle inline-flex min-h-12 items-center gap-1.5 text-left outline-none pointer-fine:min-h-10",
        "after:absolute after:inset-0 after:rounded-lg focus-visible:after:ring-3 focus-visible:after:ring-ring/50",
        className,
      )}
    >
      <ChevronRight aria-hidden="true" className={cn("size-5 shrink-0 transition-transform motion-reduce:transition-none", open && "rotate-90")} />
      <span className="group-hover/toggle:underline">{name}</span>
    </button>
  );
}

/** Birimin içeriği: kapalıyken gizlidir (ekran okuyucudan da). */
export function UnitBody({ id, children }: { id: string; children: ReactNode }) {
  const open = useOpenIds().has(id);
  return (
    <div id={bodyId(id)} hidden={!open}>
      {children}
    </div>
  );
}

/** Birim düğmeleri: telefonda birim kapalıyken gizlenir (kapalı kart kısa kalır), geniş ekranda her zaman görünür. */
export function UnitActions({ id, children }: { id: string; children: ReactNode }) {
  const open = useOpenIds().has(id);
  return <div className={cn("flex flex-wrap items-center gap-2", !open && "max-sm:hidden")}>{children}</div>;
}

/** "Tümünü aç" / "Tümünü kapat": bütün departman ve bölümler. */
export function ExpandAll({ ids }: { ids: string[] }) {
  const t = useTranslations("admin.org");
  const open = useOpenIds();
  const allOpen = ids.length > 0 && ids.every((id) => open.has(id));
  const anyOpen = ids.some((id) => open.has(id));
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" disabled={allOpen} onClick={() => setOpen(new Set([...openIds, ...ids]))}>
        <ChevronsUpDown aria-hidden="true" />
        {t("expandAll")}
      </Button>
      <Button variant="outline" size="sm" disabled={!anyOpen} onClick={() => setOpen(new Set([...openIds].filter((id) => !ids.includes(id))))}>
        <ChevronsDownUp aria-hidden="true" />
        {t("collapseAll")}
      </Button>
    </div>
  );
}
