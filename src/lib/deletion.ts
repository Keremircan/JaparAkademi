/**
 * Kayıt silme (iş paketi 3.14, kararlar #283–288): sunucu ve arayüzün ortak türleri.
 * Silme üç sonuçtan birini verir: bağlı kayıt varsa önce onlar silinir ("blocked"), kayıt geçmiş eğitim/sınav/onay
 * kayıtlarında kullanıldıysa silinmez, arşivlenir ("history"), hiçbir bağı yoksa onay sorusundan sonra silinir ("ok").
 */
export const DELETE_KINDS = [
  "org_unit",
  "position",
  "person",
  "module",
  "content",
  "question",
  "tag",
  "competency",
  "classroom_session",
  "company",
  "visit",
  "device",
  "legal_draft",
] as const;
export type DeleteKind = (typeof DELETE_KINDS)[number];

/** Önce silinmesi (ya da bağlantısı kaldırılması) gereken kayıt türleri. */
export const BLOCKER_KINDS = [
  "sections",
  "positions",
  "personnel",
  "unit_scopes",
  "unit_modules",
  "unit_contents",
  "unit_questions",
  "unit_competencies",
  "schedules",
  "linked_positions",
  "module_plans",
  "module_questions",
  "content_modules",
  "tagged_contents",
  "competency_tasks",
] as const;
export type BlockerKind = (typeof BLOCKER_KINDS)[number];

export type Blocker = { kind: BlockerKind; count: number };

export type DeletionCheck = { state: "ok" } | { state: "blocked"; blockers: Blocker[] } | { state: "history" };

/** Silme sonrası gidilecek adres: yalnızca uygulama içi yol (ör. "/admin/org"). */
export function isSafeReturnPath(path: string | null | undefined): path is string {
  return typeof path === "string" && /^\/[a-z0-9/_-]*(\?[a-z0-9_=&-]*)?$/i.test(path) && !path.startsWith("//");
}
