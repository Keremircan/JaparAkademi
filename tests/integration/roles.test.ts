import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { roleScopes, userRoles } from "@/server/db/schema";
import { ForbiddenError } from "@/server/errors";
import { setRoles, setSectionManagerScopes } from "@/server/services/roles";
import { owner } from "../support/db";
import { createTestUser } from "../support/factories";
import { seedTestOrg } from "../support/org";

async function rolesOf(userId: string) {
  return (await db().select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, userId))).map((r) => r.role).sort();
}

describe("Rol ve kapsam yönetimi (karar #3: yalnızca sistem yöneticisi)", () => {
  it("sistem yöneticisi rolleri tam liste olarak ayarlar; personel rolü hep kalır", async () => {
    const admin = await createTestUser({ roles: ["sysadmin"] });
    // E-postayla giriş rolleri (İK, sysadmin) kayıtlı e-posta ister (karar #189)
    const u = await createTestUser({ roles: ["trainer"], email: "roller-u@japar.test" });
    await setRoles(admin.actor, u.userId, ["hr", "section_manager"]);
    expect(await rolesOf(u.userId)).toEqual(["hr", "personnel", "section_manager"]);
    await setRoles(admin.actor, u.userId, []);
    expect(await rolesOf(u.userId)).toEqual(["personnel"]);
  });

  it("İK dahil diğer roller rol atayamaz", async () => {
    const u = await createTestUser();
    for (const roles of [["hr"], ["section_manager"], ["ohs_specialist"], ["trainer"]] as const) {
      const other = await createTestUser({ roles: [...roles] });
      await expect(setRoles(other.actor, u.userId, ["trainer"])).rejects.toBeInstanceOf(ForbiddenError);
    }
  });

  it("kişi kendi sistem yöneticisi rolünü kaldıramaz; son aktif sistem yöneticisi korunur", async () => {
    const a = await createTestUser({ roles: ["sysadmin"] });
    await expect(setRoles(a.actor, a.userId, [])).rejects.toMatchObject({ code: "cannot_remove_own_sysadmin" });

    const b = await createTestUser({ roles: ["sysadmin"], email: "roller-b@japar.test" });
    await setRoles(a.actor, b.userId, []); // a hâlâ sysadmin
    expect(await rolesOf(b.userId)).toEqual(["personnel"]);

    // b'yi tekrar sysadmin yapıp a'yı pasife al: b son aktif sysadmin olur
    await setRoles(a.actor, b.userId, ["sysadmin"]);
    await owner()`update personnel set status = 'passive' where user_id = ${a.userId}`;
    const c = await createTestUser({ roles: ["sysadmin"] });
    await owner()`update personnel set status = 'passive' where user_id = ${c.userId}`;
    await expect(setRoles(c.actor, b.userId, [])).rejects.toMatchObject({ code: "last_sysadmin" });
  });

  it("bölüm sorumlusu rolü kaldırılınca kapsamları da silinir", async () => {
    const org = await seedTestOrg();
    const admin = await createTestUser({ roles: ["sysadmin"] });
    const mgr = await createTestUser({ roles: ["section_manager"] });
    await setSectionManagerScopes(admin.actor, mgr.userId, [org.units.uretim, org.units.kalite]);
    expect(await db().select().from(roleScopes).where(eq(roleScopes.userId, mgr.userId))).toHaveLength(2);
    await setRoles(admin.actor, mgr.userId, ["trainer"]);
    expect(await db().select().from(roleScopes).where(eq(roleScopes.userId, mgr.userId))).toHaveLength(0);
  });

  it("kapsam yalnızca bölüm sorumlusuna ve aktif birimlere atanır", async () => {
    const org = await seedTestOrg();
    const admin = await createTestUser({ roles: ["sysadmin"] });
    const notMgr = await createTestUser({ roles: ["trainer"] });
    await expect(setSectionManagerScopes(admin.actor, notMgr.userId, [org.units.pres])).rejects.toMatchObject({
      code: "not_section_manager",
    });
    const mgr = await createTestUser({ roles: ["section_manager"] });
    await owner()`update org_units set is_active = false where id = ${org.units.kalite}`;
    await expect(setSectionManagerScopes(admin.actor, mgr.userId, [org.units.kalite])).rejects.toMatchObject({
      code: "org_unit_inactive",
    });
  });

  it("veritabanı yalnızca section_manager kapsamına izin verir", async () => {
    const org = await seedTestOrg();
    const u = await createTestUser({ roles: ["trainer"] });
    const err = await owner()`insert into role_scopes (user_id, role, org_unit_id) values (${u.userId}, 'trainer', ${org.units.pres})`.catch(
      (e: unknown) => e,
    );
    expect((err as { code?: string }).code).toBe("23514");
  });
});
