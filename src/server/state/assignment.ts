/**
 * Atama ve modül durum makinesi (FG-3.4), saf fonksiyonlar.
 *
 *   locked ──ön koşullar tamam──▶ available ──ilk adım──▶ in_progress ──tamam──▶ completed
 *                                                                      ▲            │ (1.5: sınavda kalma)
 *                                                                      └── review_required
 *   waived: elle muaf (sonraki paketler)
 *
 * Pratik modüller ve pratik sınav, atamaya eğitmen seçilene kadar kilitli kalır (karar #49).
 */

export type ModuleStatus = "locked" | "available" | "in_progress" | "completed" | "review_required" | "waived";
export type ModuleKind = "theory" | "practice" | "theory_exam" | "practice_exam";

export type ModuleState = {
  id: string;
  moduleId: string;
  kind: ModuleKind;
  status: ModuleStatus;
  isRequired: boolean;
  prerequisiteModuleIds: string[];
};

const DONE: ModuleStatus[] = ["completed", "waived"];

export function isDone(status: ModuleStatus): boolean {
  return DONE.includes(status);
}

export function needsTrainer(kind: ModuleKind): boolean {
  return kind === "practice" || kind === "practice_exam";
}

/** Kilidi açılabilecek modüller: kilitli, ön koşulları tamam, (pratikse) eğitmen seçilmiş. */
export function unlockable(modules: readonly ModuleState[], hasTrainer: boolean): string[] {
  const done = new Set(modules.filter((m) => isDone(m.status)).map((m) => m.moduleId));
  return modules
    .filter((m) => m.status === "locked")
    .filter((m) => m.prerequisiteModuleIds.every((p) => done.has(p)))
    .filter((m) => hasTrainer || !needsTrainer(m.kind))
    .map((m) => m.id);
}

/** Bir modülü neyin beklettiği (kursiyere gösterilir). */
export function lockReason(m: ModuleState, all: readonly ModuleState[], hasTrainer: boolean): { kind: "prerequisites"; moduleIds: string[] } | { kind: "trainer" } | null {
  if (m.status !== "locked") return null;
  const done = new Set(all.filter((x) => isDone(x.status)).map((x) => x.moduleId));
  const waiting = m.prerequisiteModuleIds.filter((p) => !done.has(p));
  if (waiting.length) return { kind: "prerequisites", moduleIds: waiting };
  if (needsTrainer(m.kind) && !hasTrainer) return { kind: "trainer" };
  return null;
}

/** Zorunlu modüllerin hepsi tamam mı (atama "işe başlama onayı bekliyor"a geçer — 1.7). */
export function allRequiredDone(modules: readonly ModuleState[]): boolean {
  return modules.filter((m) => m.isRequired).every((m) => isDone(m.status));
}

/** Sıradaki adım: devam eden, yoksa açık olan ilk zorunlu/isteğe bağlı modül. */
export function nextModule<T extends ModuleState>(modules: readonly T[]): T | null {
  return (
    modules.find((m) => m.status === "in_progress" || m.status === "review_required") ??
    modules.find((m) => m.status === "available" && m.isRequired) ??
    modules.find((m) => m.status === "available") ??
    null
  );
}

// ---- Video izleme (FG-4.2) ----

export type Range = [number, number];

/** Aralıkları birleştirir; [0, süre] dışına taşanları kırpar, geçersizleri atar. */
export function mergeRanges(ranges: readonly Range[], duration: number): Range[] {
  const clean = ranges
    .map(([a, b]) => [Math.max(0, Math.min(a, b)), Math.min(duration, Math.max(a, b))] as Range)
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b > a)
    .sort((x, y) => x[0] - y[0]);
  const out: Range[] = [];
  for (const r of clean) {
    const last = out[out.length - 1];
    // 1 saniyeden küçük boşluklar birleştirilir (zamanlayıcı yuvarlaması)
    if (last && r[0] <= last[1] + 1) last[1] = Math.max(last[1], r[1]);
    else out.push([r[0], r[1]]);
  }
  return out;
}

export function coveredSeconds(ranges: readonly Range[]): number {
  return ranges.reduce((a, [s, e]) => a + (e - s), 0);
}
