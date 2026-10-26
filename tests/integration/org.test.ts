import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { systemActor } from "@/server/authz/actor";
import { isPersonInScope, orgScopeFor } from "@/server/authz/scope";
import { db } from "@/server/db/client";
import { auditLog } from "@/server/db/schema";
import { ForbiddenError } from "@/server/errors";
import {
  createOrgUnit,
  createPosition,
  getOrgTree,
  setOrgUnitActive,
  setPositionStatus,
  updateOrgUnit,
} from "@/server/services/org";
import { setSectionManagerScopes } from "@/server/services/roles";
import { owner } from "../support/db";
import { createTestUser } from "../support/factories";
import { seedTestOrg } from "../support/org";

const sys = systemActor("test");

describe("FG-1.1 organizasyon ağacı", () => {
  it("departman → bölüm → pozisyon ağacını kurar ve pozisyon başına aktif personel sayar", async () => {
    const org = await seedTestOrg();
    const { userId } = await createTestUser();
    await owner()`update personnel set position_id = ${org.positions.presOp} where user_id = ${userId}`;

    const tree = await getOrgTree(sys);
    const uretim = tree.find((n) => n.code === "URETIM")!;
    expect(uretim.children.map((c) => c.code).sort()).toEqual(["MONTAJ", "PRES"]);
    expect(uretim.positions.map((p) => p.code)).toEqual(["URETIM-MUDUR"]);
    const pres = uretim.children.find((c) => c.code === "PRES")!;
    expect(pres.positions[0]).toMatchObject({ code: "PRES-OP", activePersonnel: 1 });
  });

  it("bölüm yalnızca bir departmanın altına eklenir (ağaç iki seviyeli)", async () => {
    const org = await seedTestOrg();
    await expect(createOrgUnit(sys, { kind: "section", parentId: org.units.pres, name: "Alt", code: "ALT" })).rejects.toMatchObject({
      code: "parent_must_be_department",
    });
    await expect(createOrgUnit(sys, { kind: "section", name: "Yetim", code: "YETIM" })).rejects.toMatchObject({
      code: "parent_required",
    });
  });

  it("kod benzersizdir ve Türkçe karakterler ASCII'ye çevrilir", async () => {
    const { id } = await createOrgUnit(sys, { kind: "department", name: "Lojistik", code: "lojistik şube" });
    const tree = await getOrgTree(sys);
    expect(tree.find((n) => n.id === id)?.code).toBe("LOJISTIK-SUBE");
    await expect(createOrgUnit(sys, { kind: "department", name: "Başka", code: "LOJISTIK-SUBE" })).rejects.toMatchObject({
      code: "code_taken",
    });
  });

  it("aynı departman altında aynı adda iki bölüm olamaz", async () => {
    const org = await seedTestOrg();
    await expect(createOrgUnit(sys, { kind: "section", parentId: org.units.uretim, name: "Montaj", code: "MONTAJ2" })).rejects.toMatchObject({
      code: "name_taken",
    });
  });

  it("altında aktif bölüm veya pozisyon olan birim pasife alınamaz", async () => {
    const org = await seedTestOrg();
    await expect(setOrgUnitActive(sys, org.units.uretim, false)).rejects.toMatchObject({ code: "has_active_children" });
    await expect(setOrgUnitActive(sys, org.units.kalite, false)).rejects.toMatchObject({ code: "has_active_positions" });

    await setPositionStatus(sys, org.positions.kkTek, "passive");
    await setOrgUnitActive(sys, org.units.kalite, false);
    const tree = await getOrgTree(sys);
    expect(tree.find((n) => n.code === "KALITE")?.isActive).toBe(false);
  });

  it("pasif departmanın altına bölüm/pozisyon eklenemez", async () => {
    const org = await seedTestOrg();
    await setPositionStatus(sys, org.positions.kkTek, "passive");
    await setOrgUnitActive(sys, org.units.kalite, false);
    await expect(createPosition(sys, { orgUnitId: org.units.kalite, name: "Yeni", code: "YENI", collarType: "blue" })).rejects.toMatchObject({
      code: "org_unit_inactive",
    });
  });

  it("çalışan personeli olan pozisyon pasife alınamaz", async () => {
    const org = await seedTestOrg();
    const { userId } = await createTestUser();
    await owner()`update personnel set position_id = ${org.positions.kkTek} where user_id = ${userId}`;
    await expect(setPositionStatus(sys, org.positions.kkTek, "passive")).rejects.toMatchObject({ code: "has_active_personnel" });
  });

  it("yalnızca İK ve sistem yöneticisi organizasyonu düzenler", async () => {
    const org = await seedTestOrg();
    for (const roles of [[], ["trainer"], ["section_manager"], ["ohs_specialist"], ["security"]] as const) {
      const { actor } = await createTestUser({ roles: [...roles] });
      await expect(createOrgUnit(actor, { kind: "department", name: "X", code: "X1" })).rejects.toBeInstanceOf(ForbiddenError);
      await expect(updateOrgUnit(actor, org.units.kalite, { name: "Y", code: "KALITE" })).rejects.toBeInstanceOf(ForbiddenError);
    }
    const hr = await createTestUser({ roles: ["hr"] });
    await expect(createOrgUnit(hr.actor, { kind: "department", name: "Satın Alma", code: "SATINALMA" })).resolves.toBeDefined();
  });

  it("değişiklikler denetim kaydına yazılır", async () => {
    const hr = await createTestUser({ roles: ["hr"] });
    const { id } = await createOrgUnit(hr.actor, { kind: "department", name: "Bakım", code: "BAKIM" });
    await updateOrgUnit(hr.actor, id, { name: "Bakım Onarım", code: "BAKIM" });
    const rows = await db().select().from(auditLog).where(eq(auditLog.recordId, id));
    expect(rows.map((r) => [r.action, r.actorId])).toEqual([
      ["INSERT", hr.userId],
      ["UPDATE", hr.userId],
    ]);
  });
});

describe("Bölüm sorumlusu kapsamı (SPEC 2.2)", () => {
  it("departmana atanan sorumlu altındaki bölümleri de görür; bölüme atanan yalnızca o bölümü", async () => {
    const org = await seedTestOrg();
    const admin = await createTestUser({ roles: ["sysadmin"] });
    const deptMgr = await createTestUser({ roles: ["section_manager"] });
    const sectionMgr = await createTestUser({ roles: ["section_manager"] });
    await setSectionManagerScopes(admin.actor, deptMgr.userId, [org.units.uretim]);
    await setSectionManagerScopes(admin.actor, sectionMgr.userId, [org.units.pres]);

    const deptScope = await orgScopeFor(deptMgr.actor);
    const sectionScope = await orgScopeFor(sectionMgr.actor);
    expect(deptScope.all).toBe(false);
    if (!deptScope.all) expect([...deptScope.orgUnitIds].sort()).toEqual([org.units.uretim, org.units.pres, org.units.montaj].sort());
    if (!sectionScope.all) expect([...sectionScope.orgUnitIds]).toEqual([org.units.pres]);

    const tree = await getOrgTree(sectionMgr.actor);
    expect(tree).toHaveLength(1);
    expect(tree[0]!.children.map((c) => c.code)).toEqual(["PRES"]);
    expect(tree[0]!.positions).toEqual([]);
  });

  it("kapsam dışı kişi kapsamda görünmez; kapsamı olmayan sorumlu hiçbir şey görmez", async () => {
    const org = await seedTestOrg();
    const admin = await createTestUser({ roles: ["sysadmin"] });
    const mgr = await createTestUser({ roles: ["section_manager"] });
    await setSectionManagerScopes(admin.actor, mgr.userId, [org.units.pres]);

    const presWorker = await createTestUser();
    const kaliteWorker = await createTestUser();
    await owner()`update personnel set position_id = ${org.positions.presOp} where user_id = ${presWorker.userId}`;
    await owner()`update personnel set position_id = ${org.positions.kkTek} where user_id = ${kaliteWorker.userId}`;

    expect(await isPersonInScope(mgr.actor, presWorker.userId)).toBe(true);
    expect(await isPersonInScope(mgr.actor, kaliteWorker.userId)).toBe(false);

    const noScope = await createTestUser({ roles: ["section_manager"] });
    expect(await isPersonInScope(noScope.actor, presWorker.userId)).toBe(false);
    await expect(getOrgTree(noScope.actor)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("personel ve eğitmen kapsamı boştur", async () => {
    await seedTestOrg();
    for (const roles of [[], ["trainer"]] as const) {
      const u = await createTestUser({ roles: [...roles] });
      expect(await orgScopeFor(u.actor)).toEqual({ all: false, orgUnitIds: new Set() });
    }
  });
});
