import ExcelJS from "exceljs";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { systemActor } from "@/server/authz/actor";
import { db } from "@/server/db/client";
import { assignmentModules, assignments, priorTrainings } from "@/server/db/schema";
import { withActor } from "@/server/db/with-actor";
import { isImmutableViolation } from "@/server/errors";
import { myLearning } from "@/server/services/assignments";
import { acknowledgeItem, learnModule, reportReachedEnd } from "@/server/services/assignments/learner";
import {
  commitPriorImport,
  periodicOverview,
  PRIOR_HEADERS,
  previewPriorImport,
  recordPriorTrainings,
  startPeriodicTraining,
} from "@/server/services/assignments/periodic";
import { runRecert } from "@/server/services/assignments/recert";
import { createModule, saveTasks, setModuleContents } from "@/server/services/modules";
import { addDays, todayIn } from "@/lib/dates";
import { seedContentPeople } from "../support/content";
import { createTestUser } from "../support/factories";
import { moduleInput, publishCard, publishedText } from "../support/training";

type People = Awaited<ReturnType<typeof seedContentPeople>>;

const none = { unitId: null, moduleId: null, state: null, q: null };
const today = () => todayIn("Europe/Istanbul");
/** n ay önce (yaklaşık; gün olarak) */
const monthsAgo = (n: number) => addDays(today(), -Math.round(n * 30.5));

/** Pres planı: süreli teorik (12 ay) + süreli İSG teorik (24 ay) + süresiz teorik + süreli pratik. */
async function setup(p: People) {
  const sm = p.smUretim.actor;
  const c = await publishedText(sm, p.org.units.pres, "Pres güvenliği", "metin");
  const press = (await createModule(sm, moduleInput(p.org.units.pres, "theory", "Yıllık pres güvenliği", { validityMonths: 12 }))).id;
  await setModuleContents(sm, press, [c]);
  const ohs = (await createModule(p.ohs.actor, moduleInput(p.org.units.pres, "theory", "İSG tazeleme", { validityMonths: 24, isOhs: true }))).id;
  await setModuleContents(p.ohs.actor, ohs, [c]);
  const basics = (await createModule(sm, moduleInput(p.org.units.pres, "theory", "Pres temelleri"))).id;
  await setModuleContents(sm, basics, [c]);
  const practice = (await createModule(sm, moduleInput(p.org.units.pres, "practice", "Pres pratiği", { validityMonths: 12 }))).id;
  await saveTasks(sm, practice, [{ title: "Kalıp bağlama", description: null, isCritical: false }]);
  await publishCard(p, p.org.positions.presOp, [basics, press, ohs, practice]);
  // Eski personel: eğitim atanmaz (karar #6)
  const worker = await createTestUser({ positionId: p.org.positions.presOp });
  return { press, ohs, basics, practice, worker };
}

const itemsOf = async (p: People, userId: string) => (await periodicOverview(p.hr.actor, none)).rows.find((r) => r.userId === userId)?.items ?? [];

describe("Eski personelin periyodik eğitimleri (iş paketi 3.2, kararlar #222–225)", () => {
  it("karar #222 kapsam: yalnızca süreli teorik modüller; ekranı İK ve İSG uzmanı görür", async () => {
    const p = await seedContentPeople();
    const s = await setup(p);
    const items = await itemsOf(p, s.worker.userId);
    expect(items.map((i) => [i.moduleId, i.state]).sort()).toEqual(
      [
        [s.press, "none"],
        [s.ohs, "none"],
      ].sort(),
    );
    await expect(periodicOverview(p.ohs.actor, none)).resolves.toBeTruthy();
    for (const who of [p.smUretim, p.trainerPres, p.personnel]) await expect(periodicOverview(who.actor, none)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("karar #223 son eğitim tarihi: İK her modülde, İSG uzmanı yalnızca İSG modülünde; ileri tarih yok; kayıt değiştirilemez", async () => {
    const p = await seedContentPeople();
    const s = await setup(p);
    const input = { userIds: [s.worker.userId], moduleId: s.press, completedOn: monthsAgo(3), note: "Kağıt form 2026" };
    await expect(recordPriorTrainings(p.hr.actor, { ...input, completedOn: addDays(today(), 1) })).rejects.toMatchObject({ code: "prior_date_invalid" });
    await expect(recordPriorTrainings(p.ohs.actor, input)).rejects.toMatchObject({ code: "forbidden" });
    await expect(recordPriorTrainings(p.smUretim.actor, input)).rejects.toMatchObject({ code: "forbidden" });
    expect(await recordPriorTrainings(p.hr.actor, input)).toEqual({ saved: 1, skipped: 0 });
    expect(await recordPriorTrainings(p.ohs.actor, { ...input, moduleId: s.ohs })).toEqual({ saved: 1, skipped: 0 });
    // Planında olmayan modül atlanır
    const other = await createTestUser({ positionId: p.org.positions.kkTek });
    expect(await recordPriorTrainings(p.hr.actor, { ...input, userIds: [other.userId] })).toEqual({ saved: 0, skipped: 1 });

    const press = (await itemsOf(p, s.worker.userId)).find((i) => i.moduleId === s.press)!;
    expect(press).toMatchObject({ state: "scheduled", source: "prior", lastDate: input.completedOn });
    expect(press.opensOn! > today()).toBe(true);
    const err = await withActor(p.hr.actor, (tx) => tx.update(priorTrainings).set({ note: "değişti" }).where(eq(priorTrainings.userId, s.worker.userId))).catch((e: unknown) => e);
    expect(isImmutableViolation(err)).toBe(true);
    // Düzeltme yeni kayıtla: en son girilen geçerli
    await recordPriorTrainings(p.hr.actor, { ...input, completedOn: monthsAgo(5) });
    expect((await itemsOf(p, s.worker.userId)).find((i) => i.moduleId === s.press)?.lastDate).toBe(monthsAgo(5));
  });

  it("karar #224 gece işi: süresi yaklaşan tarihten periyodik atama açar (yalnızca teori), bir kez; bitince onaysız tamamlanır", async () => {
    const p = await seedContentPeople();
    const s = await setup(p);
    await recordPriorTrainings(p.hr.actor, { userIds: [s.worker.userId], moduleId: s.press, completedOn: monthsAgo(13), note: null });
    await recordPriorTrainings(p.hr.actor, { userIds: [s.worker.userId], moduleId: s.ohs, completedOn: monthsAgo(2), note: null });
    const actor = systemActor("test");
    expect((await runRecert(actor)).created).toBeGreaterThanOrEqual(1);
    const [a] = await db().select().from(assignments).where(eq(assignments.userId, s.worker.userId));
    expect(a).toMatchObject({ reason: "periodic", status: "active" });
    const mods = await db().select().from(assignmentModules).where(eq(assignmentModules.assignmentId, a!.id));
    expect(mods.map((m) => m.moduleId)).toEqual([s.press]);
    expect(mods[0]!.renewsPriorId).not.toBeNull();
    await runRecert(actor);
    expect(await db().select().from(assignments).where(eq(assignments.userId, s.worker.userId))).toHaveLength(1);
    expect((await itemsOf(p, s.worker.userId)).find((i) => i.moduleId === s.press)?.state).toBe("open");

    const cur = (await myLearning(s.worker.actor)).current!;
    const view = await learnModule(s.worker.actor, cur.modules[0]!.id);
    for (const item of view.items) {
      await reportReachedEnd(s.worker.actor, item.id);
      await acknowledgeItem(s.worker.actor, item.id);
    }
    const [done] = await db().select({ status: assignments.status }).from(assignments).where(eq(assignments.id, a!.id));
    expect(done?.status).toBe("completed");
    const press = (await itemsOf(p, s.worker.userId)).find((i) => i.moduleId === s.press)!;
    expect(press).toMatchObject({ state: "scheduled", source: "system", lastDate: today() });
  });

  it("karar #222 şimdi başlat: tarihi ve kaydı olmayan süreli modüller açılır; açık eğitimi olan atlanır; yalnızca İK", async () => {
    const p = await seedContentPeople();
    const s = await setup(p);
    const dated = await createTestUser({ positionId: p.org.positions.presOp });
    await recordPriorTrainings(p.hr.actor, { userIds: [dated.userId], moduleId: s.press, completedOn: monthsAgo(1), note: null });
    await recordPriorTrainings(p.hr.actor, { userIds: [dated.userId], moduleId: s.ohs, completedOn: monthsAgo(1), note: null });
    await expect(startPeriodicTraining(p.ohs.actor, [s.worker.userId])).rejects.toMatchObject({ code: "forbidden" });

    const r = await startPeriodicTraining(p.hr.actor, [s.worker.userId, dated.userId]);
    expect(r).toEqual({ started: 1, skipped: [{ userId: dated.userId, reason: "nothing_due" }] });
    const [a] = await db().select().from(assignments).where(and(eq(assignments.userId, s.worker.userId), eq(assignments.reason, "periodic")));
    const mods = await db().select({ moduleId: assignmentModules.moduleId, kind: assignmentModules.kind }).from(assignmentModules).where(eq(assignmentModules.assignmentId, a!.id));
    expect(mods.map((m) => m.moduleId).sort()).toEqual([s.press, s.ohs].sort());
    expect(mods.every((m) => m.kind === "theory")).toBe(true);
    expect(await startPeriodicTraining(p.hr.actor, [s.worker.userId])).toEqual({ started: 0, skipped: [{ userId: s.worker.userId, reason: "open_assignment" }] });
  });

  it("karar #223 Excel: satır hataları önizlemede; onayda geçerli satırlar kaydedilir", async () => {
    const p = await seedContentPeople();
    const s = await setup(p);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Son eğitimler");
    ws.addRow([...PRIOR_HEADERS]);
    ws.addRow([s.worker.sicilNo, "", "yıllık PRES güvenliği", new Date(`${monthsAgo(6)}T00:00:00Z`), "Kağıt"]);
    ws.addRow(["YOK-123", "", "Yıllık pres güvenliği", "01.01.2026", ""]);
    ws.addRow([s.worker.sicilNo, "", "Pres temelleri", "01.01.2026", ""]);
    ws.addRow([s.worker.sicilNo, "", "İSG tazeleme", "01.01.2099", ""]);
    const file = Buffer.from(await wb.xlsx.writeBuffer());
    const preview = await previewPriorImport(p.hr.actor, file);
    expect(preview.rows.map((r) => r.errors)).toEqual([[], ["person_not_found"], ["module_not_found"], ["date_invalid"]]);
    expect(await commitPriorImport(p.hr.actor, file)).toEqual({ saved: 1, skipped: 3 });
    const rows = await db().select().from(priorTrainings).where(eq(priorTrainings.userId, s.worker.userId));
    expect(rows).toMatchObject([{ moduleId: s.press, completedOn: monthsAgo(6), source: "excel", note: "Kağıt" }]);
    // İSG uzmanı İSG dışı modüle Excel'den de giremez
    expect((await previewPriorImport(p.ohs.actor, file)).rows[0]!.errors).toEqual(["not_permitted"]);
  });
});
