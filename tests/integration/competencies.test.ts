import { and, eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { systemActor } from "@/server/authz/actor";
import { db } from "@/server/db/client";
import { competencyGrants, notifications } from "@/server/db/schema";
import { withActor } from "@/server/db/with-actor";
import { isImmutableViolation } from "@/server/errors";
import { myLearning, updateAssignment } from "@/server/services/assignments";
import { acknowledgeItem, learnModule, reportReachedEnd } from "@/server/services/assignments/learner";
import {
  archiveCompetency,
  competencyMatrix,
  createCompetency,
  grantCompetency,
  listCompetencies,
  myCompetencies,
  notifyCompetencyExpiring,
  revokeCompetencyGrant,
  type CompetencyInput,
} from "@/server/services/competencies";
import { createModule, getModule, saveTasks } from "@/server/services/modules";
import { markTask, practiceModule } from "@/server/services/practice";
import { approveReadiness } from "@/server/services/readiness";
import { owner } from "../support/db";
import { seedContentPeople } from "../support/content";
import { createTestUser } from "../support/factories";
import { moduleInput, publishCard } from "../support/training";


const def = (name: string, orgUnitId: string | null, validityMonths: number | null = 12): CompetencyInput => ({
  name,
  kind: "machine",
  description: null,
  orgUnitId,
  validityMonths,
});
const REASON = "2019'dan beri bu makinede çalışıyor.";

describe("Yetkinlik matrisi (iş paketi 3.1, kararlar #218–221)", () => {
  it("FG-7.4 tanımı bölüm sorumlusu kendi kapsamında, İSG uzmanı her yerde ve ortak olarak yapar", async () => {
    const p = await seedContentPeople();
    const pres = await createCompetency(p.smUretim.actor, def("Pres 250 ton", p.org.units.pres));
    await expect(createCompetency(p.smUretim.actor, def("Kalite ölçümü", p.org.units.kalite))).rejects.toMatchObject({ code: "forbidden" });
    await expect(createCompetency(p.smUretim.actor, def("Forklift", null))).rejects.toMatchObject({ code: "forbidden" });
    await createCompetency(p.ohs.actor, def("Forklift", null, 24));
    for (const who of [p.hr, p.trainerPres, p.personnel]) {
      await expect(createCompetency(who.actor, def("Deneme", p.org.units.pres))).rejects.toMatchObject({ code: "forbidden" });
    }
    await expect(createCompetency(p.ohs.actor, def("X", null))).rejects.toMatchObject({ code: "competency_name_invalid" });
    await expect(createCompetency(p.ohs.actor, def("Uzun süre", null, 500))).rejects.toMatchObject({ code: "validity_invalid" });
    // Bölüm sorumlusu kalite birimini görmez; ortak yetkinliği görür ama düzenleyemez
    const seen = await listCompetencies(p.smUretim.actor);
    expect(seen.find((c) => c.id === pres.id)?.canEdit).toBe(true);
    expect(seen.find((c) => c.name === "Forklift")?.canEdit).toBe(false);
    expect((await listCompetencies(p.smKalite.actor)).some((c) => c.id === pres.id)).toBe(false);
  });

  it("karar #219 elle verme: kapsam, gerekçe ve kendine verme yasağı; kayıt değiştirilemez, bir kez geri alınır", async () => {
    const p = await seedContentPeople();
    const c = await createCompetency(p.smUretim.actor, def("Pres 250 ton", p.org.units.pres));
    const worker = await createTestUser({ positionId: p.org.positions.presOp });
    const outsider = await createTestUser({ positionId: p.org.positions.kkTek });
    await expect(grantCompetency(p.smUretim.actor, { userId: worker.userId, competencyId: c.id, reason: "kısa" })).rejects.toMatchObject({ code: "reason_required" });
    await expect(grantCompetency(p.smUretim.actor, { userId: outsider.userId, competencyId: c.id, reason: REASON })).rejects.toMatchObject({ code: "forbidden" });
    await expect(grantCompetency(p.smUretim.actor, { userId: p.smUretim.userId, competencyId: c.id, reason: REASON })).rejects.toMatchObject({ code: "forbidden" });
    await expect(grantCompetency(p.ohs.actor, { userId: worker.userId, competencyId: c.id, reason: REASON })).rejects.toMatchObject({ code: "forbidden" });
    const boss = await createTestUser({ roles: ["owner"], positionId: p.org.positions.presOp });
    await expect(grantCompetency(boss.actor, { userId: boss.userId, competencyId: c.id, reason: REASON })).rejects.toMatchObject({ code: "forbidden" });

    const g = await grantCompetency(p.smUretim.actor, { userId: worker.userId, competencyId: c.id, reason: REASON });
    const [row] = await db().select().from(competencyGrants).where(eq(competencyGrants.id, g.id));
    expect(row).toMatchObject({ source: "manual", reason: REASON, grantedBy: p.smUretim.userId });
    expect(row!.validUntil!.getTime()).toBeGreaterThan(Date.now() + 360 * 86_400_000);

    const err = await withActor(p.smUretim.actor, (tx) => tx.update(competencyGrants).set({ reason: "değişti" }).where(eq(competencyGrants.id, g.id))).catch((e: unknown) => e);
    expect(isImmutableViolation(err)).toBe(true);
    await revokeCompetencyGrant(p.smUretim.actor, g.id, "Makine değişti, yeniden değerlendirilecek.");
    await expect(revokeCompetencyGrant(p.smUretim.actor, g.id, "İkinci kez geri alma denemesi")).rejects.toMatchObject({ code: "already_lifted" });
    const del = await withActor(p.smUretim.actor, (tx) => tx.delete(competencyGrants).where(eq(competencyGrants.id, g.id))).catch((e: unknown) => e);
    expect(isImmutableViolation(del)).toBe(true);

    await archiveCompetency(p.smUretim.actor, c.id);
    await expect(grantCompetency(p.smUretim.actor, { userId: worker.userId, competencyId: c.id, reason: REASON })).rejects.toMatchObject({ code: "competency_archived" });
  });

  it("FG-7.4 matris: kapsamdaki personel × birimin ve ortak yetkinlikler; renk durumu son geri alınmamış kayıttan", async () => {
    const p = await seedContentPeople();
    const pres = await createCompetency(p.smUretim.actor, def("Pres 250 ton", p.org.units.pres));
    const forklift = await createCompetency(p.ohs.actor, def("Forklift", null));
    const kalite = await createCompetency(p.ohs.actor, def("Mikrometre", p.org.units.kalite));
    const a = await createTestUser({ positionId: p.org.positions.presOp });
    const b = await createTestUser({ positionId: p.org.positions.presOp });
    await grantCompetency(p.smUretim.actor, { userId: a.userId, competencyId: pres.id, reason: REASON });
    // Biri süresi dolmuş, biri yaklaşan (doğrudan kayıt: geçmiş tarihli eğitim kaydı)
    await owner()`insert into competency_grants (id, user_id, competency_id, valid_until, source) values
      (gen_random_uuid(), ${b.userId}, ${pres.id}, now() - interval '3 days', 'training'),
      (gen_random_uuid(), ${a.userId}, ${forklift.id}, now() + interval '10 days', 'training')`;

    const m = await competencyMatrix(p.smUretim.actor, p.org.units.pres);
    expect(m.competencies.map((c) => c.id).sort()).toEqual([pres.id, forklift.id].sort());
    expect(m.competencies.some((c) => c.id === kalite.id)).toBe(false);
    const row = (id: string) => m.people.find((x) => x.userId === id)!;
    expect(row(a.userId).cells[pres.id]?.state).toBe("valid");
    expect(row(a.userId).cells[forklift.id]?.state).toBe("expiring");
    expect(row(b.userId).cells[pres.id]?.state).toBe("expired");
    expect(row(b.userId).cells[forklift.id]).toBeUndefined();
    // Kapsam dışı birim seçilemez; görme yetkisi olmayan göremez
    expect((await competencyMatrix(p.smUretim.actor, p.org.units.kalite)).unitId).toBeNull();
    await expect(competencyMatrix(p.trainerPres.actor, p.org.units.pres)).rejects.toMatchObject({ code: "forbidden" });
    // Kişi kendi yetkinliklerini görür (karar #221)
    expect((await myCompetencies(a.actor)).map((c) => [c.name, c.state]).sort()).toEqual([
      ["Forklift", "expiring"],
      ["Pres 250 ton", "valid"],
    ]);
  });

  it("karar #219 eğitimle verme: işe başlama onayında tek başına tamamlanan görevin (arşivlenmemiş) yetkinliği verilir", async () => {
    const p = await seedContentPeople();
    const sm = p.smUretim.actor;
    const press = await createCompetency(sm, def("Pres 250 ton", p.org.units.pres, 24));
    const old = await createCompetency(sm, def("Eski pres", p.org.units.pres));
    const practice = (await createModule(sm, moduleInput(p.org.units.pres, "practice", "Pres pratiği"))).id;
    await expect(saveTasks(sm, practice, [{ title: "Kalıp bağlama", description: null, isCritical: true, competencyId: (await createCompetency(p.ohs.actor, def("Kalite", p.org.units.kalite))).id }])).rejects.toMatchObject({
      code: "competency_invalid",
    });
    await saveTasks(sm, practice, [
      { title: "Kalıp bağlama", description: null, isCritical: true, competencyId: press.id },
      { title: "Eski pres ayarı", description: null, isCritical: false, competencyId: old.id },
    ]);
    expect((await getModule(sm, practice)).tasks.map((t) => t.competencyName)).toEqual(["Pres 250 ton", "Eski pres"]);
    const { cardModuleId } = await publishCard(p, p.org.positions.presOp, [practice], sm);
    const u = await createTestUser({ positionId: p.org.positions.presOp, trainingRequired: true });
    let cur = (await myLearning(u.actor)).current!;
    const card = await learnModule(u.actor, cur.modules.find((m) => m.moduleId === cardModuleId)!.id);
    for (const item of card.items) {
      await reportReachedEnd(u.actor, item.id);
      await acknowledgeItem(u.actor, item.id);
    }
    await updateAssignment(p.hr.actor, cur.id, { trainerUserId: p.trainerPres.userId, targetDate: null });
    cur = (await myLearning(u.actor)).current!;
    const am = cur.modules.find((m) => m.moduleId === practice)!.id;
    for (const t of (await practiceModule(p.trainerPres.actor, am)).tasks.map((x) => x.taskId)) {
      for (;;) {
        const task = (await practiceModule(p.trainerPres.actor, am)).tasks.find((x) => x.taskId === t)!;
        if (!task.next) break;
        await markTask(p.trainerPres.actor, am, t, { level: task.next, note: null, photoAssetIds: [] });
      }
    }
    await archiveCompetency(sm, old.id);
    await approveReadiness(sm, cur.id, null);
    const grants = await db().select().from(competencyGrants).where(eq(competencyGrants.userId, u.userId));
    expect(grants.map((g) => [g.competencyId, g.source])).toEqual([[press.id, "training"]]);
    expect(grants[0]!.certificateId).not.toBeNull();
    const months = (grants[0]!.validUntil!.getTime() - Date.now()) / (30.4 * 86_400_000);
    expect(Math.round(months)).toBe(24);
  });

  it("karar #220 süresi yaklaşan yetkinlik: kişinin bölüm sorumlusuna bir kez bildirim; anonimleştirmede gerekçe silinir", async () => {
    const p = await seedContentPeople();
    const c = await createCompetency(p.smUretim.actor, def("Pres 250 ton", p.org.units.pres));
    const worker = await createTestUser({ positionId: p.org.positions.presOp });
    await owner()`insert into competency_grants (id, user_id, competency_id, valid_until, source) values (gen_random_uuid(), ${worker.userId}, ${c.id}, now() + interval '5 days', 'training')`;
    const actor = systemActor("test");
    expect(await notifyCompetencyExpiring(actor)).toBeGreaterThanOrEqual(1);
    await notifyCompetencyExpiring(actor);
    const sent = await db()
      .select()
      .from(notifications)
      .where(and(eq(notifications.userId, p.smUretim.userId), eq(notifications.kind, "competency_expiring")));
    expect(sent).toHaveLength(1);
    expect(sent[0]!.params).toMatchObject({ competency: "Pres 250 ton" });

    // Anonimleştirme: elle verilmiş kaydın gerekçesi silinir
    const leaver = await createTestUser({ positionId: p.org.positions.presOp });
    await grantCompetency(p.smUretim.actor, { userId: leaver.userId, competencyId: c.id, reason: REASON });
    await owner()`update personnel set status = 'terminated', end_date = '2000-01-01' where user_id = ${leaver.userId}`;
    await withActor(actor, async (tx) => {
      await tx.execute(sql`select app_anonymize_people(array[${leaver.userId}]::uuid[])`);
      await tx.execute(sql`select app_anonymize_competency_grants(array[${leaver.userId}]::uuid[])`);
    });
    const [g] = await db().select({ reason: competencyGrants.reason }).from(competencyGrants).where(eq(competencyGrants.userId, leaver.userId));
    expect(g?.reason).toBe("ANON");
  });
});
