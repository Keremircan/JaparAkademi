import { and, count, eq, inArray } from "drizzle-orm";
import type { Actor } from "@/server/authz/actor";
import { assertCan } from "@/server/authz/policy";
import { ROLES, type Role } from "@/server/authz/roles";
import { db } from "@/server/db/client";
import { orgUnits, personnel, roleScopes, userRoles } from "@/server/db/schema";
import { withActor } from "@/server/db/with-actor";
import { NotFoundError, ValidationError } from "@/server/errors";

/**
 * Rol ve kapsam yönetimi (yalnızca sistem yöneticisi, karar #3).
 * "personnel" rolü herkeste vardır ve kaldırılamaz.
 */

/** Rolleri tam liste olarak ayarlar. Bölüm sorumlusu rolü kaldırılırsa kapsamları da silinir. */
export async function setRoles(actor: Actor, userId: string, roles: readonly Role[]): Promise<void> {
  assertCan(actor, "roles.manage");
  const desired = new Set<Role>(["personnel", ...roles.filter((r) => (ROLES as readonly string[]).includes(r))]);

  const [person] = await db().select({ status: personnel.status }).from(personnel).where(eq(personnel.userId, userId)).limit(1);
  if (!person) throw new NotFoundError("person");

  const current = new Set(
    (await db().select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, userId))).map((r) => r.role),
  );

  if (current.has("sysadmin") && !desired.has("sysadmin")) {
    if (actor.kind === "user" && actor.userId === userId) throw new ValidationError("cannot_remove_own_sysadmin");
    const [row] = await db()
      .select({ n: count() })
      .from(userRoles)
      .innerJoin(personnel, eq(personnel.userId, userRoles.userId))
      .where(and(eq(userRoles.role, "sysadmin"), eq(personnel.status, "active")));
    if ((row?.n ?? 0) <= 1) throw new ValidationError("last_sysadmin");
  }

  const toAdd = [...desired].filter((r) => !current.has(r));
  const toRemove = [...current].filter((r) => !desired.has(r));
  if (toAdd.length === 0 && toRemove.length === 0) return;
  const grantedBy = actor.kind === "user" ? actor.userId : null;

  await withActor(actor, async (tx) => {
    if (toRemove.length > 0) {
      await tx.delete(userRoles).where(and(eq(userRoles.userId, userId), inArray(userRoles.role, toRemove)));
      if (toRemove.includes("section_manager")) {
        await tx.delete(roleScopes).where(eq(roleScopes.userId, userId));
      }
    }
    if (toAdd.length > 0) {
      await tx.insert(userRoles).values(toAdd.map((role) => ({ userId, role, grantedBy })));
    }
  });
}

/** Bölüm sorumlusunun kapsam düğümlerini tam liste olarak ayarlar. */
export async function setSectionManagerScopes(actor: Actor, userId: string, orgUnitIds: readonly string[]): Promise<void> {
  assertCan(actor, "roles.manage");
  const [hasRoleRow] = await db()
    .select({ role: userRoles.role })
    .from(userRoles)
    .where(and(eq(userRoles.userId, userId), eq(userRoles.role, "section_manager")))
    .limit(1);
  if (!hasRoleRow) throw new ValidationError("not_section_manager");

  const unique = [...new Set(orgUnitIds)];
  if (unique.length > 0) {
    const found = await db()
      .select({ id: orgUnits.id, isActive: orgUnits.isActive })
      .from(orgUnits)
      .where(inArray(orgUnits.id, unique));
    if (found.length !== unique.length) throw new NotFoundError("org_unit");
    if (found.some((u) => !u.isActive)) throw new ValidationError("org_unit_inactive");
  }

  const current = new Set(
    (await db().select({ id: roleScopes.orgUnitId }).from(roleScopes).where(eq(roleScopes.userId, userId))).map((r) => r.id),
  );
  const toAdd = unique.filter((id) => !current.has(id));
  const toRemove = [...current].filter((id) => !unique.includes(id));
  if (toAdd.length === 0 && toRemove.length === 0) return;
  const grantedBy = actor.kind === "user" ? actor.userId : null;

  await withActor(actor, async (tx) => {
    if (toRemove.length > 0) {
      await tx.delete(roleScopes).where(and(eq(roleScopes.userId, userId), inArray(roleScopes.orgUnitId, toRemove)));
    }
    if (toAdd.length > 0) {
      await tx
        .insert(roleScopes)
        .values(toAdd.map((orgUnitId) => ({ userId, role: "section_manager" as const, orgUnitId, grantedBy })));
    }
  });
}
