import { and, eq, inArray, or } from "drizzle-orm";
import { db, type DbOrTx } from "@/server/db/client";
import { orgUnits, personnel, positions, roleScopes } from "@/server/db/schema";
import type { Actor } from "./actor";
import { hasAnyRole, hasRole } from "./policy";

/**
 * Org kapsamı (SPEC 2.2).
 * - Sistem aktörü, İK ve sistem yöneticisi: tüm ağaç
 * - Bölüm sorumlusu: role_scopes'taki düğümler ve altındaki düğümler (ağaç iki seviyeli)
 * - Diğerleri: boş
 */
export type OrgScope = { all: true } | { all: false; orgUnitIds: ReadonlySet<string> };

const EMPTY: OrgScope = { all: false, orgUnitIds: new Set() };

export async function orgScopeFor(actor: Actor, conn: DbOrTx = db()): Promise<OrgScope> {
  if (actor.kind === "system" || hasAnyRole(actor, ["hr", "sysadmin"])) return { all: true };
  if (!hasRole(actor, "section_manager")) return EMPTY;

  const assigned = await conn
    .select({ orgUnitId: roleScopes.orgUnitId })
    .from(roleScopes)
    .where(and(eq(roleScopes.userId, actor.userId), eq(roleScopes.role, "section_manager")));
  const roots = assigned.map((r) => r.orgUnitId);
  if (roots.length === 0) return EMPTY;

  const units = await conn
    .select({ id: orgUnits.id })
    .from(orgUnits)
    .where(or(inArray(orgUnits.id, roots), inArray(orgUnits.parentId, roots)));
  return { all: false, orgUnitIds: new Set(units.map((u) => u.id)) };
}

export function inOrgScope(scope: OrgScope, orgUnitId: string | null | undefined): boolean {
  if (scope.all) return true;
  return !!orgUnitId && scope.orgUnitIds.has(orgUnitId);
}

/** Kişi, aktörün kapsamındaki bir pozisyonda mı? (Pozisyonsuz personel yalnızca tüm ağaca erişenlerin kapsamındadır.) */
export async function isPersonInScope(actor: Actor, userId: string, conn: DbOrTx = db()): Promise<boolean> {
  const scope = await orgScopeFor(actor, conn);
  if (scope.all) return true;
  const [row] = await conn
    .select({ orgUnitId: positions.orgUnitId })
    .from(personnel)
    .leftJoin(positions, eq(positions.id, personnel.positionId))
    .where(eq(personnel.userId, userId))
    .limit(1);
  return inOrgScope(scope, row?.orgUnitId);
}
