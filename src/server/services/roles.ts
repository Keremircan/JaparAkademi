import { and, count, eq, inArray, ne, sql } from "drizzle-orm";
import type { Actor } from "@/server/authz/actor";
import { assertCan, isOwner } from "@/server/authz/policy";
import { ROLES, type Role } from "@/server/authz/roles";
import { db, type DbOrTx } from "@/server/db/client";
import { orgUnits, personnel, roleScopes, userRoles } from "@/server/db/schema";
import { withActor } from "@/server/db/with-actor";
import { NotFoundError, ValidationError } from "@/server/errors";

/**
 * Rol ve kapsam yönetimi (yalnızca sistem yöneticisi, karar #3).
 * "personnel" rolü herkeste vardır ve kaldırılamaz.
 * `owner` rolünü yalnızca bir `owner` verir veya alır; son aktif `owner` kaldırılamaz (karar #193).
 * E-postayla giriş yapabilen rollerde (owner, sysadmin, hr) e-posta kayıtlı ve tekil olmalıdır (karar #189).
 */

/** Kayıtlı e-postayla giriş yapabilen roller (karar #189, #197). */
export const EMAIL_LOGIN_ROLES = ["owner", "sysadmin", "hr"] as const satisfies readonly Role[];

/** Aktif kişiler arasında bu roldeki kişi sayısı. */
export async function activeRoleCount(role: Role, conn: DbOrTx = db()): Promise<number> {
  const [row] = await conn
    .select({ n: count() })
    .from(userRoles)
    .innerJoin(personnel, eq(personnel.userId, userRoles.userId))
    .where(and(eq(userRoles.role, role), eq(personnel.status, "active")));
  return row?.n ?? 0;
}

/** E-postayla giriş rolleri için: e-posta kayıtlı ve başka bir aktif kişide yok. */
export async function assertLoginEmailUsable(userId: string, conn: DbOrTx = db()): Promise<void> {
  const [person] = await conn.select({ email: personnel.email }).from(personnel).where(eq(personnel.userId, userId)).limit(1);
  const email = person?.email?.trim().toLowerCase();
  if (!email) throw new ValidationError("login_email_required");
  const [dup] = await conn
    .select({ n: count() })
    .from(personnel)
    .where(and(ne(personnel.userId, userId), eq(personnel.status, "active"), sql`lower(${personnel.email}) = ${email}`));
  if ((dup?.n ?? 0) > 0) throw new ValidationError("login_email_taken");
}

/** Rolleri tam liste olarak ayarlar. Bölüm sorumlusu rolü kaldırılırsa kapsamları da silinir. */
export async function setRoles(actor: Actor, userId: string, roles: readonly Role[]): Promise<void> {
  assertCan(actor, "roles.manage");
  const desired = new Set<Role>(["personnel", ...roles.filter((r) => (ROLES as readonly string[]).includes(r))]);

  const [person] = await db().select({ status: personnel.status }).from(personnel).where(eq(personnel.userId, userId)).limit(1);
  if (!person) throw new NotFoundError("person");

  const current = new Set(
    (await db().select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, userId))).map((r) => r.role),
  );

  // `owner` rolünü yalnızca üst yönetici verir/alır; diğerleri düzenlerken mevcut durum korunur (karar #193)
  if (actor.kind !== "system" && !isOwner(actor)) {
    if (desired.has("owner") && !current.has("owner")) throw new ValidationError("owner_only");
    if (current.has("owner")) desired.add("owner");
  }
  if (current.has("owner") && !desired.has("owner") && (await activeRoleCount("owner")) <= 1) throw new ValidationError("last_owner");
  if (EMAIL_LOGIN_ROLES.some((r) => desired.has(r) && !current.has(r))) await assertLoginEmailUsable(userId);

  if (current.has("sysadmin") && !desired.has("sysadmin")) {
    if (actor.kind === "user" && actor.userId === userId) throw new ValidationError("cannot_remove_own_sysadmin");
    if ((await activeRoleCount("sysadmin")) <= 1) throw new ValidationError("last_sysadmin");
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

/**
 * İlk üst yönetici (karar #193): sistemde aktif `owner` yoksa verilen sicile `owner` rolü verir.
 * Seed ve `scripts/grant-owner.ts` kullanır; owner varsa hiçbir şey yapmaz (sonraki owner'ları owner verir).
 */
export async function bootstrapOwner(actor: Actor, sicilNo: string): Promise<"granted" | "exists" | "not_found"> {
  if (actor.kind !== "system") throw new ValidationError("owner_only");
  if ((await activeRoleCount("owner")) > 0) return "exists";
  const [person] = await db()
    .select({ userId: personnel.userId })
    .from(personnel)
    .where(and(eq(personnel.sicilNo, sicilNo.trim()), eq(personnel.status, "active")))
    .limit(1);
  if (!person) return "not_found";
  await withActor(actor, (tx) => tx.insert(userRoles).values({ userId: person.userId, role: "owner" }).onConflictDoNothing());
  return "granted";
}
