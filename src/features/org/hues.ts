/**
 * Organizasyon ağacında departman renkleri (karar #293). Renk yalnızca ayırt etmeye yarar; hiyerarşi ayrıca başlık
 * düzeyi, "Departman"/"Bölüm" etiketi ve girintiyle verilir. Sınıflar Tailwind'in görebilmesi için tam yazılır.
 */
export const DEPARTMENT_HUES = ["sky", "emerald", "violet", "amber", "rose", "teal"] as const;
export type DepartmentHue = (typeof DEPARTMENT_HUES)[number] | "slate";

/**
 * Departmana renk verir: renk koddan türetilir (yeni departman eklenince diğerleri çoğunlukla aynı kalır), aynı renk
 * ikinci kez verilmez; renkler bitince baştan dolanır. Pasif departman gri (slate) olur.
 */
export function departmentHues(departments: readonly { code: string; isActive: boolean }[]): DepartmentHue[] {
  const n = DEPARTMENT_HUES.length;
  const used = new Set<number>();
  return departments.map((d) => {
    if (!d.isActive) return "slate";
    let i = hashCode(d.code) % n;
    if (used.size < n) while (used.has(i)) i = (i + 1) % n;
    used.add(i);
    return DEPARTMENT_HUES[i]!;
  });
}

function hashCode(s: string): number {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

/** Tek renk takımının sınıfları: başlık zemini, sol çizgi, simge, kılavuz çizgisi, bölüm simgesi. */
type HueClasses = { header: string; bar: string; icon: string; guide: string; sectionIcon: string };

export const HUE_CLASSES: Record<DepartmentHue, HueClasses> = {
  sky: {
    header: "bg-sky-50 dark:bg-sky-950/40",
    bar: "bg-sky-500 dark:bg-sky-400",
    icon: "bg-sky-100 text-sky-700 dark:bg-sky-900/60 dark:text-sky-200",
    guide: "border-sky-200 dark:border-sky-800",
    sectionIcon: "text-sky-700 dark:text-sky-300",
  },
  emerald: {
    header: "bg-emerald-50 dark:bg-emerald-950/40",
    bar: "bg-emerald-500 dark:bg-emerald-400",
    icon: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-200",
    guide: "border-emerald-200 dark:border-emerald-800",
    sectionIcon: "text-emerald-700 dark:text-emerald-300",
  },
  violet: {
    header: "bg-violet-50 dark:bg-violet-950/40",
    bar: "bg-violet-500 dark:bg-violet-400",
    icon: "bg-violet-100 text-violet-700 dark:bg-violet-900/60 dark:text-violet-200",
    guide: "border-violet-200 dark:border-violet-800",
    sectionIcon: "text-violet-700 dark:text-violet-300",
  },
  amber: {
    header: "bg-amber-50 dark:bg-amber-950/40",
    bar: "bg-amber-500 dark:bg-amber-400",
    icon: "bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200",
    guide: "border-amber-200 dark:border-amber-800",
    sectionIcon: "text-amber-700 dark:text-amber-300",
  },
  rose: {
    header: "bg-rose-50 dark:bg-rose-950/40",
    bar: "bg-rose-500 dark:bg-rose-400",
    icon: "bg-rose-100 text-rose-700 dark:bg-rose-900/60 dark:text-rose-200",
    guide: "border-rose-200 dark:border-rose-800",
    sectionIcon: "text-rose-700 dark:text-rose-300",
  },
  teal: {
    header: "bg-teal-50 dark:bg-teal-950/40",
    bar: "bg-teal-500 dark:bg-teal-400",
    icon: "bg-teal-100 text-teal-700 dark:bg-teal-900/60 dark:text-teal-200",
    guide: "border-teal-200 dark:border-teal-800",
    sectionIcon: "text-teal-700 dark:text-teal-300",
  },
  slate: {
    header: "bg-slate-100 dark:bg-slate-900/60",
    bar: "bg-slate-400 dark:bg-slate-500",
    icon: "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    guide: "border-slate-200 dark:border-slate-700",
    sectionIcon: "text-slate-500 dark:text-slate-400",
  },
};
