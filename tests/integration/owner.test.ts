import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { systemActor } from "@/server/authz/actor";
import { can, PERMISSIONS, type Permission } from "@/server/authz/policy";
import { orgScopeFor } from "@/server/authz/scope";
import { db } from "@/server/db/client";
import { dataAccessLog, ownerActions, userRoles } from "@/server/db/schema";
import { withActor } from "@/server/db/with-actor";
import { isImmutableViolation } from "@/server/errors";
import { loadSessionUser, signIn } from "@/server/services/auth";
import { approvalQueue, approveVersion, createContent, getContent, saveDraft, submitForApproval } from "@/server/services/content";
import { createPerson, revealNationalId, setPersonStatus } from "@/server/services/people";
import { bootstrapOwner, setRoles } from "@/server/services/roles";
import { owner } from "../support/db";
import { seedContentPeople, textBody } from "../support/content";
import { createTestUser, meta, TEST_PASSWORD } from "../support/factories";

async function ohsText(actor: Parameters<typeof createContent>[0], unit: string | null, title: string) {
  const { id } = await createContent(actor, { type: "text", title, ownerOrgUnitId: unit, commonTarget: null, isOhs: true });
  await saveDraft(actor, id, { title, body: textBody("KKD zorunlu"), tagIds: [] });
  return id;
}

describe("İş paketi 2.6b: üst yönetici (owner)", () => {
  it("karar #192: owner bütün yetkilere ve bütün ağaca sahiptir; oturumda bütün roller geçerlidir, profilde kendi rolleri görünür", async () => {
    const boss = await createTestUser({ roles: ["owner"] });
    for (const p of Object.keys(PERMISSIONS) as Permission[]) expect(can(boss.actor, p)).toBe(true);
    expect(await orgScopeFor(boss.actor)).toEqual({ all: true });

    const login = await signIn({ sicilNo: boss.sicilNo, password: TEST_PASSWORD, sharedDevice: false }, meta());
    expect(login.ok).toBe(true);
    const [s] = await db().select().from(userRoles).where(eq(userRoles.userId, boss.userId));
    expect(s).toBeTruthy();
    const sessionRow = await owner()<{ id: string }[]>`select id from sessions where user_id = ${boss.userId} limit 1`;
    const user = await loadSessionUser(sessionRow[0]!.id);
    expect(user?.roles).toEqual(expect.arrayContaining(["hr", "sysadmin", "ohs_specialist", "section_manager", "trainer", "security", "owner"]));
    expect(user?.baseRoles.sort()).toEqual(["owner", "personnel"]);
  });

  it("karar #192: owner tam TC'yi görür; her görüntüleme kaydedilir", async () => {
    const hr = await createTestUser({ roles: ["hr"] });
    const boss = await createTestUser({ roles: ["owner"] });
    const { userId } = await createPerson(hr.actor, {
      sicilNo: "9101",
      fullName: "TC Kişi",
      nationalId: "10000000146",
      employmentType: "employee",
      trainingRequired: false,
      channel: "print",
    });
    expect(await revealNationalId(boss.actor, userId)).toBe("10000000146");
    const logs = await db().select().from(dataAccessLog).where(eq(dataAccessLog.subjectUserId, userId));
    expect(logs).toMatchObject([{ actorId: boss.userId, field: "national_id" }]);
  });

  it("karar #193: owner rolünü yalnızca owner verir; sysadmin düzenlerken owner korunur; son owner kaldırılamaz ve pasife alınamaz", async () => {
    const admin = await createTestUser({ roles: ["sysadmin"] });
    const hr = await createTestUser({ roles: ["hr"] });
    const boss = await createTestUser({ roles: ["owner"] });
    const candidate = await createTestUser({ email: "patron@japar.test" });

    await expect(setRoles(admin.actor, candidate.userId, ["owner"])).rejects.toMatchObject({ code: "owner_only" });
    // Sysadmin owner'ın diğer rollerini düzenler; owner rolü korunur
    await setRoles(admin.actor, boss.userId, ["trainer"]);
    const roles = (await db().select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, boss.userId))).map((r) => r.role);
    expect(roles.sort()).toEqual(["owner", "personnel", "trainer"]);

    await expect(setRoles(boss.actor, boss.userId, [])).rejects.toMatchObject({ code: "last_owner" });
    await expect(setPersonStatus(hr.actor, boss.userId, { status: "passive" })).rejects.toMatchObject({ code: "owner_only" });

    await setRoles(boss.actor, candidate.userId, ["owner"]);
    const second = { ...candidate.actor, roles: [...candidate.actor.roles, "owner" as const] };
    // İki owner varken biri diğerini pasife alabilir; son kalan alınamaz
    await setPersonStatus(second, boss.userId, { status: "passive" });
    await expect(setPersonStatus(hr.actor, candidate.userId, { status: "passive" })).rejects.toMatchObject({ code: "owner_only" });
    await expect(setRoles(second, candidate.userId, [])).rejects.toMatchObject({ code: "last_owner" });
  });

  it("karar #193: ilk owner yalnızca sistemde owner yokken tanımlanır", async () => {
    await owner()`delete from user_roles where role = 'owner'`;
    const admin = await createTestUser({ roles: ["sysadmin"] });
    const sys = systemActor("test");
    expect(await bootstrapOwner(sys, "yok-sicil")).toBe("not_found");
    expect(await bootstrapOwner(sys, admin.sicilNo)).toBe("granted");
    const other = await createTestUser({ roles: ["sysadmin"] });
    expect(await bootstrapOwner(sys, other.sicilNo)).toBe("exists");
    await expect(bootstrapOwner(admin.actor, admin.sicilNo)).rejects.toMatchObject({ code: "owner_only" });
  });

  it("karar #195: iki adımlı onayda bölüm adımını veren kişi İSG adımını veremez", async () => {
    const p = await seedContentPeople();
    // Bölüm sorumlusu aynı zamanda İSG uzmanı
    await owner()`insert into user_roles (user_id, role) values (${p.smUretim.userId}, 'ohs_specialist')`;
    const both = { ...p.smUretim.actor, roles: [...p.smUretim.actor.roles, "ohs_specialist" as const] };

    // Eğitmenin İSG içeriği: bölüm adımını "both" verir, İSG adımını veremez
    const id = await ohsText(p.trainerPres.actor, p.org.units.pres, "Pres İSG talimatı");
    expect((await submitForApproval(p.trainerPres.actor, id, { changeNote: null, requireReread: false })).status).toBe("section_review");
    const versionId = (await getContent(p.trainerPres.actor, id)).versions[0]!.id;
    expect((await approveVersion(both, versionId)).status).toBe("ohs_review");
    await expect(approveVersion(both, versionId)).rejects.toMatchObject({ code: "same_approver" });
    expect((await approveVersion(p.ohs.actor, versionId)).status).toBe("published");
  });

  it("karar #196: owner'ın İSG içeriği kendiliğinden yayınlanmaz; owner'ın İSG onayı ayrıca kaydedilir (değiştirilemez)", async () => {
    const p = await seedContentPeople();
    const boss = await createTestUser({ roles: ["owner"] });
    const boss2 = await createTestUser({ roles: ["owner"] });

    // Owner bölüm adımını kendi onayıyla geçer, İSG adımı başkasını bekler
    const own = await ohsText(boss.actor, p.org.units.pres, "Owner İSG içeriği");
    expect((await submitForApproval(boss.actor, own, { changeNote: null, requireReread: false })).status).toBe("ohs_review");
    const ownVersion = (await getContent(boss.actor, own)).versions[0]!.id;
    await expect(approveVersion(boss.actor, ownVersion)).rejects.toMatchObject({ code: "forbidden" });

    // Başka bir owner İSG adımını onaylar → owner_actions kaydı
    expect(await approvalQueue(boss2.actor)).toContainEqual(expect.objectContaining({ versionId: ownVersion, step: "ohs" }));
    expect((await approveVersion(boss2.actor, ownVersion)).status).toBe("published");
    const rows = await db().select().from(ownerActions).where(eq(ownerActions.subjectId, ownVersion));
    expect(rows).toMatchObject([{ actorId: boss2.userId, permission: "content.approve_ohs", subjectType: "content_version" }]);

    // Gerçek İSG uzmanının onayı owner kaydı üretmez
    const id = await ohsText(p.smUretim.actor, p.org.units.pres, "Bölüm İSG içeriği");
    await submitForApproval(p.smUretim.actor, id, { changeNote: null, requireReread: false });
    const versionId = (await getContent(p.smUretim.actor, id)).versions[0]!.id;
    await approveVersion(p.ohs.actor, versionId);
    expect(await db().select().from(ownerActions).where(eq(ownerActions.subjectId, versionId))).toHaveLength(0);

    const err = await withActor(boss2.actor, (tx) => tx.delete(ownerActions)).catch((e: unknown) => e);
    expect(isImmutableViolation(err)).toBe(true);
  });
});
