import ExcelJS from "exceljs";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { addDays, todayIn } from "@/lib/dates";
import { systemActor } from "@/server/authz/actor";
import { db } from "@/server/db/client";
import { dataAccessLog, reportExports } from "@/server/db/schema";
import { isImmutableViolation } from "@/server/errors";
import { myLearning } from "@/server/services/assignments";
import { acknowledgeItem, learnModule, reportReachedEnd } from "@/server/services/assignments/learner";
import { diffRecord, listAuditLog } from "@/server/services/audit";
import { answerExam, getAttempt, startExam, submitExam } from "@/server/services/exams";
import { createModule, setModuleContents } from "@/server/services/modules";
import { exportPersonalData } from "@/server/services/personal-export";
import { createQuestion } from "@/server/services/questions";
import { approveReadiness } from "@/server/services/readiness";
import { parseFilters, runReport, type ReportKind } from "@/server/services/reports";
import { exportReport } from "@/server/services/reports/export";
import { setSetting } from "@/server/services/settings";
import { owner } from "../support/db";
import { seedContentPeople } from "../support/content";
import { createTestUser } from "../support/factories";
import { moduleInput, publishCard, publishedText } from "../support/training";

type People = Awaited<ReturnType<typeof seedContentPeople>>;
type Trainee = Awaited<ReturnType<typeof createTestUser>>;
type Actor = Parameters<typeof runReport>[0];

/** Pres: ortak İSG modülü (12 ay) + teorik modül + teorik sınav (4 soru, 2 hak). */
async function setup(p: People) {
  const sm = p.smUretim.actor;
  const ohsContent = await publishedText(p.ohs.actor, null, "Genel İSG", "metin", true);
  const isg = (await createModule(p.ohs.actor, moduleInput(null, "theory", "Genel İSG eğitimi", { isOhs: true, validityMonths: 12, durationMin: 480 }))).id;
  await setModuleContents(p.ohs.actor, isg, [ohsContent]);
  const c = await publishedText(sm, p.org.units.pres, "Pres temelleri", "metin");
  const theory = (await createModule(sm, moduleInput(p.org.units.pres, "theory", "Pres teorisi"))).id;
  await setModuleContents(sm, theory, [c]);
  const exam = (await createModule(sm, moduleInput(p.org.units.pres, "theory_exam", "Pres sınavı"))).id;
  for (let i = 0; i < 4; i++) {
    await createQuestion(sm, {
      type: "single_choice", stem: `Pres sınav sorusu ${i}`, options: ["Doğru şık", "Yanlış bir", "Yanlış iki"], correctIndex: 0, explanation: null,
      topic: "Pres", difficulty: 1, isOhsCritical: false, mediaAssetId: null, moduleIds: [theory], ownerOrgUnitId: p.org.units.pres, isOhs: false,
    });
  }
  const { cardModuleId } = await publishCard(p, p.org.positions.presOp, [theory, exam], sm, {
    [exam]: { questionCount: 4, passScore: 75, maxAttempts: 2, cooldownHours: 0, durationMin: 10, proctorRequired: false },
  });
  return { isg, theory, exam, cardModuleId };
}

async function finish(u: Trainee, moduleId: string) {
  const am = (await myLearning(u.actor)).current!.modules.find((m) => m.moduleId === moduleId)!;
  for (const item of (await learnModule(u.actor, am.id)).items) {
    await reportReachedEnd(u.actor, item.id);
    await acknowledgeItem(u.actor, item.id);
  }
}

async function takeExam(u: Trainee, examModuleId: string, pass: boolean) {
  const am = (await myLearning(u.actor)).current!.modules.find((m) => m.moduleId === examModuleId)!;
  const { attemptId } = await startExam(u.actor, am.id, { code: null, ip: null, userAgent: null });
  const view = await getAttempt(u.actor, attemptId);
  if (view.state !== "open") throw new Error("açık değil");
  for (const item of view.questions) {
    const right = item.options.indexOf("Doğru şık");
    await answerExam(u.actor, attemptId, item.itemId, pass ? right : (right + 1) % item.options.length);
  }
  await submitExam(u.actor, attemptId);
}

/** Kursiyer: 10 gün önce işe girdi; İSG + kart + teori; sınavda bir kalır, bir geçer; onaylanır. */
async function scenario(p: People) {
  const s = await setup(p);
  const today = todayIn("Europe/Istanbul");
  const u = await createTestUser({ positionId: p.org.positions.presOp, trainingRequired: true, hireDate: addDays(today, -10) });
  await finish(u, s.isg);
  await finish(u, s.cardModuleId);
  await finish(u, s.theory);
  await takeExam(u, s.exam, false);
  await finish(u, s.theory);
  await takeExam(u, s.exam, true);
  const a = (await myLearning(u.actor)).current!;
  return { s, u, a };
}

const rows = async (actor: Actor, kind: ReportKind, input: Record<string, string> = {}) => {
  const r = await runReport(actor, kind, await parseFilters(kind, input));
  return r;
};

describe("SPEC 10.1 raporlar", () => {
  it("karar #91 görünürlük ve kapsam; eğitim ilerleme ve işe başlama süresi hesapları", async () => {
    const p = await seedContentPeople();
    const { u, a } = await scenario(p);

    // Eğitim ilerleme: kapsamdaki sorumlu ve İK görür; kapsam dışı sorumlu görmez; eğitmen/İSG/kursiyer yetkisiz
    const training = await rows(p.smUretim.actor, "training");
    expect(training.tables[0]!.rows.map((r) => r[0])).toEqual([u.sicilNo]);
    expect(training.tables[0]!.rows[0]).toEqual(expect.arrayContaining(["awaiting_readiness", 100, false]));
    expect((await rows(p.smKalite.actor, "training")).tables[0]!.rows).toEqual([]);
    expect((await rows(p.hr.actor, "training", { orgUnitId: p.org.units.kalite })).tables[0]!.rows).toEqual([]);
    expect((await rows(p.hr.actor, "training", { orgUnitId: p.org.units.uretim })).tables[0]!.rows).toHaveLength(1);
    for (const actor of [p.trainerPres.actor, p.ohs.actor, u.actor]) await expect(rows(actor, "training")).rejects.toMatchObject({ code: "forbidden" });

    // İşe başlama süresi: yalnızca İK; işe girişten onaya 10 gün
    await approveReadiness(p.smUretim.actor, a.id, null);
    await expect(rows(p.smUretim.actor, "onboarding")).rejects.toMatchObject({ code: "forbidden" });
    const onboarding = await rows(p.hr.actor, "onboarding");
    expect(onboarding.tables[0]!.rows[0]).toEqual([expect.any(String), 1, 10, 10, 10, 10]);
    expect(onboarding.tables[1]!.rows[0]).toEqual(expect.arrayContaining([u.sicilNo, 10]));
    await expect(parseFilters("training", { from: "2026-05-01", to: "2026-04-01" })).rejects.toMatchObject({ code: "report_range_invalid" });
  });

  it("karar #93 sınav sonuçları ve en çok yanlış yapılan sorular (kişi adı yok; soru yalnızca görebilene)", async () => {
    const p = await seedContentPeople();
    const { u } = await scenario(p);
    const r = await rows(p.smUretim.actor, "exams");
    expect(r.tables[0]!.rows.map((x) => [x[0], x[4], x[5], x[8]])).toEqual([
      [u.sicilNo, "theory", 2, true],
      [u.sicilNo, "theory", 1, false],
    ]);
    const wrong = r.tables.find((t) => t.key === "wrongQuestions")!;
    expect(wrong.columns).toEqual(["question", "topic", "asked", "wrong", "wrongRate"]);
    expect(wrong.rows).toHaveLength(4);
    expect(wrong.rows[0]).toEqual([expect.stringMatching(/^Pres sınav sorusu/), "Pres", 2, 1, 50]);
    expect(JSON.stringify(wrong.rows)).not.toContain(u.sicilNo);
    // Kapsam dışı sorumlu ne denemeyi ne soruyu görür
    const other = await rows(p.smKalite.actor, "exams");
    expect(other.tables[0]!.rows).toEqual([]);
    expect(other.tables.find((t) => t.key === "wrongQuestions")?.rows ?? []).toEqual([]);
  });

  it("karar #94 İSG kayıt defteri: kişi başı saat, tehlike sınıfı varsayımı uyarısı", async () => {
    const p = await seedContentPeople();
    const { u } = await scenario(p);
    await expect(rows(p.smUretim.actor, "ohs")).rejects.toMatchObject({ code: "forbidden" });
    const r = await rows(p.ohs.actor, "ohs");
    expect(r.warnings).toEqual(["hazard_class_assumed"]);
    expect(r.tables[0]!.rows).toEqual([[u.sicilNo, expect.any(String), expect.any(String), expect.any(String), "Genel İSG eğitimi", expect.any(Date), 8, null, expect.any(Date), "online"]]);
    expect(r.tables[1]!.rows).toEqual([[u.sicilNo, expect.any(String), 8, 12, false]]);
    await setSetting(systemActor("test"), "ohs.hazard_class", "low");
    const low = await rows(p.hr.actor, "ohs");
    expect(low.warnings).toEqual([]);
    expect(low.tables[1]!.rows[0]).toEqual([u.sicilNo, expect.any(String), 8, 8, true]);
  });

  it("karar #96–97 dışa aktarma: Excel ve PDF, değiştirilemez kayıt, satır sınırı", async () => {
    const p = await seedContentPeople();
    await scenario(p);
    const f = await parseFilters("training", {});
    const xlsx = await exportReport(p.hr.actor, "training", f, "xlsx");
    expect(xlsx.fileName).toMatch(/^egitim-ilerleme-\d{8}\.xlsx$/);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(xlsx.buffer as unknown as ExcelJS.Buffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Eğitim ilerleme", "Bilgi"]);
    expect(wb.worksheets[0]!.getRow(1).getCell(1).value).toBe("Sicil no");
    expect(wb.worksheets[0]!.getRow(2).getCell(5).value).toBe("Onay bekliyor");
    const pdf = await exportReport(p.hr.actor, "training", f, "pdf");
    expect(pdf.buffer.subarray(0, 4).toString()).toBe("%PDF");

    const logged = await db().select().from(reportExports).where(eq(reportExports.actorId, p.hr.userId));
    expect(logged.map((l) => [l.report, l.format, l.rowCount])).toEqual([
      ["training", "xlsx", 1],
      ["training", "pdf", 1],
    ]);
    const err = await db().update(reportExports).set({ rowCount: 0 }).where(eq(reportExports.actorId, p.hr.userId)).then(() => null, (e: unknown) => e);
    expect(isImmutableViolation(err)).toBe(true);

    await setSetting(systemActor("test"), "reports.max_rows", 1);
    await createTestUser({ positionId: p.org.positions.presOp, trainingRequired: true });
    await expect(exportReport(p.hr.actor, "training", f, "xlsx")).rejects.toMatchObject({ code: "report_too_large" });
    await expect(exportReport(p.smKalite.actor, "onboarding", f, "xlsx")).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("karar #98 denetim kaydı ekranı", () => {
  it("yalnızca sistem yöneticisi; tablo ve kayıt filtresi; yalnızca değişen alanlar", async () => {
    const p = await seedContentPeople();
    const admin = await createTestUser({ roles: ["sysadmin"] });
    const u = await createTestUser({});
    await owner()`update personnel set phone = '05551112233' where user_id = ${u.userId}`;
    await expect(listAuditLog(p.hr.actor, { table: null, actorId: null, recordId: null, from: null, to: null })).rejects.toMatchObject({ code: "forbidden" });
    const page = await listAuditLog(admin.actor, { table: "personnel", actorId: null, recordId: u.userId, from: null, to: null });
    const update = page.entries.find((e) => e.action === "UPDATE")!;
    expect(update.changes).toEqual([{ field: "phone", old: null, new: "05551112233" }]);
    expect(page.entries.every((e) => e.table === "personnel" && e.recordId === u.userId)).toBe(true);
    expect(diffRecord({ a: 1, updated_at: "x" }, { a: 2, updated_at: "y" })).toEqual([{ field: "a", old: 1, new: 2 }]);
  });
});

describe("karar #99 KVKK kişi verisi dışa aktarma", () => {
  it("İK indirir, erişim kayda geçer; TC maskeli; İK kendi verisini, başkaları hiç indiremez", async () => {
    const p = await seedContentPeople();
    const { u } = await scenario(p);
    await owner()`update personnel set national_id_masked = '123******90' where user_id = ${u.userId}`;
    const out = await exportPersonalData(p.hr.actor, u.userId);
    expect(out.fileName).toBe(`kisi-verisi-${u.sicilNo}.xlsx`);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(out.base64, "base64") as unknown as ExcelJS.Buffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Kimlik ve iletişim", "Roller", "Eğitimler", "Sınavlar", "Belgeler", "KVKK onayları"]);
    expect(wb.worksheets[0]!.getRow(2).getCell(3).value).toBe("123******90");
    expect(wb.worksheets[3]!.rowCount).toBe(3);
    const log = await db().select().from(dataAccessLog).where(eq(dataAccessLog.subjectUserId, u.userId));
    expect(log.map((l) => [l.actorId, l.field])).toEqual([[p.hr.userId, "personal_export"]]);
    await expect(exportPersonalData(p.hr.actor, p.hr.userId)).rejects.toMatchObject({ code: "forbidden" });
    await expect(exportPersonalData(p.smUretim.actor, u.userId)).rejects.toMatchObject({ code: "forbidden" });
  });
});
