import { eq } from "drizzle-orm";
import type { Actor } from "@/server/authz/actor";
import { hasAnyRole, hasRole, isOwner } from "@/server/authz/policy";
import { inOrgScope, orgScopeFor, type OrgScope } from "@/server/authz/scope";
import { db, type DbOrTx } from "@/server/db/client";
import { orgUnits, personnel, positions } from "@/server/db/schema";

/**
 * İçerik erişim kuralları (karar #38–#40 / SPEC 2.3):
 *  - Görme: İK ve İSG uzmanı her şeyi; bölüm sorumlusu kapsamını + ortakları; eğitmen kendi birimini
 *    (pozisyonunun birimi ve departmanı) + ortakları. Sistem yöneticisi kütüphaneyi görmez.
 *  - Taslak: bölüm sorumlusu kapsamında; eğitmen kendi biriminde; İK ortak içerikte; İSG uzmanı her İSG içeriğinde.
 *  - Bölüm adımı onayı: birime ait içerikte kapsamdaki bölüm sorumlusu; ortak içerikte İK.
 *  - İSG adımı onayı: İSG uzmanı.
 *  - Arşiv: bölüm adımını onaylayabilen; İSG içeriğinde ayrıca İSG uzmanı.
 */

export type ContentRef = { ownerOrgUnitId: string | null; isOhs: boolean };

export type ContentAccess = {
  actor: Actor;
  scope: OrgScope;
  /** Eğitmenin kendi birimi ve (bölümse) departmanı */
  trainerUnits: ReadonlySet<string>;
};

export async function contentAccessFor(actor: Actor, conn: DbOrTx = db()): Promise<ContentAccess> {
  const scope = await orgScopeFor(actor, conn);
  const trainerUnits = new Set<string>();
  if (actor.kind === "user" && hasRole(actor, "trainer")) {
    const [row] = await conn
      .select({ unitId: positions.orgUnitId, parentId: orgUnits.parentId })
      .from(personnel)
      .innerJoin(positions, eq(positions.id, personnel.positionId))
      .innerJoin(orgUnits, eq(orgUnits.id, positions.orgUnitId))
      .where(eq(personnel.userId, actor.userId))
      .limit(1);
    if (row) {
      trainerUnits.add(row.unitId);
      if (row.parentId) trainerUnits.add(row.parentId);
    }
  }
  return { actor, scope, trainerUnits };
}

function managerScope(a: ContentAccess): OrgScope | null {
  return hasRole(a.actor, "section_manager") ? a.scope : null;
}

export function canViewContent(a: ContentAccess, c: ContentRef): boolean {
  if (a.actor.kind === "system") return true;
  if (hasAnyRole(a.actor, ["hr", "ohs_specialist"])) return true;
  const isCommon = c.ownerOrgUnitId === null;
  if (hasAnyRole(a.actor, ["section_manager", "trainer"]) && isCommon) return true;
  const ms = managerScope(a);
  if (ms && !ms.all && inOrgScope(ms, c.ownerOrgUnitId)) return true;
  return !!c.ownerOrgUnitId && a.trainerUnits.has(c.ownerOrgUnitId);
}

export function canDraftContent(a: ContentAccess, c: ContentRef): boolean {
  // Üst yönetici her içeriği hazırlayabilir ve bölüm adımını onaylayabilir (karar #192)
  if (a.actor.kind === "system" || isOwner(a.actor)) return true;
  if (c.isOhs && hasRole(a.actor, "ohs_specialist")) return true;
  if (c.ownerOrgUnitId === null) return hasRole(a.actor, "hr");
  const ms = managerScope(a);
  if (ms && !ms.all && inOrgScope(ms, c.ownerOrgUnitId)) return true;
  return hasRole(a.actor, "trainer") && a.trainerUnits.has(c.ownerOrgUnitId);
}

export function canApproveSection(a: ContentAccess, c: ContentRef): boolean {
  if (a.actor.kind === "system" || isOwner(a.actor)) return true;
  if (c.ownerOrgUnitId === null) return hasRole(a.actor, "hr");
  const ms = managerScope(a);
  return !!ms && !ms.all && inOrgScope(ms, c.ownerOrgUnitId);
}

export function canApproveOhs(a: ContentAccess): boolean {
  return a.actor.kind === "system" || hasRole(a.actor, "ohs_specialist");
}

export function canArchiveContent(a: ContentAccess, c: ContentRef): boolean {
  return canApproveSection(a, c) || (c.isOhs && canApproveOhs(a));
}

/** Kütüphaneyi hiç kullanabilir mi (menü/sayfa erişimi). */
export function canUseLibrary(actor: Actor): boolean {
  return hasAnyRole(actor, ["trainer", "section_manager", "ohs_specialist", "hr"]);
}
