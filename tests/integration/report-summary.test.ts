import ExcelJS from "exceljs";
import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { addDays, todayIn } from "@/lib/dates";
import { systemActor } from "@/server/authz/actor";
import { db } from "@/server/db/client";
import { emailOutbox, notifications, reportExports } from "@/server/db/schema";
import { stopJobSender } from "@/server/jobs/send";
import { recordPriorTrainings } from "@/server/services/assignments/periodic";
import { approveReadiness } from "@/server/services/readiness";
import { parseFilters, runReport } from "@/server/services/reports";
import { managementSummary, parseSummaryFilters, sendMonthlySummary } from "@/server/services/reports/summary";
import { exportSummary, monthLabel } from "@/server/services/reports/summary-export";
import { setSetting } from "@/server/services/settings";
import { addMonths, monthRange } from "@/server/state/reports";
import { owner } from "../support/db";
import { seedContentPeople } from "../support/content";
import { createTestUser } from "../support/factories";
import { scenario } from "../support/report-scenario";

afterAll(async () => {
  await stopJobSender();
});

const TZ = "Europe/Istanbul";

/** Kursiyerin bu dönemde tamamladığı modül sayısı (devreden hariç). */
async function completedModules(userId: string): Promise<number> {
  const [r] = await owner()<{ n: number }[]>`
    select count(*)::int as n from assignment_modules am join assignments a on a.id = am.assignment_id
    where a.user_id = ${userId} and am.status = 'completed' and am.completed_via is distinct from 'carried_over'`;
  return r!.n;
}

describe("Yönetim özeti (iş paketi 3.5, kararlar #237–242)", () => {
  it("karar #237–238 göstergeler; İK ve üst yönetici tesis, bölüm sorumlusu kapsam, İSG uzmanı yalnızca İSG; diğer roller göremez", async () => {
    const p = await seedContentPeople();
    const { u, a } = await scenario(p);
    const today = todayIn(TZ);
    // İkinci kursiyer: eğitimi sürüyor ve hedef tarihi geçmiş
    const late = await createTestUser({ positionId: p.org.positions.presOp, trainingRequired: true, hireDate: addDays(today, -40) });
    await owner()`update assignments set target_date = ${addDays(today, -3)} where user_id = ${late.userId}`;
    const f = await parseSummaryFilters({});

    let hr = await managementSummary(p.hr.actor, f);
    expect(hr.mode).toBe("full");
    expect(hr.current).toEqual({ activeTrainees: 1, awaitingReadiness: 1, overdue: 1 });
    expect(hr.period).toEqual({ readinessApproved: 0, onboarding: { count: 0, avg: null, median: null }, modulesCompleted: await completedModules(u.userId) });
    // İlk deneme kaldı, ikinci deneme geçti: ilk denemede geçme %0
    expect(hr.exams).toEqual({ attempts: 1, passed: 0, rate: 0 });
    expect(hr.ohs).toMatchObject({ expired: 0, completed: 1, expiring: [{ days: 30, count: 0 }, { days: 60, count: 0 }, { days: 90, count: 0 }] });

    // Onay: dönemde 1 onay, işe girişten 10 gün
    await approveReadiness(p.smUretim.actor, a.id, null);
    hr = await managementSummary(p.hr.actor, f);
    expect(hr.current).toEqual({ activeTrainees: 1, awaitingReadiness: 0, overdue: 1 });
    expect(hr.period).toMatchObject({ readinessApproved: 1, onboarding: { count: 1, avg: 10, median: 10 } });

    // Bölüm sorumlusu yalnızca kapsamı; birim süzgeci kapsamı daraltır
    expect((await managementSummary(p.smUretim.actor, f)).current).toEqual(hr.current);
    const other = await managementSummary(p.smKalite.actor, f);
    expect(other.current).toEqual({ activeTrainees: 0, awaitingReadiness: 0, overdue: 0 });
    expect(other.period).toMatchObject({ readinessApproved: 0, modulesCompleted: 0 });
    expect(other.exams.attempts).toBe(0);
    expect(other.ohs.completed).toBe(0);
    const kalite = await managementSummary(p.hr.actor, await parseSummaryFilters({ orgUnitId: p.org.units.kalite }));
    expect(kalite.current!.activeTrainees).toBe(0);
    expect(kalite.trend.every((m) => m.completed === 0)).toBe(true);

    // İSG uzmanı: yalnızca İSG göstergeleri, bütün tesis; Pres sınavı İSG sınavı değildir
    const ohs = await managementSummary(p.ohs.actor, f);
    expect(ohs).toMatchObject({ mode: "ohs", current: null, period: null, exams: { attempts: 0, rate: null } });
    expect(ohs.ohs.completed).toBe(1);
    expect(ohs.trend.at(-1)!.completed).toBe(1);

    // Üst yönetici tam görünüm; sistem yöneticisi, güvenlik, eğitmen ve personel göremez
    const boss = await createTestUser({ roles: ["owner"] });
    expect((await managementSummary(boss.actor, f)).current).toEqual(hr.current);
    const security = await createTestUser({ roles: ["security"] });
    for (const actor of [p.sysadmin.actor, security.actor, p.trainerPres.actor, u.actor]) {
      await expect(managementSummary(actor, f)).rejects.toMatchObject({ code: "forbidden" });
    }
    // Kişi adı ya da sicil yok
    expect(JSON.stringify(hr)).not.toContain(u.sicilNo);
    expect(JSON.stringify(hr)).not.toContain(late.sicilNo);
  });

  it("karar #240 İSG geçerliliği: süresi dolmuş ve 30/60/90 gün içinde dolacak kişiler; girilen son eğitim tarihi de sayılır ve raporda görünür", async () => {
    const p = await seedContentPeople();
    const { u, s } = await scenario(p);
    const today = todayIn(TZ);
    // Kursiyerin İSG eğitiminin süresi iki gün önce doldu
    await owner()`update assignment_modules set expires_at = now() - interval '2 days' where module_id = ${s.isg} and status = 'completed'`;
    // Eski personel: sistem dışı son İSG eğitimi; geçerlilik 12 ay, bitişi yaklaşık 45 gün sonra
    const old = await createTestUser({ positionId: p.org.positions.presOp });
    const prior = (userId: string, daysLeft: number) =>
      recordPriorTrainings(p.hr.actor, { userIds: [userId], moduleId: s.isg, completedOn: addDays(today, daysLeft - 365), note: null });
    expect(await prior(old.userId, 45)).toEqual({ saved: 1, skipped: 0 });

    const f = await parseSummaryFilters({});
    for (const actor of [p.hr.actor, p.ohs.actor]) {
      const r = await managementSummary(actor, f);
      expect(r.ohs.expired).toBe(1);
      expect(r.ohs.oldestExpired).toBe(addDays(today, -2));
      expect(r.ohs.expiring).toEqual([
        { days: 30, count: 0 },
        { days: 60, count: 1 },
        { days: 90, count: 1 },
      ]);
    }
    // Kapsam dışı bölüm sorumlusu görmez
    expect((await managementSummary(p.smKalite.actor, f)).ohs).toMatchObject({ expired: 0, expiring: [{ count: 0 }, { count: 0 }, { count: 0 }] });

    // Süresi dolacaklar raporu aynı kaynağı kullanır: girilen tarih "prior" türüyle listelenir
    const report = await runReport(p.hr.actor, "expiring", await parseFilters("expiring", { from: today, to: addDays(today, 60) }));
    expect(report.tables[0]!.rows.map((r) => [r[0], r[5], r[6]])).toContainEqual([old.sicilNo, "prior", true]);
    const expired = await runReport(p.hr.actor, "expiring", await parseFilters("expiring", { from: addDays(today, -2), to: addDays(today, -1) }));
    expect(expired.tables[0]!.rows.map((r) => [r[0], r[5]])).toContainEqual([u.sicilNo, "module"]);

    // Sistemde tamamlanmış modülde girilen tarih sayılmaz, sistem kaydı geçerlidir (karar #223; tekrar eğitimiyle aynı)
    expect(await prior(u.userId, 10)).toEqual({ saved: 1, skipped: 0 });
    const after = await managementSummary(p.hr.actor, f);
    expect(after.ohs.expired).toBe(1);
    expect(after.ohs.expiring[0]).toEqual({ days: 30, count: 0 });
    // Süresi yenilenince süresi dolmuş sayılmaz
    await owner()`
      update assignment_modules am set expires_at = now() + interval '1 year'
      from assignments a where a.id = am.assignment_id and a.user_id = ${u.userId} and am.module_id = ${s.isg}`;
    expect((await managementSummary(p.hr.actor, f)).ohs.expired).toBe(0);
  });

  it("karar #239 eğilim: 12 ay, bu ay eksik işaretli; Excel indirenin dilinde ve kayda geçer", async () => {
    const p = await seedContentPeople();
    const { u } = await scenario(p);
    const today = todayIn(TZ);
    const thisMonth = today.slice(0, 7);
    const f = await parseSummaryFilters({});
    const r = await managementSummary(p.hr.actor, f);
    expect(r.trend).toHaveLength(12);
    expect(r.trend[0]!.month).toBe(addMonths(thisMonth, -11));
    expect(r.trend.at(-1)).toEqual({ month: thisMonth, completed: await completedModules(u.userId), attempts: 1, passed: 0, rate: 0, partial: true });
    expect(r.trend.slice(0, -1).every((m) => m.completed === 0 && m.rate === null && !m.partial)).toBe(true);
    // Geçmiş dönem: eğilim o ayla biter, eksik ay yok
    const past = monthRange(addMonths(thisMonth, -2));
    const old = await managementSummary(p.hr.actor, await parseSummaryFilters(past));
    expect(old.trend.at(-1)!.month).toBe(addMonths(thisMonth, -2));
    expect(old.trend.some((m) => m.partial)).toBe(false);
    expect(old.exams.attempts).toBe(0);

    const file = await exportSummary(p.hr.actor, f, "tr");
    expect(file.fileName).toBe(`yonetim-ozeti-${today.replaceAll("-", "")}.xlsx`);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(file.buffer as unknown as ExcelJS.Buffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Göstergeler", "Aylık eğilim", "Bilgi"]);
    expect(wb.worksheets[0]!.getRow(2).values).toEqual([undefined, "Eğitimi süren kişi", 0, "Bugün itibarıyla"]);
    expect(wb.worksheets[1]!.rowCount).toBe(13);
    expect(wb.worksheets[1]!.getRow(13).getCell(1).value).toBe(`${monthLabel(thisMonth, "tr")} (devam ediyor)`);
    expect(JSON.stringify(wb.worksheets.map((w) => w.getSheetValues()))).not.toContain(u.sicilNo);
    const en = await exportSummary(p.ohs.actor, f, "en");
    const wbEn = new ExcelJS.Workbook();
    await wbEn.xlsx.load(en.buffer as unknown as ExcelJS.Buffer);
    expect(wbEn.worksheets.map((w) => w.name)).toEqual(["Indicators", "Monthly trend", "Info"]);
    // İSG görünümü: eğitim göstergeleri yok, ilk satır İSG sınavı
    expect(wbEn.worksheets[0]!.getRow(2).getCell(1).value).toBe("First-attempt pass rate in OHS exams");
    expect(wbEn.worksheets[0]!.rowCount).toBe(1 + 7);
    await expect(exportSummary(p.sysadmin.actor, f, "tr")).rejects.toMatchObject({ code: "forbidden" });

    const logged = await db().select().from(reportExports).where(eq(reportExports.report, "summary")).orderBy(reportExports.at);
    expect(logged.map((l) => [l.actorId, l.format])).toEqual([
      [p.hr.userId, "xlsx"],
      [p.ohs.userId, "xlsx"],
    ]);
  });

  it("karar #241–242 aylık özet: İK ve üst yöneticiye ayda bir, ayarlanan gün ve saatte; yalnızca sayılar; e-posta adresi olana e-posta", async () => {
    const p = await seedContentPeople();
    const { u } = await scenario(p);
    const boss = await createTestUser({ roles: ["owner"], email: "patron@japar.test" });
    const hr2 = await createTestUser({ roles: ["hr"], email: "ik@japar.test" });
    const sys = systemActor("test:reports.monthly");
    const thisMonth = todayIn(TZ).slice(0, 7);
    /** `month` ayının verilen gün ve saatinde (Türkiye saati). */
    const at = (month: string, day: number, hour: number) => new Date(`${month}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:30:00+03:00`);
    const next = addMonths(thisMonth, 1);
    const sent = () => db().select().from(notifications).where(eq(notifications.kind, "monthly_summary"));

    // Ayın 1'i 08:00'den önce ve başka günde gönderilmez
    expect(await sendMonthlySummary(sys, at(next, 1, 7))).toBe(0);
    expect(await sendMonthlySummary(sys, at(next, 2, 9))).toBe(0);
    // Ayın 1'i 08:30: İK (2) + üst yönetici; bölüm sorumlusu almaz
    expect(await sendMonthlySummary(sys, at(next, 1, 8))).toBe(3);
    const rows = await sent();
    expect(rows.map((r) => r.userId).sort()).toEqual([p.hr.userId, hr2.userId, boss.userId].sort());
    const range = monthRange(thisMonth);
    expect(rows[0]).toMatchObject({ subjectKey: `monthly_summary:${thisMonth}`, link: `/reports/summary?from=${range.from}&to=${range.to}` });
    expect(rows[0]!.params).toMatchObject({ year: thisMonth.slice(0, 4), monthNo: +thisMonth.slice(5, 7), approved: 0, passRate: 0, avgDays: "none", active: 0, overdue: 0 });
    expect(Object.values(rows[0]!.params).every((v) => typeof v === "number" || /^(none|\d{4})$/.test(String(v)))).toBe(true);

    // E-posta yalnızca adresi olana; alıcının dilinde ay adı; kişi adı yok
    const mails = await db().select().from(emailOutbox).where(eq(emailOutbox.kind, "monthly_summary"));
    expect(mails.map((m) => m.toAddress).sort()).toEqual(["ik@japar.test", "patron@japar.test"]);
    expect(mails[0]!.subject).toContain("Aylık yönetim özeti");
    expect(mails[0]!.bodyText).toContain(`${monthLabel(thisMonth, "tr")} · Tamamlanan eğitim modülü:`);
    expect(mails[0]!.bodyText).toContain("Ortalama işe başlama süresi: —");
    expect(mails[0]!.bodyText).toContain("ilk denemede geçme: %0");
    expect(mails.map((m) => m.bodyText).join()).not.toContain(u.sicilNo);

    // Aynı ay için ikinci kez gönderilmez (aynı gün sonraki saatte de)
    expect(await sendMonthlySummary(sys, at(next, 1, 9))).toBe(0);
    expect(await sent()).toHaveLength(3);

    // Parametreler: kapalıyken gönderilmez; gün ve saat değişebilir
    await setSetting(sys, "reports.monthly_summary_day", 2);
    await setSetting(sys, "reports.monthly_summary_hour", 6);
    await setSetting(sys, "reports.monthly_summary_enabled", false);
    const later = addMonths(thisMonth, 2);
    expect(await sendMonthlySummary(sys, at(later, 2, 6))).toBe(0);
    await setSetting(sys, "reports.monthly_summary_enabled", true);
    expect(await sendMonthlySummary(sys, at(later, 1, 8))).toBe(0);
    expect(await sendMonthlySummary(sys, at(later, 2, 6))).toBe(3);
    const second = await db()
      .select()
      .from(notifications)
      .where(and(eq(notifications.kind, "monthly_summary"), eq(notifications.subjectKey, `monthly_summary:${next}`)));
    expect(second).toHaveLength(3);
  });
});
