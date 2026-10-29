import { and, desc, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { systemActor } from "@/server/authz/actor";
import { db } from "@/server/db/client";
import { assignmentModules, assignments, certificates, emailOutbox, notifications } from "@/server/db/schema";
import { ForbiddenError } from "@/server/errors";
import { todayIn } from "@/lib/dates";
import { cancelAssignment, myLearning, updateAssignment } from "@/server/services/assignments";
import { notifyOhsExpired, notifyOverdue, notifyUnmarked, sendWeeklySummaries } from "@/server/services/assignments/alerts";
import { acknowledgeItem, learnModule, reportReachedEnd } from "@/server/services/assignments/learner";
import { runRecert } from "@/server/services/assignments/recert";
import { answerExam, getAttempt, startExam, submitExam } from "@/server/services/exams";
import { createModule, setModuleContents } from "@/server/services/modules";
import { markTask } from "@/server/services/practice";
import { createQuestion } from "@/server/services/questions";
import { approveReadiness } from "@/server/services/readiness";
import { parseFilters, runReport } from "@/server/services/reports";
import { setSetting } from "@/server/services/settings";
import { seedContentPeople } from "../support/content";
import { owner } from "../support/db";
import { createTestUser } from "../support/factories";
import { moduleInput, presTraining, publishCard, publishedText } from "../support/training";

type People = Awaited<ReturnType<typeof seedContentPeople>>;
type Trainee = Awaited<ReturnType<typeof createTestUser>>;

const sys = systemActor("test");
const DAY = 86_400_000;
/** Bir yıl sonrası: 12 aylık geçerliliğin bitişine `recert.lead_days` (30) günden az kalmış olur. */
const nextYear = () => new Date(Date.now() + 350 * DAY);
const today = () => todayIn("Europe/Istanbul");

/** Pres: teorik modül (12 ay geçerli) + teorik sınav (4 soru, 1 hak). Kart modülü süresiz. */
async function setup(p: People) {
  const sm = p.smUretim.actor;
  const c = await publishedText(sm, p.org.units.pres, "Pres temelleri", "metin");
  const theory = (await createModule(sm, moduleInput(p.org.units.pres, "theory", "Pres teorisi", { validityMonths: 12 }))).id;
  await setModuleContents(sm, theory, [c]);
  const exam = (await createModule(sm, moduleInput(p.org.units.pres, "theory_exam", "Pres sınavı"))).id;
  for (let i = 0; i < 4; i++) {
    await createQuestion(sm, {
      type: "single_choice", stem: `Soru ${i}`, options: ["Doğru şık", "Yanlış bir", "Yanlış iki"], correctIndex: 0, explanation: null,
      topic: "Pres", difficulty: 1, isOhsCritical: false, mediaAssetId: null, moduleIds: [theory], ownerOrgUnitId: p.org.units.pres, isOhs: false,
    });
  }
  const { cardModuleId } = await publishCard(p, p.org.positions.presOp, [theory, exam], sm, {
    [exam]: { questionCount: 4, passScore: 75, maxAttempts: 1, cooldownHours: 0, durationMin: 10, proctorRequired: false },
  });
  return { theory, exam, cardModuleId };
}

const current = async (u: Trainee) => (await myLearning(u.actor)).current!;

async function finish(u: Trainee, moduleId: string) {
  const am = (await current(u)).modules.find((m) => m.moduleId === moduleId)!;
  const view = await learnModule(u.actor, am.id);
  for (const item of view.items) {
    await reportReachedEnd(u.actor, item.id);
    await acknowledgeItem(u.actor, item.id);
  }
}

async function passExam(u: Trainee, examModuleId: string) {
  const am = (await current(u)).modules.find((m) => m.moduleId === examModuleId)!;
  const { attemptId } = await startExam(u.actor, am.id, { code: null, ip: null, userAgent: null });
  const view = await getAttempt(u.actor, attemptId);
  if (view.state !== "open") throw new Error("açık değil");
  for (const item of view.questions) await answerExam(u.actor, attemptId, item.itemId, item.options.indexOf("Doğru şık"));
  await submitExam(u.actor, attemptId);
}

/** Eğitimini bitirmiş ve onaylanmış personel. */
async function certified(p: People, s: Awaited<ReturnType<typeof setup>>) {
  const u = await createTestUser({ positionId: p.org.positions.presOp, trainingRequired: true });
  await finish(u, s.cardModuleId);
  await finish(u, s.theory);
  await passExam(u, s.exam);
  await approveReadiness(p.smUretim.actor, (await current(u)).id, null);
  return u;
}

const notesOf = (userId: string, kind: string) =>
  db().select().from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.kind, kind)));

describe("FG-7.3 otomatik tekrar eğitimi (SPEC 3.3, kararlar #164–169)", () => {
  it("süresi yaklaşan modül ve ona bağlı sınav atanır; süresiz kart modülü girmez; kursiyere bildirim", async () => {
    const p = await seedContentPeople();
    const s = await setup(p);
    const u = await certified(p, s);
    const [original] = await db()
      .select()
      .from(assignmentModules)
      .where(and(eq(assignmentModules.moduleId, s.theory), eq(assignmentModules.status, "completed")));

    // Bitişine 30 günden fazla varken açılmaz
    expect(await runRecert(sys)).toEqual({ created: 0, deferred: 0 });
    expect(await runRecert(sys, nextYear())).toEqual({ created: 1, deferred: 0 });

    const a = await current(u);
    expect(a.reason).toBe("recertification");
    expect(a.modules.map((m) => m.moduleId)).toEqual([s.theory, s.exam]);
    const rows = await db().select().from(assignmentModules).where(eq(assignmentModules.assignmentId, a.id));
    expect(rows.find((r) => r.moduleId === s.theory)).toMatchObject({ renewsId: original!.id, status: "available", prerequisiteModuleIds: [] });
    expect(rows.find((r) => r.moduleId === s.exam)).toMatchObject({ renewsId: null, status: "locked", prerequisiteModuleIds: [s.theory] });
    // Hedef tarih en erken bitiş (Europe/Istanbul günü)
    const [row] = await db().select().from(assignments).where(eq(assignments.id, a.id));
    expect(row!.targetDate).toBe(todayIn("Europe/Istanbul", original!.expiresAt!));
    expect(await notesOf(u.userId, "recert_started")).toHaveLength(1);

    // Aynı tamamlanış ikinci kez yenilenmez
    expect(await runRecert(sys, nextYear())).toEqual({ created: 0, deferred: 0 });
  });

  it("İK tekrar eğitimini iptal ederse sistem yeniden açmaz (karar #166)", async () => {
    const p = await seedContentPeople();
    const s = await setup(p);
    const u = await certified(p, s);
    await runRecert(sys, nextYear());
    await cancelAssignment(p.hr.actor, (await current(u)).id, "Kişi başka göreve geçiyor");
    expect(await runRecert(sys, nextYear())).toEqual({ created: 0, deferred: 0 });
    expect((await myLearning(u.actor)).current).toBeNull();
  });

  it("açık ataması olan kişide ertelenir; İK'ya bir kez bildirim (karar #167)", async () => {
    const p = await seedContentPeople();
    const s = await setup(p);
    const u = await createTestUser({ positionId: p.org.positions.presOp, trainingRequired: true });
    await finish(u, s.cardModuleId);
    await finish(u, s.theory); // sınav bekliyor: atama açık
    expect(await runRecert(sys, nextYear())).toEqual({ created: 0, deferred: 1 });
    expect(await runRecert(sys, nextYear())).toEqual({ created: 0, deferred: 1 });
    expect(await notesOf(p.hr.userId, "recert_deferred")).toHaveLength(1);
    expect((await current(u)).reason).toBe("new_hire");
  });

  it("artık planda olmayan modül tekrar eğitimine girmez (karar #164)", async () => {
    const p = await seedContentPeople();
    const s = await setup(p);
    const u = await certified(p, s);
    // Kişi başka pozisyona geçmiş gibi: Kalite pozisyonunda Pres modülleri yok
    await owner()`update personnel set position_id = ${p.org.positions.kkTek} where user_id = ${u.userId}`;
    expect(await runRecert(sys, nextYear())).toEqual({ created: 0, deferred: 0 });
  });

  it("onaylanınca yeni pozisyon sertifikası: yenilenen + hâlâ geçerli modüller, bitiş en erken olan (karar #169)", async () => {
    const p = await seedContentPeople();
    const s = await setup(p);
    const u = await certified(p, s);
    await runRecert(sys, nextYear());
    await finish(u, s.theory);
    await passExam(u, s.exam);
    const a = await current(u);
    expect(a.status).toBe("awaiting_readiness");
    await approveReadiness(p.smUretim.actor, a.id, null);

    const certs = await db()
      .select()
      .from(certificates)
      .where(and(eq(certificates.userId, u.userId), eq(certificates.kind, "position_competency")))
      .orderBy(desc(certificates.issuedAt));
    expect(certs).toHaveLength(2);
    const titles = certs[0]!.snapshot.modules.map((m: { title: string }) => m.title);
    expect(titles).toEqual(expect.arrayContaining(["Pres teorisi", "Pres sınavı"]));
    expect(titles.some((t: string) => t.startsWith("Pozisyon kartı"))).toBe(true);
    const [renewed] = await db().select().from(assignmentModules).where(and(eq(assignmentModules.assignmentId, a.id), eq(assignmentModules.moduleId, s.theory)));
    expect(certs[0]!.expiresAt?.getTime()).toBe(renewed!.expiresAt!.getTime());
  });
});

describe("Faz 2 eğitim bildirimleri (SPEC 10.2, karar #172)", () => {
  it("hedef tarihi geçen eğitim: kapsamdaki bölüm sorumlusuna atama başına bir kez", async () => {
    const p = await seedContentPeople();
    await setup(p);
    const u = await createTestUser({ positionId: p.org.positions.presOp, trainingRequired: true });
    await owner()`update assignments set target_date = current_date - 2 where user_id = ${u.userId}`;
    expect(await notifyOverdue(sys, today())).toBe(1);
    const [n] = await notesOf(p.smUretim.userId, "training_overdue");
    expect(n).toBeDefined();
    await db().update(notifications).set({ readAt: new Date() }).where(eq(notifications.id, n!.id));
    await notifyOverdue(sys, today());
    expect(await notesOf(p.smUretim.userId, "training_overdue")).toHaveLength(1);
    expect(await notesOf(p.smKalite.userId, "training_overdue")).toHaveLength(0);
  });

  it("işaretlenmeyen pratik görev: eğitmene bir kez; işaretleyince kapanır", async () => {
    const p = await seedContentPeople();
    const t = await presTraining(p);
    const u = await createTestUser({ positionId: p.org.positions.presOp, trainingRequired: true });
    await finish(u, t.cardModuleId);
    await finish(u, t.theory);
    const a = await current(u);
    await updateAssignment(p.hr.actor, a.id, { trainerUserId: p.trainerPres.userId, targetDate: null });
    const am = (await current(u)).modules.find((m) => m.moduleId === t.practice)!;
    expect(await notifyUnmarked(sys, new Date())).toBe(0);
    // Takvim günü yerine saat payı: yaz saati geçişinde aralık 4 gün 23 saate düşmesin
    await owner()`update assignment_modules set unlocked_at = now() - interval '5 days 2 hours' where id = ${am.id}`;
    expect(await notifyUnmarked(sys, new Date())).toBe(1);
    await notifyUnmarked(sys, new Date());
    const notes = await notesOf(p.trainerPres.userId, "tasks_unmarked");
    expect(notes).toHaveLength(1);
    expect(notes[0]!.params).toMatchObject({ days: 5 });

    const [task] = await owner()<{ id: string }[]>`select unnest(pinned_task_ids) as id from assignment_modules where id = ${am.id}`;
    await markTask(p.trainerPres.actor, am.id, task!.id, { level: "demonstrated", note: null, photoAssetIds: [] });
    expect((await notesOf(p.trainerPres.userId, "tasks_unmarked"))[0]!.readAt).not.toBeNull();
    expect(await notifyUnmarked(sys, new Date())).toBe(0);
  });

  it("süresi dolan İSG eğitimi: İSG uzmanlarına günlük tek özet, isim yok", async () => {
    const p = await seedContentPeople();
    const s = await setup(p);
    const u = await certified(p, s);
    await owner()`update assignment_modules set is_ohs = true, expires_at = now() - interval '1 hour'
      where module_id = ${s.theory} and assignment_id in (select id from assignments where user_id = ${u.userId})`;
    expect(await notifyOhsExpired(sys, new Date(), today())).toBe(1);
    await notifyOhsExpired(sys, new Date(), today());
    for (const o of [p.ohs, p.ohs2]) {
      const notes = await notesOf(o.userId, "ohs_expired");
      expect(notes).toHaveLength(1);
      expect(notes[0]!.params).toEqual({ count: 1 });
    }
  });

  it("haftalık özet: kapsamı olan bölüm sorumlusuna yalnızca sayılar; e-postada kişi adı yok", async () => {
    const p = await seedContentPeople();
    await setup(p);
    const u = await createTestUser({ positionId: p.org.positions.presOp, trainingRequired: true });
    await owner()`update users set name = 'Gizli Kişi' where id = ${u.userId}`;
    await owner()`update personnel set email = 'sm@example.com' where user_id = ${p.smUretim.userId}`;
    await owner()`update assignments set target_date = current_date - 1 where user_id = ${u.userId}`;
    expect(await sendWeeklySummaries(sys)).toBeGreaterThanOrEqual(1);
    const [n] = await notesOf(p.smUretim.userId, "weekly_summary");
    expect(n!.params).toMatchObject({ active: 1, overdue: 1, readiness: 0, rereads: 0 });
    const [mail] = await db().select().from(emailOutbox).where(eq(emailOutbox.notificationId, n!.id));
    expect(mail!.bodyText).toMatch(/Hedefi geçen: 1/);
    expect(mail!.bodyText).not.toMatch(/Gizli Kişi/);
    // Aynı hafta ikinci kez gönderilmez
    await sendWeeklySummaries(sys);
    expect(await notesOf(p.smUretim.userId, "weekly_summary")).toHaveLength(1);
    // Kapsamı olmayan sorumluya gitmez
    const lonely = await createTestUser({ roles: ["section_manager"] });
    await sendWeeklySummaries(sys, new Date(Date.now() + 7 * DAY));
    expect(await notesOf(lonely.userId, "weekly_summary")).toHaveLength(0);
  });
});

describe("Süresi dolacak ve içerik güncellik raporları (SPEC 10.1, kararlar #170–171)", () => {
  it("süresi dolacaklar: İK modül ve sertifikayı görür; yalnızca İSG uzmanı İSG modüllerini; bölüm sorumlusu göremez", async () => {
    const p = await seedContentPeople();
    const s = await setup(p);
    await certified(p, s);
    const f = await parseFilters("expiring", { from: today(), to: todayIn("Europe/Istanbul", new Date(Date.now() + 400 * DAY)) });
    const hr = await runReport(p.hr.actor, "expiring", f);
    expect(hr.tables[0]!.rows.map((r) => [r[4], r[5], r[9]])).toEqual(
      expect.arrayContaining([
        ["Pres teorisi", "module", "none"],
        ["Pres Operatörü", "certificate", null],
      ]),
    );
    expect(hr.tables[0]!.rows).toHaveLength(2);
    expect((await runReport(p.ohs.actor, "expiring", f)).tables[0]!.rows).toHaveLength(0);
    await expect(runReport(p.smUretim.actor, "expiring", f)).rejects.toBeInstanceOf(ForbiddenError);

    // Varsayılan aralık önümüzdeki 90 gün: henüz bir şey yok
    expect((await runReport(p.hr.actor, "expiring", await parseFilters("expiring", {}))).tables[0]!.rows).toHaveLength(0);
  });

  it("içerik güncellik: gözden geçirmesi eski kartlar; bölüm sorumlusu kapsamında, İK hepsini görür", async () => {
    const p = await seedContentPeople();
    await setup(p);
    const f = await parseFilters("content", {});
    expect((await runReport(p.hr.actor, "content", f)).tables[0]!.rows).toHaveLength(0);
    await owner()`alter table position_card_versions disable trigger user`;
    await owner()`update position_card_versions set published_at = now() - interval '13 months' where status = 'published'`;
    await owner()`alter table position_card_versions enable trigger user`;
    const sm = await runReport(p.smUretim.actor, "content", f);
    expect(sm.tables[0]!.rows).toHaveLength(1);
    expect(sm.tables[0]!.rows[0]!.slice(1, 3)).toEqual(["Pres Operatörü", 1]);
    expect(sm.tables[0]!.rows[0]![5]).toBe(13);
    expect((await runReport(p.smKalite.actor, "content", f)).tables[0]!.rows).toHaveLength(0);
    expect((await runReport(p.hr.actor, "content", f)).tables[0]!.rows).toHaveLength(1);
    await expect(runReport(p.ohs.actor, "content", f)).rejects.toBeInstanceOf(ForbiddenError);
    // Parametre: 24 ay
    await setSetting(p.sysadmin.actor, "content.review_max_age_months", 24);
    expect((await runReport(p.hr.actor, "content", f)).tables[0]!.rows).toHaveLength(0);
  });
});
