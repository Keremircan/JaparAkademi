import ExcelJS from "exceljs";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { systemActor } from "@/server/authz/actor";
import { protectNationalId } from "@/server/crypto/national-id";
import { db } from "@/server/db/client";
import { dataAccessLog, modules, personnel, reportExports } from "@/server/db/schema";
import { withActor } from "@/server/db/with-actor";
import { myLearning } from "@/server/services/assignments";
import { acknowledgeItem, learnModule, reportReachedEnd } from "@/server/services/assignments/learner";
import { recordPriorTrainings, startPeriodicTraining } from "@/server/services/assignments/periodic";
import { createModule, getModule, setModuleContents, updateModule } from "@/server/services/modules";
import { exportOsgb, osgbRecords } from "@/server/services/reports/osgb";
import { priorExpiry } from "@/server/state/periodic";
import { addDays, todayIn } from "@/lib/dates";
import { seedContentPeople } from "../support/content";
import { createTestUser } from "../support/factories";
import { moduleInput, publishCard, publishedText } from "../support/training";

type People = Awaited<ReturnType<typeof seedContentPeople>>;

const today = () => todayIn("Europe/Istanbul");

/** Geçerli (algoritmaya uyan) rastgele TC kimlik numarası. */
function randomNationalId(): string {
  const d = [1 + Math.floor(Math.random() * 9), ...Array.from({ length: 8 }, () => Math.floor(Math.random() * 10))];
  const odd = d[0]! + d[2]! + d[4]! + d[6]! + d[8]!;
  const even = d[1]! + d[3]! + d[5]! + d[7]!;
  const d10 = (((odd * 7 - even) % 10) + 10) % 10;
  const d11 = (d.reduce((a, b) => a + b, 0) + d10) % 10;
  return [...d, d10, d11].join("");
}

async function setNationalId(userId: string, raw: string) {
  const p = protectNationalId(raw)!;
  await withActor(systemActor("test"), (tx) =>
    tx.update(personnel).set({ nationalIdEnc: p.enc, nationalIdHmac: p.hmac, nationalIdMasked: p.masked }).where(eq(personnel.userId, userId)),
  );
}

/** Pres planı: iki süreli İSG teorik modülü (konu grubu genel ve teknik). */
async function setup(p: People) {
  const c = await publishedText(p.smUretim.actor, p.org.units.pres, "İSG metni", "metin");
  const general = (await createModule(p.ohs.actor, moduleInput(p.org.units.pres, "theory", "İSG temel", { validityMonths: 12, isOhs: true, ohsTopic: "general" }))).id;
  await setModuleContents(p.ohs.actor, general, [c]);
  const fire = (await createModule(p.ohs.actor, moduleInput(p.org.units.pres, "theory", "Yangın eğitimi", { validityMonths: 24, isOhs: true, ohsTopic: "technical" }))).id;
  await setModuleContents(p.ohs.actor, fire, [c]);
  await publishCard(p, p.org.positions.presOp, [general, fire]);
  const dated = await createTestUser({ positionId: p.org.positions.presOp });
  const learner = await createTestUser({ positionId: p.org.positions.presOp });
  const tc = randomNationalId();
  await setNationalId(dated.userId, tc);
  return { general, fire, dated, learner, tc };
}

const filters = () => ({ from: addDays(today(), -400), to: today(), orgUnitId: null, positionId: null });

describe("OSGB dışa aktarımı (iş paketi 3.3, kararlar #226–229)", () => {
  it("karar #228 konu grubu: İSG uzmanı belirler; İSG dışı modülde boş kalır (veritabanı da engeller)", async () => {
    const p = await seedContentPeople();
    const id = (await createModule(p.ohs.actor, moduleInput(p.org.units.pres, "theory", "Sağlık gözetimi", { isOhs: true, ohsTopic: "health" }))).id;
    const topicOf = async (moduleId: string) => (await db().select({ t: modules.ohsTopic }).from(modules).where(eq(modules.id, moduleId)))[0]?.t;
    expect((await getModule(p.ohs.actor, id)).ohsTopic).toBe("health");
    const base = { title: "Sağlık gözetimi", description: null, durationMin: 60, isOhs: true, remoteAllowed: true, validityMonths: null, commonTarget: null, commonSortOrder: null };
    await updateModule(p.ohs.actor, id, { ...base, ohsTopic: "other" });
    expect(await topicOf(id)).toBe("other");
    // İSG işareti kalkınca konu grubu boşalır
    await updateModule(p.ohs.actor, id, { ...base, isOhs: false, ohsTopic: "other" });
    expect(await topicOf(id)).toBeNull();
    // Bölüm sorumlusu İSG dışı modüle konu grubu veremez
    const plain = (await createModule(p.smUretim.actor, moduleInput(p.org.units.pres, "theory", "Pres temelleri", { ohsTopic: "general" }))).id;
    expect(await topicOf(plain)).toBeNull();
    const err = await withActor(systemActor("test"), (tx) => tx.update(modules).set({ ohsTopic: "general" }).where(eq(modules.id, plain))).catch((e: unknown) => e);
    expect(String((err as { cause?: { code?: string } }).cause?.code ?? (err as { code?: string }).code)).toBe("23514");
  });

  it("karar #226 kayıtlar: sistemde tamamlanan İSG modülleri + girilen son tarih (en son girilen); yetki İK ve İSG uzmanı", async () => {
    const p = await seedContentPeople();
    const s = await setup(p);
    // Eski personel: aynı modüle iki kez tarih girildi; yalnızca son girilen dosyaya çıkar
    await recordPriorTrainings(p.hr.actor, { userIds: [s.dated.userId], moduleId: s.fire, completedOn: addDays(today(), -200), note: null });
    await recordPriorTrainings(p.hr.actor, { userIds: [s.dated.userId], moduleId: s.fire, completedOn: addDays(today(), -100), note: null });
    // Diğer kişi periyodik eğitimde İSG temel modülünü tamamlar
    expect((await startPeriodicTraining(p.hr.actor, [s.learner.userId])).started).toBe(1);
    const mod = (await myLearning(s.learner.actor)).current!.modules.find((m) => m.moduleId === s.general)!;
    for (const item of (await learnModule(s.learner.actor, mod.id)).items) {
      await reportReachedEnd(s.learner.actor, item.id);
      await acknowledgeItem(s.learner.actor, item.id);
    }

    const { records, withNationalId } = await osgbRecords(p.hr.actor, filters());
    expect(withNationalId).toBe(true);
    const mine = records.filter((r) => r.userId === s.dated.userId || r.userId === s.learner.userId);
    expect(mine).toHaveLength(2);
    expect(mine.find((r) => r.userId === s.dated.userId)).toMatchObject({
      source: "prior",
      topic: "Yangın eğitimi",
      topicGroup: "technical",
      date: addDays(today(), -100),
      validUntil: priorExpiry(addDays(today(), -100), 24),
      hours: 1,
      method: null,
      documentNo: null,
      nationalId: s.tc,
    });
    const sys = mine.find((r) => r.userId === s.learner.userId)!;
    expect(sys).toMatchObject({ source: "system", topic: "İSG temel", topicGroup: "general", date: today(), method: "remote", nationalId: null });
    expect(sys.documentNo).toMatch(/^JA-\d{4}-\d{6}$/);

    // Dönem dışı kalan tarih çıkmaz
    const narrow = await osgbRecords(p.hr.actor, { ...filters(), from: addDays(today(), -50) });
    expect(narrow.records.some((r) => r.userId === s.dated.userId)).toBe(false);

    for (const who of [p.smUretim, p.trainerPres, p.personnel]) await expect(osgbRecords(who.actor, filters())).rejects.toMatchObject({ code: "forbidden" });
  });

  it("karar #227 TC kimlik no: yalnızca İK'nın dosyasında tam; her kişi için erişim kaydı; İSG uzmanında boş", async () => {
    const p = await seedContentPeople();
    const s = await setup(p);
    await recordPriorTrainings(p.ohs.actor, { userIds: [s.dated.userId], moduleId: s.fire, completedOn: addDays(today(), -30), note: null });

    const ohs = await osgbRecords(p.ohs.actor, filters());
    expect(ohs.withNationalId).toBe(false);
    expect(ohs.records.find((r) => r.userId === s.dated.userId)?.nationalId).toBeNull();
    const xlsx = await exportOsgb(p.ohs.actor, filters(), "xlsx", "tr");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(xlsx.buffer as unknown as ArrayBuffer);
    const ws = wb.worksheets[0]!;
    expect(ws.getRow(1).getCell(1).value).toBe("TC kimlik no");
    expect(xlsx.fileName).toMatch(/^osgb-isg-egitimleri-\d{8}\.xlsx$/);
    expect(await db().select().from(dataAccessLog).where(eq(dataAccessLog.actorId, p.ohs.userId))).toHaveLength(0);

    await exportOsgb(p.hr.actor, filters(), "csv", "tr");
    const logs = await db()
      .select()
      .from(dataAccessLog)
      .where(and(eq(dataAccessLog.actorId, p.hr.userId), eq(dataAccessLog.subjectUserId, s.dated.userId)));
    expect(logs.map((l) => l.field)).toEqual(["national_id_osgb"]);
    const exports = await db().select().from(reportExports).where(and(eq(reportExports.report, "osgb"), eq(reportExports.actorId, p.hr.userId)));
    expect(exports).toMatchObject([{ format: "csv", filters: { nationalId: "full" } }]);
  });

  it("karar #229 CSV: UTF-8 BOM, noktalı virgül, Türkçe ondalık; İngilizce indirenin dilinde", async () => {
    const p = await seedContentPeople();
    const s = await setup(p);
    await recordPriorTrainings(p.hr.actor, { userIds: [s.dated.userId], moduleId: s.fire, completedOn: "2026-01-15", note: null });
    const f = { ...filters(), from: "2026-01-01", to: "2026-01-31" };
    const csv = (await exportOsgb(p.hr.actor, f, "csv", "tr")).buffer.toString("utf8");
    expect(csv.startsWith("﻿TC kimlik no;Sicil no;Ad soyad;")).toBe(true);
    const line = csv.split("\r\n").find((l) => l.startsWith(s.tc))!;
    expect(line.split(";")).toEqual([s.tc, s.dated.sicilNo, expect.any(String), expect.any(String), expect.any(String), "Yangın eğitimi", "Teknik konular", "15.01.2026", "1", "", "", "", "15.01.2028", "Girilen tarih"]);
    const en = await exportOsgb(p.hr.actor, f, "csv", "en");
    expect(en.buffer.toString("utf8").startsWith("﻿National ID no;Employee no;")).toBe(true);
    expect(en.fileName).toMatch(/^osgb-ohs-training-20260131\.csv$/);
  });
});
