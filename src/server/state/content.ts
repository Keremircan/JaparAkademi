/**
 * İçerik yayın akışı (FG-2.3), saf durum makinesi:
 *
 *   draft/rejected ──gönder──▶ section_review ──onay──▶ (İSG ise) ohs_review ──onay──▶ published
 *                                  │ret                         │ret
 *                                  └──────────▶ rejected ◀───────┘
 *
 * Kendi onayı sayılan durumlar (decision = auto_self):
 *  - Gönderen bölüm adımını onaylayabiliyorsa (kapsamdaki bölüm sorumlusu; ortak içerikte İK) bölüm adımı geçer.
 *  - İSG uzmanının hazırladığı İSG içeriği tek adımda yayınlanır (bölüm ve İSG adımı birlikte geçer).
 */

export type VersionStatus = "draft" | "section_review" | "ohs_review" | "published" | "rejected";
export type ApprovalStep = "section" | "ohs";

export function isEditable(status: VersionStatus): boolean {
  return status === "draft" || status === "rejected";
}

export function isPending(status: VersionStatus): boolean {
  return status === "section_review" || status === "ohs_review";
}

/** Onay bekleyen sürümün hangi adımda olduğu. */
export function pendingStep(status: VersionStatus): ApprovalStep | null {
  if (status === "section_review") return "section";
  if (status === "ohs_review") return "ohs";
  return null;
}

export type SubmitContext = {
  isOhs: boolean;
  /** Gönderen bölüm adımını onaylama yetkisine sahip mi */
  submitterCanApproveSection: boolean;
  /** Gönderen İSG uzmanı mı */
  submitterIsOhsSpecialist: boolean;
};

/** Gönderimde otomatik geçen adımlar ve varılan durum. */
export function onSubmit(ctx: SubmitContext): { autoSteps: ApprovalStep[]; status: VersionStatus } {
  if (ctx.isOhs && ctx.submitterIsOhsSpecialist) return { autoSteps: ["section", "ohs"], status: "published" };
  if (ctx.submitterCanApproveSection) {
    return ctx.isOhs ? { autoSteps: ["section"], status: "ohs_review" } : { autoSteps: ["section"], status: "published" };
  }
  return { autoSteps: [], status: "section_review" };
}

/** Onayla: bölüm adımından sonra İSG içeriği İSG adımına gider, değilse yayınlanır. */
export function onApprove(status: VersionStatus, isOhs: boolean): VersionStatus {
  if (status === "section_review") return isOhs ? "ohs_review" : "published";
  if (status === "ohs_review") return "published";
  throw new Error(`Onaylanamaz durum: ${status}`);
}

export function onReject(status: VersionStatus): VersionStatus {
  if (!isPending(status)) throw new Error(`Reddedilemez durum: ${status}`);
  return "rejected";
}
