import type { ApprovalStep, VersionStatus } from "./content";

export { isEditable, isPending, onApprove, onReject, pendingStep } from "./content";

/**
 * Pozisyon kartı yayın akışı (SPEC Bölüm 5): içerikle aynı durumlar.
 *  - 1. adım (bölüm): kapsamdaki bölüm sorumlusu. Gönderen bu yetkiye sahipse adım kendi onayıyla geçer.
 *  - 2. adım (İSG): 9. bölüm önceki yayına göre değiştiyse (ilk sürümde her zaman) gerekir.
 *    Gönderen hem bölüm onaycısı hem İSG uzmanıysa ikisi birden geçer.
 *  - İSG uzmanı tek başına kartı yayınlayamaz (içerikteki "İSG içeriği tek adım" kuralı karta uygulanmaz).
 */
export function cardOnSubmit(ctx: {
  ohsRequired: boolean;
  submitterCanApproveSection: boolean;
  submitterIsOhsSpecialist: boolean;
}): { autoSteps: ApprovalStep[]; status: VersionStatus } {
  if (!ctx.submitterCanApproveSection) return { autoSteps: [], status: "section_review" };
  if (!ctx.ohsRequired) return { autoSteps: ["section"], status: "published" };
  if (ctx.submitterIsOhsSpecialist) return { autoSteps: ["section", "ohs"], status: "published" };
  return { autoSteps: ["section"], status: "ohs_review" };
}
