import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { systemActor } from "@/server/authz/actor";
import { db } from "@/server/db/client";
import {
  auditLog,
  competencies,
  contents,
  contractorCompanies,
  devices,
  legalTexts,
  loginAttempts,
  modules,
  orgUnits,
  personnel,
  positionCardVersions,
  positions,
  practiceTasks,
  questions,
  questionVersions,
  tags,
  users,
  visitors,
  visits,
} from "@/server/db/schema";
import { ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { todayIn } from "@/lib/dates";
import { signIn } from "@/server/services/auth";
import { createClassroomSession, submitClassroomSession } from "@/server/services/classroom";
import { createCompetency, grantCompetency } from "@/server/services/competencies";
import { createContent, createTag, listTags, saveDraft } from "@/server/services/content";
import { checkDeletion, deleteRecord } from "@/server/services/deletion";
import { registerDevice } from "@/server/services/devices";
import { erasePerson, personDeletePath } from "@/server/services/erasure";
import { acceptConsent, createDraft, publishText } from "@/server/services/legal";
import { createModule, saveTasks, setModuleContents } from "@/server/services/modules";
import { createOrgUnit, createPosition, setPositionStatus } from "@/server/services/org";
import { getPerson, listPeople, setPersonStatus } from "@/server/services/people";
import { approveQuestionVersion, createQuestion, questionApprovalQueue, type QuestionInput } from "@/server/services/questions";
import { parseFilters, runReport } from "@/server/services/reports";
import { setSectionManagerScopes } from "@/server/services/roles";
import { createCompany, createVisit } from "@/server/services/visitors";
import { createCard } from "@/server/services/positions";
import { owner } from "../support/db";
import { seedContentPeople, textBody } from "../support/content";
import { createTestUser, meta } from "../support/factories";
import { moduleInput, presTraining, publishedText } from "../support/training";

/**
 * İş paketi 3.14 — kayıt silme (kararlar #283–288).
 * Bağı olmayan kayıt silinir; bağlı kayıt varsa önce onların silinmesi istenir; geçmiş kayıtlarda kullanılan kayıt
 * silinemez (arşivlenir). Anonimleştirilen kişi hiçbir listede görünmez.
 */

const sys = systemActor("test");
const today = () => todayIn("Europe/Istanbul");

const exists = async (table: typeof orgUnits | typeof positions | typeof modules | typeof contents | typeof questions | typeof tags | typeof competencies, id: string) =>
  (await db().select({ id: table.id }).from(table).where(eq(table.id, id))).length > 0;

const question = (moduleId: string, stem: string, extra: Partial<QuestionInput> = {}): QuestionInput => ({
  type: "single_choice",
  stem,
  options: ["Doğru şık", "Yanlış şık bir", "Yanlış şık iki"],
  correctIndex: 0,
  explanation: null,
  topic: "Pres",
  difficulty: 1,
  isOhsCritical: false,
  mediaAssetId: null,
  moduleIds: [moduleId],
  ...extra,
});

async function expectCode(p: Promise<unknown>, type: typeof ValidationError | typeof ForbiddenError | typeof NotFoundError, code?: string) {
  const err = await p.catch((e: unknown) => e);
  expect(err).toBeInstanceOf(type);
  if (code && err instanceof ForbiddenError) expect(err.permission).toBe(code);
  else if (code) expect((err as { code: string }).code).toBe(code);
}

describe("İş paketi 3.14 — organizasyon (FG-1.1)", () => {
  it("3.14 karar #283: bölümü olan departman silinmez; önce bölüm, sonra departman silinir; deneme silme geri alınır", async () => {
    const hr = await createTestUser({ roles: ["hr"] });
    const dept = (await createOrgUnit(sys, { kind: "department", name: "Lojistik", code: "LOJ" })).id;
    const sec = (await createOrgUnit(sys, { kind: "section", parentId: dept, name: "Depo", code: "DEPO" })).id;

    expect(await checkDeletion(hr.actor, "org_unit", dept)).toEqual({ state: "blocked", blockers: [{ kind: "sections", count: 1 }] });
    const err = await deleteRecord(hr.actor, "org_unit", dept).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect(err).toMatchObject({ code: "delete_blocked", details: [{ kind: "sections", count: 1 }] });

    // Pencere açılırken yapılan deneme silme hiçbir şeyi silmez
    expect(await checkDeletion(hr.actor, "org_unit", sec)).toEqual({ state: "ok" });
    expect(await exists(orgUnits, sec)).toBe(true);

    await deleteRecord(hr.actor, "org_unit", sec);
    await deleteRecord(hr.actor, "org_unit", dept);
    expect(await exists(orgUnits, sec)).toBe(false);
    expect(await exists(orgUnits, dept)).toBe(false);
    // Silinen satır denetim kaydında eski hâliyle durur
    const [audit] = await db().select().from(auditLog).where(and(eq(auditLog.tableName, "org_units"), eq(auditLog.recordId, dept), sql`lower(${auditLog.action}) like 'delete%'`));
    expect(audit?.oldData).toMatchObject({ name: "Lojistik" });
  });

  it("3.14 karar #283: pozisyonu, bölüm sorumlusu yetkisi olan bölüm silinmez; yetkisiz kişi silemez", async () => {
    const hr = await createTestUser({ roles: ["hr"] });
    const worker = await createTestUser();
    const dept = (await createOrgUnit(sys, { kind: "department", name: "Bakım", code: "BAKIM" })).id;
    const pos = (await createPosition(sys, { orgUnitId: dept, name: "Bakım Teknisyeni", code: "BAKIM-TEK", collarType: "blue" })).id;
    const sm = await createTestUser({ roles: ["section_manager"] });
    await setSectionManagerScopes(sys, sm.userId, [dept]);

    expect(await checkDeletion(hr.actor, "org_unit", dept)).toEqual({
      state: "blocked",
      blockers: [
        { kind: "positions", count: 1 },
        { kind: "unit_scopes", count: 1 },
      ],
    });
    await expectCode(checkDeletion(worker.actor, "org_unit", dept), ForbiddenError, "org.manage");
    await expectCode(deleteRecord(worker.actor, "position", pos), ForbiddenError, "org.manage");
  });

  it("3.14 karar #283: personeli olan pozisyon silinmez; boş pozisyon kart taslağıyla birlikte silinir", async () => {
    const p = await seedContentPeople();
    const worker = await createTestUser({ positionId: p.org.positions.montajOp });
    expect(await checkDeletion(p.hr.actor, "position", p.org.positions.montajOp)).toEqual({ state: "blocked", blockers: [{ kind: "personnel", count: 1 }] });
    await owner()`update personnel set position_id = null where user_id = ${worker.userId}`;

    // Yayınlanmamış kart taslağı pozisyonla birlikte silinir
    await createCard(p.smUretim.actor, p.org.positions.montajOp);
    expect(await checkDeletion(p.hr.actor, "position", p.org.positions.montajOp)).toEqual({ state: "ok" });
    await deleteRecord(p.hr.actor, "position", p.org.positions.montajOp);
    expect(await exists(positions, p.org.positions.montajOp)).toBe(false);
    expect(await db().select().from(positionCardVersions).where(eq(positionCardVersions.positionId, p.org.positions.montajOp))).toHaveLength(0);
  });

  it("3.14 karar #284: yayınlanmış kartı olan pozisyon silinemez, pasife alınır; amir seçen pozisyon bağdır", async () => {
    const p = await seedContentPeople();
    await presTraining(p);
    await owner()`update personnel set position_id = null where user_id = ${p.trainerPres.userId}`;
    expect(await checkDeletion(p.hr.actor, "position", p.org.positions.presOp)).toEqual({ state: "history" });
    await expectCode(deleteRecord(p.hr.actor, "position", p.org.positions.presOp), ValidationError, "delete_in_history");
    expect(await exists(positions, p.org.positions.presOp)).toBe(true);
    await setPositionStatus(p.hr.actor, p.org.positions.presOp, "passive");

    await owner()`update positions set supervisor_position_id = ${p.org.positions.mudur} where id = ${p.org.positions.kkTek}`;
    expect(await checkDeletion(p.hr.actor, "position", p.org.positions.mudur)).toEqual({ state: "blocked", blockers: [{ kind: "linked_positions", count: 1 }] });
  });
});

describe("İş paketi 3.14 — personel (SPEC 4.1)", () => {
  it("3.14 karar #285: sistemi kullanmamış kişiyi İK siler; giriş denemesi ayrılır, denetim kaydındaki kişi verisi maskelenir", async () => {
    const hr = await createTestUser({ roles: ["hr"] });
    const target = await createTestUser({ email: `${randomUUID().slice(0, 8)}@japar.test`, phone: "+905551112233" });
    const [before] = await db().select({ fullName: personnel.fullName }).from(personnel).where(eq(personnel.userId, target.userId));
    // Yanlış şifreyle giriş denemesi kişiye bağlı kayıt bırakır (değiştirilemez)
    expect((await signIn({ sicilNo: target.sicilNo, password: "yanlis-sifre-1", sharedDevice: false }, meta())).ok).toBe(false);
    expect(await db().select().from(loginAttempts).where(eq(loginAttempts.userId, target.userId))).not.toHaveLength(0);

    expect(await checkDeletion(hr.actor, "person", target.userId)).toEqual({ state: "ok" });
    await deleteRecord(hr.actor, "person", target.userId);

    expect(await db().select().from(personnel).where(eq(personnel.userId, target.userId))).toHaveLength(0);
    expect(await db().select().from(users).where(eq(users.id, target.userId))).toHaveLength(0);
    expect(await db().select().from(loginAttempts).where(eq(loginAttempts.userId, target.userId))).toHaveLength(0);
    const audit = await db().select().from(auditLog).where(and(eq(auditLog.tableName, "personnel"), eq(auditLog.recordId, target.userId)));
    expect(audit.length).toBeGreaterThan(0);
    for (const row of audit) expect(JSON.stringify([row.oldData, row.newData])).not.toContain(before!.fullName);
    await expectCode(getPerson(hr.actor, target.userId), NotFoundError);
  });

  it("3.14 karar #285: geçmişi olan kişi silinemez; kendi hesabını ve yetkili hesabı İK silemez", async () => {
    const p = await seedContentPeople();
    const c = await createCompetency(p.smUretim.actor, { name: "Pres 250 ton", kind: "machine", description: null, orgUnitId: p.org.units.pres, validityMonths: null });
    const worker = await createTestUser({ positionId: p.org.positions.presOp });
    await grantCompetency(p.smUretim.actor, { userId: worker.userId, competencyId: c.id, reason: "2019'dan beri bu makinede çalışıyor." });
    expect(await checkDeletion(p.hr.actor, "person", worker.userId)).toEqual({ state: "history" });
    await expectCode(deleteRecord(p.hr.actor, "person", worker.userId), ValidationError, "delete_in_history");

    await expectCode(checkDeletion(p.hr.actor, "person", p.hr.userId), ValidationError, "self_delete");
    const boss = await createTestUser({ roles: ["owner"] });
    await expectCode(checkDeletion(p.hr.actor, "person", boss.userId), ForbiddenError);
    await expectCode(checkDeletion(p.personnel.actor, "person", worker.userId), ForbiddenError, "people.manage");
  });

  it("karar #290: kişi sayfası silme yolunu baştan bilir; deneme hiçbir şeyi silmez", async () => {
    const p = await seedContentPeople();
    const fresh = await createTestUser({ positionId: p.org.positions.presOp });
    expect(await personDeletePath(p.hr.actor, fresh.userId)).toBe("delete");
    // Deneme silme geri alınır: kişi yerinde, denetim kaydında silme yok
    expect(await db().select().from(personnel).where(eq(personnel.userId, fresh.userId))).toHaveLength(1);
    expect(await db().select().from(users).where(eq(users.id, fresh.userId))).toHaveLength(1);
    const deletes = await db()
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.tableName, "personnel"), eq(auditLog.recordId, fresh.userId), eq(auditLog.action, "DELETE")));
    expect(deletes).toHaveLength(0);

    // KVKK onayı veren kişinin geçmiş kaydı vardır: işten ayrıldı + üst yöneticinin kalıcı silmesi
    const tr = await createDraft(p.hr.actor, { title: "Aydınlatma Metni", body: "Kişisel verileriniz eğitim süreçleri için işlenmektedir. ".repeat(3) });
    await createDraft(p.hr.actor, { title: "Privacy Notice", body: "Your personal data is processed for training purposes. ".repeat(3) }, "kvkk_personnel", "en");
    await publishText(p.hr.actor, tr.id);
    const consented = await createTestUser({ positionId: p.org.positions.presOp });
    await acceptConsent(consented.actor, tr.id, { ip: "10.0.0.1", userAgent: "vitest" });
    expect(await personDeletePath(p.hr.actor, consented.userId)).toBe("history");

    // İK yetkili hesabı silemez; üst yönetici silebilir
    const boss = await createTestUser({ roles: ["owner"] });
    const admin = await createTestUser({ roles: ["sysadmin"] });
    expect(await personDeletePath(p.hr.actor, boss.userId)).toBe("owner_only");
    expect(await personDeletePath(p.hr.actor, admin.userId)).toBe("sysadmin_only");
    expect(await personDeletePath(boss.actor, admin.userId)).toBe("delete");
    await expectCode(personDeletePath(p.personnel.actor, fresh.userId), ForbiddenError, "people.manage");
  });

  it("3.14 karar #285: kalıcı silinen (anonim) kişi kişi listesinde, kişi sayfasında ve kişi bazlı raporda görünmez", async () => {
    const p = await seedContentPeople();
    const worker = await createTestUser({ positionId: p.org.positions.presOp, trainingRequired: true });
    await presTraining(p);
    const boss = await createTestUser({ roles: ["owner"] });
    const report = async () => (await runReport(p.hr.actor, "training", await parseFilters("training", {}))).tables[0]!.rows.map((r) => r[0]);
    expect(await report()).toContain(worker.sicilNo);

    await setPersonStatus(p.hr.actor, worker.userId, { status: "terminated", endDate: today() });
    const [row] = await db().select({ fullName: personnel.fullName }).from(personnel).where(eq(personnel.userId, worker.userId));
    expect((await listPeople(p.hr.actor, { status: "all", q: worker.sicilNo })).total).toBe(1);
    await erasePerson(boss.actor, worker.userId, { reason: "KVKK silme talebi, test başvurusu", confirmation: `${row!.fullName} silmeyi onaylıyorum` });

    const all = await listPeople(p.hr.actor, { status: "all" });
    expect(all.items.some((x) => x.userId === worker.userId)).toBe(false);
    expect((await listPeople(p.hr.actor, { status: "all", q: "Anonim" })).total).toBe(0);
    await expectCode(getPerson(p.hr.actor, worker.userId), NotFoundError);
    expect(await report()).not.toContain(worker.sicilNo);
    // Satır geçmiş kayıtlar için veritabanında kalır
    expect(await db().select().from(personnel).where(eq(personnel.userId, worker.userId))).toHaveLength(1);
  });
});

describe("İş paketi 3.14 — eğitim içerikleri (FG-2)", () => {
  it("3.14 karar #283: sorusu olan modül silinmez; kullanılmamış modül görevleri ve ara değerlendirmesiyle silinir", async () => {
    const p = await seedContentPeople();
    const sm = p.smUretim.actor;
    const theory = (await createModule(sm, moduleInput(p.org.units.pres, "theory", "Pres teorisi"))).id;
    const q = await createQuestion(sm, { ...question(theory, "Pres nasıl durdurulur?"), ownerOrgUnitId: p.org.units.pres, isOhs: false });
    expect(await checkDeletion(sm, "module", theory)).toEqual({ state: "blocked", blockers: [{ kind: "module_questions", count: 1 }] });

    // Soru silinince modül de silinir
    await deleteRecord(sm, "question", q.id);
    expect(await exists(questions, q.id)).toBe(false);
    expect(await db().select().from(questionVersions).where(eq(questionVersions.questionId, q.id))).toHaveLength(0);
    await deleteRecord(sm, "module", theory);
    expect(await exists(modules, theory)).toBe(false);

    const practice = (await createModule(sm, moduleInput(p.org.units.pres, "practice", "Pres pratiği"))).id;
    await saveTasks(sm, practice, [{ title: "Kalıp bağlama", description: null, isCritical: true }]);
    await deleteRecord(sm, "module", practice);
    expect(await exists(modules, practice)).toBe(false);
    // Kapsam dışındaki modül görünmez
    await expectCode(checkDeletion(p.smKalite.actor, "module", (await createModule(sm, moduleInput(p.org.units.pres, "theory", "Başka"))).id), NotFoundError);
  });

  it("3.14 karar #284: yayınlanmış planda kullanılan modül ve yayınlanmış içerik silinemez; modüldeki içerik bağdır", async () => {
    const p = await seedContentPeople();
    const t = await presTraining(p);
    const sm = p.smUretim.actor;
    expect(await checkDeletion(sm, "module", t.theory)).toEqual({ state: "history" });
    expect(await checkDeletion(sm, "content", t.c1)).toEqual({ state: "blocked", blockers: [{ kind: "content_modules", count: 1 }] });
    const lone = await publishedText(sm, p.org.units.pres, "Tek içerik", "metin");
    expect(await checkDeletion(sm, "content", lone)).toEqual({ state: "history" });
    // Kart modülü silinmez (pozisyonla birlikte gider)
    await expectCode(checkDeletion(sm, "module", t.cardModuleId), ForbiddenError);
  });

  it("3.14 karar #283: taslak içerik silinir; içerikte kullanılan etiket silinmez, kullanılmayan silinir", async () => {
    const p = await seedContentPeople();
    const sm = p.smUretim.actor;
    const machine = (await listTags(sm)).find((g) => g.key === "machine")!;
    const used = await createTag(sm, { tagTypeId: machine.typeId, name: "Hidrolik Pres" });
    const unused = await createTag(sm, { tagTypeId: machine.typeId, name: "Kaynak makinesi" });
    const { id } = await createContent(sm, { type: "text", title: "Taslak", ownerOrgUnitId: p.org.units.pres, commonTarget: null, isOhs: false });
    await saveDraft(sm, id, { title: "Taslak", body: textBody("metin"), tagIds: [used.id] });

    expect(await checkDeletion(sm, "tag", used.id)).toEqual({ state: "blocked", blockers: [{ kind: "tagged_contents", count: 1 }] });
    await deleteRecord(sm, "tag", unused.id);
    expect(await exists(tags, unused.id)).toBe(false);

    await deleteRecord(sm, "content", id);
    expect(await exists(contents, id)).toBe(false);
    await deleteRecord(sm, "tag", used.id);
    expect(await exists(tags, used.id)).toBe(false);
  });

  it("3.14 karar #284: İSG onayı almış soru silinemez", async () => {
    const p = await seedContentPeople();
    const m = (await createModule(p.smUretim.actor, moduleInput(p.org.units.pres, "theory", "Modül"))).id;
    const critical = await createQuestion(p.smUretim.actor, { ...question(m, "Kritik soru metni", { isOhsCritical: true }), ownerOrgUnitId: p.org.units.pres, isOhs: false });
    const [pending] = await questionApprovalQueue(p.ohs.actor);
    await approveQuestionVersion(p.ohs.actor, pending!.versionId);
    expect(await checkDeletion(p.smUretim.actor, "question", critical.id)).toEqual({ state: "history" });
    await expectCode(checkDeletion(p.trainerPres.actor, "question", critical.id), ForbiddenError);
  });

  it("3.14: listeden çıkarılan, hiç işaretlenmemiş pratik görev silinir", async () => {
    const p = await seedContentPeople();
    const sm = p.smUretim.actor;
    const practice = (await createModule(sm, moduleInput(p.org.units.pres, "practice", "Pres pratiği"))).id;
    await saveTasks(sm, practice, [
      { title: "Kalıp bağlama", description: null, isCritical: true },
      { title: "Yağ kontrolü", description: null, isCritical: false },
    ]);
    const [keep] = await db().select().from(practiceTasks).where(and(eq(practiceTasks.moduleId, practice), eq(practiceTasks.title, "Kalıp bağlama")));
    await saveTasks(sm, practice, [{ id: keep!.id, title: "Kalıp bağlama", description: null, isCritical: true }]);
    const rows = await db().select({ title: practiceTasks.title }).from(practiceTasks).where(eq(practiceTasks.moduleId, practice));
    expect(rows).toEqual([{ title: "Kalıp bağlama" }]);
  });

  it("3.14 karar #283–284: pratik görevde kullanılan yetkinlik silinmez, verilmiş yetkinlik silinemez, kullanılmayan silinir", async () => {
    const p = await seedContentPeople();
    const sm = p.smUretim.actor;
    const def = (name: string) => ({ name, kind: "machine" as const, description: null, orgUnitId: p.org.units.pres, validityMonths: null });
    const linked = await createCompetency(sm, def("Pres 250 ton"));
    const granted = await createCompetency(sm, def("Pres 400 ton"));
    const free = await createCompetency(sm, def("Pres 100 ton"));
    const practice = (await createModule(sm, moduleInput(p.org.units.pres, "practice", "Pres pratiği"))).id;
    await saveTasks(sm, practice, [{ title: "Kalıp bağlama", description: null, isCritical: true, competencyId: linked.id }]);
    const worker = await createTestUser({ positionId: p.org.positions.presOp });
    await grantCompetency(sm, { userId: worker.userId, competencyId: granted.id, reason: "2019'dan beri bu makinede çalışıyor." });

    expect(await checkDeletion(sm, "competency", linked.id)).toEqual({ state: "blocked", blockers: [{ kind: "competency_tasks", count: 1 }] });
    expect(await checkDeletion(sm, "competency", granted.id)).toEqual({ state: "history" });
    await deleteRecord(sm, "competency", free.id);
    expect(await exists(competencies, free.id)).toBe(false);
  });

  it("3.14: onaya gönderilmemiş sınıf eğitimi kaydını yalnızca kaydı tutan siler; gönderilen silinmez", async () => {
    const p = await seedContentPeople();
    const c = await publishedText(p.smUretim.actor, p.org.units.pres, "Pres kuralları", "metin");
    const m = (await createModule(p.smUretim.actor, moduleInput(p.org.units.pres, "theory", "Pres sınıf eğitimi"))).id;
    await setModuleContents(p.smUretim.actor, m, [c]);
    const form = await owner()`
      insert into media_assets (id, kind, status, object_key, mime, size, original_name, created_by)
      values (gen_random_uuid(), 'image', 'ready', 'media/d/original.jpg', 'image/jpeg', 10, 'form.jpg', ${p.hr.userId}) returning id`;
    const input = { moduleId: m, trainerUserId: p.smUretim.userId, sessionDate: "2026-02-01", durationMin: 60, location: "Salon", notes: null, scannedFormAssetId: form[0]!.id, attendeeIds: [p.personnel.userId] };
    const draft = await createClassroomSession(p.hr.actor, input);
    await expectCode(checkDeletion(p.smUretim.actor, "classroom_session", draft.id), ForbiddenError);
    await deleteRecord(p.hr.actor, "classroom_session", draft.id);
    expect(await owner()`select id from classroom_sessions where id = ${draft.id}`).toHaveLength(0);

    const sent = await createClassroomSession(p.hr.actor, input);
    await submitClassroomSession(p.hr.actor, sent.id);
    await expectCode(checkDeletion(p.hr.actor, "classroom_session", sent.id), ValidationError, "classroom_not_editable");
  });
});

describe("İş paketi 3.14 — ziyaretçi, cihaz, hukuki metin", () => {
  it("3.14: firma, ön kayıt (ziyaretçisiyle) ve ortak cihaz silinir; yetkisiz silemez", async () => {
    const security = await createTestUser({ roles: ["security"] });
    const host = await createTestUser();
    const other = await createTestUser();
    const sysadmin = await createTestUser({ roles: ["sysadmin"] });

    const company = await createCompany(security.actor, { name: "Silinecek Ltd." });
    await expectCode(checkDeletion(host.actor, "company", company.id), ForbiddenError, "contractors.manage");
    await deleteRecord(security.actor, "company", company.id);
    expect(await db().select().from(contractorCompanies).where(eq(contractorCompanies.id, company.id))).toHaveLength(0);

    const visit = await createVisit(security.actor, { visitorType: "office", plannedDate: today(), fullName: "Silinecek Misafir", hostSicilNo: host.sicilNo });
    const [v] = await db().select({ visitorId: visits.visitorId }).from(visits).where(eq(visits.id, visit.id));
    await expectCode(checkDeletion(other.actor, "visit", visit.id), NotFoundError);
    await deleteRecord(host.actor, "visit", visit.id);
    expect(await db().select().from(visits).where(eq(visits.id, visit.id))).toHaveLength(0);
    expect(await db().select().from(visitors).where(eq(visitors.id, v!.visitorId))).toHaveLength(0);

    const device = await registerDevice(sysadmin.actor, { name: "Eğitim odası 1" });
    await expectCode(checkDeletion(security.actor, "device", device.id), ForbiddenError, "devices.manage");
    await deleteRecord(sysadmin.actor, "device", device.id);
    expect(await db().select().from(devices).where(eq(devices.id, device.id))).toHaveLength(0);
  });

  it("3.14 karar #288: hukuki metin taslağı bütün dilleriyle silinir; yayınlanmış metin silinemez", async () => {
    const hr = await createTestUser({ roles: ["hr"] });
    const text = { title: "Aydınlatma Metni", body: "Kişisel verileriniz eğitim süreçleri için işlenmektedir. ".repeat(3) };
    const english = { title: "Privacy Notice", body: "Your personal data is processed for training purposes. ".repeat(3) };
    const tr = await createDraft(hr.actor, text);
    await createDraft(hr.actor, english, "kvkk_personnel", "en");
    await deleteRecord(hr.actor, "legal_draft", tr.id);
    expect(await db().select().from(legalTexts).where(eq(legalTexts.kind, "kvkk_personnel"))).toHaveLength(0);

    const again = await createDraft(hr.actor, text);
    await createDraft(hr.actor, english, "kvkk_personnel", "en");
    await publishText(hr.actor, again.id);
    expect(await checkDeletion(hr.actor, "legal_draft", again.id)).toEqual({ state: "history" });
    expect(await db().select().from(legalTexts).where(eq(legalTexts.kind, "kvkk_personnel"))).toHaveLength(2);
  });
});
