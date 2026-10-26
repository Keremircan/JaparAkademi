import { z } from "zod";
import type { PlanModuleSettings, PlanOverrides } from "@/server/db/schema";
import { getSettings, SETTINGS } from "@/server/services/settings";

/**
 * Plan bazında geçersiz kılınabilen parametreler (SPEC Bölüm 14, "Plan" sütunu).
 * Sınav ayarları plan modülünde, diğerleri planın kendisinde tutulur. Boş alan = genel parametre.
 */

export const THEORY_EXAM_FIELDS = {
  questionCount: "exam.theory.question_count",
  durationMin: "exam.theory.duration_min",
  passScore: "exam.theory.pass_score",
  maxAttempts: "exam.theory.max_attempts",
  cooldownHours: "exam.theory.cooldown_hours",
  proctorRequired: "exam.theory.proctor_required",
} as const;

export const PRACTICE_EXAM_FIELDS = {
  passScore: "exam.practical.pass_score",
  maxAttempts: "exam.practical.max_attempts",
} as const;

export const PLAN_FIELDS = { videoWatchRatio: "theory.video_watch_ratio" } as const;

type FieldMap = Record<string, keyof typeof SETTINGS>;

function schemaFor(fields: FieldMap) {
  return z
    .object(Object.fromEntries(Object.entries(fields).map(([k, key]) => [k, SETTINGS[key].schema.optional()])))
    .strict();
}

export const theoryExamSettingsSchema = schemaFor(THEORY_EXAM_FIELDS);
export const practiceExamSettingsSchema = schemaFor(PRACTICE_EXAM_FIELDS);
export const planOverridesSchema = schemaFor(PLAN_FIELDS);

export function fieldsForKind(kind: string): FieldMap | null {
  if (kind === "theory_exam") return THEORY_EXAM_FIELDS;
  if (kind === "practice_exam") return PRACTICE_EXAM_FIELDS;
  return null;
}

/** Sınav modülü ayarlarını doğrular; sınav dışı modülde ayar olamaz. */
export function parseModuleSettings(kind: string, settings: unknown): PlanModuleSettings | null {
  const input = Object.fromEntries(Object.entries((settings ?? {}) as Record<string, unknown>).filter(([, v]) => v !== null && v !== undefined && v !== ""));
  if (kind === "theory_exam") {
    const r = theoryExamSettingsSchema.safeParse(input);
    return r.success ? (r.data as PlanModuleSettings) : null;
  }
  if (kind === "practice_exam") {
    const r = practiceExamSettingsSchema.safeParse(input);
    return r.success ? (r.data as PlanModuleSettings) : null;
  }
  return Object.keys(input).length === 0 ? {} : null;
}

export function parsePlanOverrides(overrides: unknown): PlanOverrides | null {
  const input = Object.fromEntries(Object.entries((overrides ?? {}) as Record<string, unknown>).filter(([, v]) => v !== null && v !== undefined && v !== ""));
  const r = planOverridesSchema.safeParse(input);
  return r.success ? (r.data as PlanOverrides) : null;
}

/** Genel parametre değerleri (arayüzde "varsayılan" olarak gösterilir). */
export async function planDefaults() {
  const keys = [...Object.values(THEORY_EXAM_FIELDS), ...Object.values(PRACTICE_EXAM_FIELDS), ...Object.values(PLAN_FIELDS)];
  const values = await getSettings(keys);
  const pick = (fields: FieldMap) => Object.fromEntries(Object.entries(fields).map(([k, key]) => [k, values[key as (typeof keys)[number]]]));
  return {
    theory_exam: pick(THEORY_EXAM_FIELDS) as Required<PlanModuleSettings>,
    practice_exam: pick(PRACTICE_EXAM_FIELDS) as Pick<Required<PlanModuleSettings>, "passScore" | "maxAttempts">,
    plan: pick(PLAN_FIELDS) as Required<PlanOverrides>,
  };
}

export type PlanDefaults = Awaited<ReturnType<typeof planDefaults>>;

/** Geçerli değer: plan değeri, yoksa genel parametre (1.4/1.5 bunu kullanır). */
export function resolveSettings<T extends object>(defaults: T, overrides: Partial<T>): T {
  return { ...defaults, ...Object.fromEntries(Object.entries(overrides).filter(([, v]) => v !== undefined)) } as T;
}
