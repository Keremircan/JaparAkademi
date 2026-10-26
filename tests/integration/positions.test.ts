import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { planModules, positionCardReviews, positionCardVersions, trainingPlans } from "@/server/db/schema";
import { isImmutableViolation } from "@/server/errors";
import { createContent, saveDraft, submitForApproval } from "@/server/services/content";
import { createModule, getModule, saveTasks, setModuleContents, archiveModule, listModules } from "@/server/services/modules";
import {
  approveCard,
  cardApprovalQueue,
  createCard,
  discardCardDraft,
  getCardOverview,
  getCardVersion,
  getEditableCard,
  listPositionCards,
  rejectCard,
  reviewCard,
  saveCardSections,
  savePlan,
  startNewCardVersion,
  submitCard,
} from "@/server/services/positions";
import { owner } from "../support/db";
import { fullCardSections, seedContentPeople, textBody } from "../support/content";

type People = Awaited<ReturnType<typeof seedContentPeople>>;
type UserActor = People["hr"]["actor"];

const unitModule = (unit: string, kind: "theory" | "practice" | "theory_exam" | "practice_exam", title: string, extra: object = {}) => ({
  kind,
  title,
  description: null,
  durationMin: 30,
  isOhs: false,
  remoteAllowed: true,
  validityMonths: null,
  ownerOrgUnitId: unit,
  commonTarget: null,
  commonSortOrder: null,
  ...extra,
});

/** Pres pozisyonu için: yayında bir içerik + teorik modül, pratik modül (görevli), teorik sınav. */
async function presModules(p: People, actor: UserActor = p.smUretim.actor) {
  const { id: contentId } = await createContent(actor, { type: "text", title: "Pres temelleri", ownerOrgUnitId: p.org.units.pres, commonTarget: null, isOhs: false });
  await saveDraft(actor, contentId, { title: "Pres temelleri", body: textBody("Pres nasıl çalışır"), tagIds: [] });
  await submitForApproval(actor, contentId, { changeNote: null, requireReread: false });
  const theory = (await createModule(actor, unitModule(p.org.units.pres, "theory", "Pres teorisi"))).id;
  await setModuleContents(actor, theory, [contentId]);
  const practice = (await createModule(actor, unitModule(p.org.units.pres, "practice", "Pres uygulaması"))).id;
  await saveTasks(actor, practice, [{ title: "Kalıp bağlama", description: null, isCritical: true }]);
  const exam = (await createModule(actor, unitModule(p.org.units.pres, "theory_exam", "Pres teorik sınavı"))).id;
  return { contentId, theory, practice, exam };
}

async function cardModuleId(positionId: string, actor: UserActor) {
  const card = await getEditableCard(actor, positionId);
  return card.plan.items.find((i) => i.isCardModule)!.moduleId;
}

/** Kart + planı onaya hazır hâle getirir. */
async function readyCard(p: People, actor: UserActor = p.smUretim.actor) {
  const positionId = p.org.positions.presOp;
  const m = await presModules(p);
  await createCard(actor, positionId);
  const cm = await cardModuleId(positionId, actor);
  await saveCardSections(actor, positionId, fullCardSections());
  await savePlan(actor, positionId, {
    overrides: {},
    items: [
      { moduleId: cm, isRequired: true, prerequisiteModuleIds: [], settings: {} },
      { moduleId: m.theory, isRequired: true, prerequisiteModuleIds: [cm], settings: {} },
      { moduleId: m.exam, isRequired: true, prerequisiteModuleIds: [m.theory], settings: { questionCount: 25, passScore: 75 } },
      { moduleId: m.practice, isRequired: true, prerequisiteModuleIds: [m.exam], settings: {} },
    ],
  });
  return { positionId, ...m, cardModule: cm };
}

describe("Bölüm 5 pozisyon kartı akışı", () => {
  it("bölüm sorumlusunun kartı: ilk sürümde İSG adımı gerekir, İSG uzmanı onaylayınca yayınlanır ve künye kopyalanır", async () => {
    const p = await seedContentPeople();
    const { positionId } = await readyCard(p);
    expect((await submitCard(p.smUretim.actor, positionId, { changeNote: null })).status).toBe("ohs_review");
    const [q] = await cardApprovalQueue(p.ohs.actor);
    expect(q).toMatchObject({ positionId, step: "ohs" });
    expect(await cardApprovalQueue(p.smUretim.actor)).toEqual([]);
    expect((await approveCard(p.ohs.actor, q!.versionId)).status).toBe("published");

    const v = await getCardVersion(p.trainerPres.actor, q!.versionId);
    expect(v.identity).toMatchObject({ positionName: "Pres Operatörü", unitName: "Pres Hattı", departmentName: "Üretim", collarType: "blue" });
    const overview = await getCardOverview(p.hr.actor, positionId);
    expect(overview.versions[0]).toMatchObject({ status: "published", isCurrent: true, ohsSectionChanged: true });
    expect(overview.can).toMatchObject({ edit: false, newVersion: false, review: false });
  });

  it("eğitmenin kartı bölüm sorumlusu onayına gider; 9. bölüm değişmeyen yeni sürüm İSG onayı istemez", async () => {
    const p = await seedContentPeople();
    const { positionId } = await readyCard(p, p.trainerPres.actor);
    expect((await submitCard(p.trainerPres.actor, positionId, { changeNote: null })).status).toBe("section_review");
    const [s] = await cardApprovalQueue(p.smUretim.actor);
    expect((await approveCard(p.smUretim.actor, s!.versionId)).status).toBe("ohs_review");
    await approveCard(p.ohs.actor, s!.versionId);

    await startNewCardVersion(p.trainerPres.actor, positionId);
    await saveCardSections(p.trainerPres.actor, positionId, { ...fullCardSections(), purpose: "Güncellenmiş amaç metni." });
    await expect(submitCard(p.trainerPres.actor, positionId, { changeNote: "" })).rejects.toMatchObject({ code: "change_note_required" });
    await submitCard(p.trainerPres.actor, positionId, { changeNote: "Amaç güncellendi" });
    const [s2] = await cardApprovalQueue(p.smUretim.actor);
    expect((await approveCard(p.smUretim.actor, s2!.versionId)).status).toBe("published");

    // 9. bölüm değişirse İSG adımı yeniden gerekir
    await startNewCardVersion(p.smUretim.actor, positionId);
    await saveCardSections(p.smUretim.actor, positionId, fullCardSections("Gürültü"));
    expect((await submitCard(p.smUretim.actor, positionId, { changeNote: "Risk eklendi" })).status).toBe("ohs_review");
  });

  it("zorunlu bölüm boşken ve plan eksikken onaya gönderilemez", async () => {
    const p = await seedContentPeople();
    const positionId = p.org.positions.presOp;
    await createCard(p.smUretim.actor, positionId);
    await expect(submitCard(p.smUretim.actor, positionId, { changeNote: null })).rejects.toMatchObject({ code: "card_incomplete" });
    const err = await submitCard(p.smUretim.actor, positionId, { changeNote: null }).catch((e: { details?: unknown }) => e.details);
    expect(err).toEqual(expect.arrayContaining(["purpose", "ohs", "contacts"]));
    expect(err).not.toContain("competencies");

    await saveCardSections(p.smUretim.actor, positionId, fullCardSections());
    await expect(submitCard(p.smUretim.actor, positionId, { changeNote: null })).rejects.toMatchObject({ code: "plan_empty" });
  });

  it("ret gerekçe ister; kimse kendi gönderdiği kartı onaylayamaz", async () => {
    const p = await seedContentPeople();
    const { positionId } = await readyCard(p);
    await submitCard(p.smUretim.actor, positionId, { changeNote: null });
    const versionId = (await getCardOverview(p.smUretim.actor, positionId)).versions[0]!.id;
    await owner()`insert into user_roles (user_id, role) values (${p.smUretim.userId}, 'ohs_specialist')`;
    const both = { ...p.smUretim.actor, roles: [...p.smUretim.actor.roles, "ohs_specialist" as const] };
    await expect(approveCard(both, versionId)).rejects.toMatchObject({ code: "forbidden" });
    await expect(rejectCard(p.ohs.actor, versionId, "")).rejects.toMatchObject({ code: "reject_comment_required" });
    await rejectCard(p.ohs.actor, versionId, "KKD listesi eksik");
    expect((await getCardOverview(p.smUretim.actor, positionId)).versions[0]!.status).toBe("rejected");
  });

  it("yayınlanan kart, planı ve plan modülleri değiştirilemez; gözden geçirme kaydı eklenir", async () => {
    const p = await seedContentPeople();
    const { positionId } = await readyCard(p);
    await submitCard(p.smUretim.actor, positionId, { changeNote: null });
    const [q] = await cardApprovalQueue(p.ohs.actor);
    await approveCard(p.ohs.actor, q!.versionId);
    const [plan] = await db().select().from(trainingPlans).where(eq(trainingPlans.cardVersionId, q!.versionId));

    const attempts = [
      db().update(positionCardVersions).set({ sections: {} }).where(eq(positionCardVersions.id, q!.versionId)),
      db().update(trainingPlans).set({ overrides: { videoWatchRatio: 0.5 } }).where(eq(trainingPlans.id, plan!.id)),
      db().delete(planModules).where(eq(planModules.planId, plan!.id)),
    ];
    for (const attempt of attempts) {
      const err = await Promise.resolve(attempt).then(() => null, (e: unknown) => e);
      expect(isImmutableViolation(err)).toBe(true);
    }

    await expect(reviewCard(p.trainerPres.actor, positionId, null)).rejects.toMatchObject({ code: "forbidden" });
    await reviewCard(p.smUretim.actor, positionId, "Değişiklik gerekmedi");
    const reviews = await db().select().from(positionCardReviews);
    expect(reviews).toHaveLength(1);
    const err = await db().update(positionCardReviews).set({ note: "x" }).then(() => null, (e: unknown) => e);
    expect(isImmutableViolation(err)).toBe(true);

    // Güncellik: son gözden geçirme parametreden eskiyse "stale"
    // (test: kayıtları geçmişe almak için trigger'lar geçici kapatılır)
    for (const table of ["position_card_reviews", "position_card_versions"]) await owner().unsafe(`alter table ${table} disable trigger user`);
    await owner()`update position_card_reviews set reviewed_at = now() - interval '13 months'`;
    await owner()`update position_card_versions set published_at = now() - interval '14 months'`;
    for (const table of ["position_card_reviews", "position_card_versions"]) await owner().unsafe(`alter table ${table} enable trigger user`);
    const list = await listPositionCards(p.smUretim.actor);
    expect(list.find((x) => x.positionId === positionId)).toMatchObject({ publishedVersion: 1, stale: true });
  });

  it("taslak sürüm silinebilir (ilk sürüm hariç); yeni sürüm planı kopyalar", async () => {
    const p = await seedContentPeople();
    const { positionId, exam } = await readyCard(p);
    await submitCard(p.smUretim.actor, positionId, { changeNote: null });
    await approveCard(p.ohs.actor, (await cardApprovalQueue(p.ohs.actor))[0]!.versionId);
    await startNewCardVersion(p.smUretim.actor, positionId);
    const draft = await getEditableCard(p.smUretim.actor, positionId);
    expect(draft.plan.items.map((i) => i.moduleId)).toContain(exam);
    expect(draft.plan.items.find((i) => i.moduleId === exam)!.settings).toEqual({ questionCount: 25, passScore: 75 });
    await discardCardDraft(p.smUretim.actor, positionId);
    expect((await getCardOverview(p.smUretim.actor, positionId)).versions).toHaveLength(1);
  });
});

describe("FG-3.1 eğitim planı", () => {
  it("ön koşul yalnızca önceki modül olabilir; kart modülü çıkarılamaz; ortak modül plana eklenmez", async () => {
    const p = await seedContentPeople();
    const positionId = p.org.positions.presOp;
    const m = await presModules(p);
    await createCard(p.smUretim.actor, positionId);
    const cm = await cardModuleId(positionId, p.smUretim.actor);
    const item = (moduleId: string, prerequisiteModuleIds: string[] = []) => ({ moduleId, isRequired: true, prerequisiteModuleIds, settings: {} });

    await expect(savePlan(p.smUretim.actor, positionId, { overrides: {}, items: [item(cm, [m.theory]), item(m.theory)] })).rejects.toMatchObject({ code: "plan_prerequisite_invalid" });
    await expect(savePlan(p.smUretim.actor, positionId, { overrides: {}, items: [item(m.theory)] })).rejects.toMatchObject({ code: "plan_card_module_required" });

    const common = (await createModule(p.hr.actor, { ...unitModule(p.org.units.pres, "theory", "Şirket tanıtımı"), ownerOrgUnitId: null, commonTarget: "all", commonSortOrder: 1 })).id;
    await expect(savePlan(p.smUretim.actor, positionId, { overrides: {}, items: [item(cm), item(common)] })).rejects.toMatchObject({ code: "plan_common_module" });
    const card = await getEditableCard(p.smUretim.actor, positionId);
    expect(card.commonModules.map((c) => c.id)).toEqual([common]);

    // Başka birimin modülü eklenemez
    const kalite = (await createModule(p.smKalite.actor, unitModule(p.org.units.kalite, "theory", "Kalite modülü"))).id;
    await expect(savePlan(p.smUretim.actor, positionId, { overrides: {}, items: [item(cm), item(kalite)] })).rejects.toMatchObject({ code: "module_invalid" });
  });

  it("plan bazında parametreler doğrulanır (sınav ayarı yalnızca sınav modülünde)", async () => {
    const p = await seedContentPeople();
    const positionId = p.org.positions.presOp;
    const m = await presModules(p);
    await createCard(p.smUretim.actor, positionId);
    const cm = await cardModuleId(positionId, p.smUretim.actor);
    const base = { isRequired: true, prerequisiteModuleIds: [] };
    await expect(savePlan(p.smUretim.actor, positionId, { overrides: {}, items: [{ ...base, moduleId: cm, settings: {} }, { ...base, moduleId: m.exam, settings: { passScore: 150 } }] })).rejects.toMatchObject({ code: "plan_settings_invalid" });
    await expect(savePlan(p.smUretim.actor, positionId, { overrides: {}, items: [{ ...base, moduleId: cm, settings: {} }, { ...base, moduleId: m.theory, settings: { passScore: 50 } }] })).rejects.toMatchObject({ code: "plan_settings_invalid" });
    await expect(savePlan(p.smUretim.actor, positionId, { overrides: { videoWatchRatio: 2 }, items: [{ ...base, moduleId: cm, settings: {} }] })).rejects.toMatchObject({ code: "plan_settings_invalid" });
    await savePlan(p.smUretim.actor, positionId, { overrides: { videoWatchRatio: 0.8 }, items: [{ ...base, moduleId: cm, settings: {} }, { ...base, moduleId: m.exam, settings: { durationMin: 45, proctorRequired: false } }] });
    const card = await getEditableCard(p.smUretim.actor, positionId);
    expect(card.plan.overrides).toEqual({ videoWatchRatio: 0.8 });
    expect(card.plan.items[1]!.settings).toEqual({ durationMin: 45, proctorRequired: false });
  });

  it("yetki: İK kartı okur ama düzenlemez; İSG uzmanı yalnızca 9. bölümü değiştirir; kapsam dışı bölüm sorumlusu göremez", async () => {
    const p = await seedContentPeople();
    const positionId = p.org.positions.presOp;
    await expect(createCard(p.hr.actor, positionId)).rejects.toMatchObject({ code: "forbidden" });
    await expect(createCard(p.ohs.actor, positionId)).rejects.toMatchObject({ code: "forbidden" });
    await createCard(p.smUretim.actor, positionId);
    await saveCardSections(p.smUretim.actor, positionId, fullCardSections());

    await expect(saveCardSections(p.ohs.actor, positionId, { ...fullCardSections(), purpose: "Değişti" })).rejects.toMatchObject({ code: "forbidden" });
    await saveCardSections(p.ohs.actor, positionId, fullCardSections("Ezilme"));
    expect((await getEditableCard(p.smUretim.actor, positionId)).sections.ohs.risks[0]!.text).toBe("Ezilme");

    await expect(getCardOverview(p.smKalite.actor, positionId)).rejects.toMatchObject({ code: "not_found" });
    await expect(getCardOverview(p.trainerKalite.actor, positionId)).rejects.toMatchObject({ code: "not_found" });
    expect((await getCardOverview(p.hr.actor, positionId)).can.edit).toBe(false);
    await expect(getCardOverview(p.sysadmin.actor, positionId)).rejects.toMatchObject({ code: "forbidden" });
    expect((await listPositionCards(p.smKalite.actor)).map((x) => x.code)).toEqual(["KK-TEK"]);
  });
});

describe("FG-3.1 modül kütüphanesi", () => {
  it("görevler sıralı kaydedilir; listeden çıkan görev arşivlenir; yalnızca yayındaki içerik eklenir", async () => {
    const p = await seedContentPeople();
    const m = await presModules(p);
    const before = await getModule(p.smUretim.actor, m.practice);
    await saveTasks(p.smUretim.actor, m.practice, [
      { title: "Yeni görev", description: "Açıklama", isCritical: false },
      { id: before.tasks[0]!.id, title: "Kalıp bağlama", description: null, isCritical: true },
    ]);
    expect((await getModule(p.smUretim.actor, m.practice)).tasks.map((t) => t.title)).toEqual(["Yeni görev", "Kalıp bağlama"]);
    await saveTasks(p.smUretim.actor, m.practice, [{ title: "Yalnız bu", description: null, isCritical: false }]);
    const rows = await owner()`select title, archived_at from practice_tasks order by sort_order`;
    expect(rows.filter((r) => r.archived_at).length).toBe(2);

    const { id: draft } = await createContent(p.smUretim.actor, { type: "text", title: "Taslak içerik", ownerOrgUnitId: p.org.units.pres, commonTarget: null, isOhs: false });
    await expect(setModuleContents(p.smUretim.actor, m.theory, [m.contentId, draft])).rejects.toMatchObject({ code: "content_invalid" });
  });

  it("İSG modülünde 'uzaktan verilebilir' kararını yalnızca İSG uzmanı verir", async () => {
    const p = await seedContentPeople();
    const id = (await createModule(p.smUretim.actor, unitModule(p.org.units.pres, "theory", "Pres İSG", { isOhs: true, remoteAllowed: false }))).id;
    expect((await getModule(p.smUretim.actor, id)).remoteAllowed).toBe(true);
    const input = { title: "Pres İSG", description: null, durationMin: 60, isOhs: true, remoteAllowed: false, validityMonths: 12, commonTarget: null, commonSortOrder: null };
    const { updateModule } = await import("@/server/services/modules");
    await updateModule(p.smUretim.actor, id, input);
    expect((await getModule(p.smUretim.actor, id)).remoteAllowed).toBe(true);
    await updateModule(p.ohs.actor, id, input);
    expect((await getModule(p.ohs.actor, id))).toMatchObject({ remoteAllowed: false, validityMonths: 12 });
    await expect(updateModule(p.smUretim.actor, id, { ...input, isOhs: false })).rejects.toMatchObject({ code: "forbidden" });
  });

  it("görünürlük içerikle aynı; kart modülü arşivlenemez", async () => {
    const p = await seedContentPeople();
    await presModules(p);
    await createModule(p.smKalite.actor, unitModule(p.org.units.kalite, "practice", "Kalite pratiği"));
    expect((await listModules(p.smKalite.actor)).map((m) => m.title)).toEqual(["Kalite pratiği"]);
    expect((await listModules(p.hr.actor)).length).toBe(4);
    await createCard(p.smUretim.actor, p.org.positions.presOp);
    const cm = await cardModuleId(p.org.positions.presOp, p.smUretim.actor);
    await expect(archiveModule(p.smUretim.actor, cm)).rejects.toMatchObject({ code: "forbidden" });
  });
});
