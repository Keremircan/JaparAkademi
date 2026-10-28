import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { evacuationMarks, evacuationRollcalls, reportExports } from "@/server/db/schema";
import { ForbiddenError, isImmutableViolation } from "@/server/errors";
import { todayIn } from "@/lib/dates";
import { runReport, parseFilters } from "@/server/services/reports";
import {
  createCompany,
  createVisit,
  endRollcall,
  evacuationPdf,
  insideNow,
  openRollcall,
  refreshRollcall,
  setSafe,
  startRollcall,
} from "@/server/services/visitors";
import { owner } from "../support/db";
import { createTestUser } from "../support/factories";
import { testNationalId } from "../support/national-id";

const today = () => todayIn("Europe/Istanbul");

/** Girişi yapılmış ziyaret (kapı akışını kısaltmak için doğrudan). */
async function inside(security: Awaited<ReturnType<typeof createTestUser>>, host: Awaited<ReturnType<typeof createTestUser>>, name: string, extra: object = {}) {
  const { id } = await createVisit(security.actor, { visitorType: "office", plannedDate: today(), fullName: name, hostSicilNo: host.sicilNo, ...extra });
  await owner()`update visits set status = 'checked_in', checked_in_at = now(), checked_in_by = ${security.userId}, badge_no = ${`K-${name.length}`} where id = ${id}`;
  return id;
}

async function people() {
  const security = await createTestUser({ roles: ["security"] });
  const ohs = await createTestUser({ roles: ["ohs_specialist"] });
  const hr = await createTestUser({ roles: ["hr"] });
  const host = await createTestUser();
  return { security, ohs, hr, host };
}

describe("Tahliye yoklaması (SPEC 8.3 FG-8.1, iş paketi 2.4)", () => {
  it("FG-8.1 içeridekiler: yalnızca çıkışı yapılmamış girişler, tarihten bağımsız; ev sahibi göremez", async () => {
    const { security, ohs, host } = await people();
    const a = await inside(security, host, "Dünden Kalan");
    await owner()`alter table visits disable trigger gate_guard`;
    await owner()`update visits set planned_date = planned_date - 1 where id = ${a}`;
    await owner()`alter table visits enable trigger gate_guard`;
    const b = await inside(security, host, "Bugün Giren");
    await createVisit(security.actor, { visitorType: "office", plannedDate: today(), fullName: "Henüz Gelmedi", hostSicilNo: host.sicilNo });
    expect((await insideNow(security.actor)).map((p) => p.visitId).sort()).toEqual([a, b].sort());
    expect(await insideNow(ohs.actor)).toHaveLength(2);
    await expect(insideNow(host.actor)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("FG-8.1 yoklama: başlangıçtakiler eklenir, tek açık yoklama, yenile, işaret/geri al, bitince donar", async () => {
    const { security, ohs, host } = await people();
    const a = await inside(security, host, "Birinci Misafir");
    const b = await inside(security, host, "İkinci Misafir");
    const { id } = await startRollcall(ohs.actor, "drill");
    await expect(startRollcall(security.actor, "real")).rejects.toMatchObject({ code: "rollcall_open" });
    expect((await openRollcall(security.actor))?.people.map((p) => p.visitId).sort()).toEqual([a, b].sort());

    const c = await inside(security, host, "Sonradan Giren");
    expect(await refreshRollcall(security.actor, id)).toBe(1);
    expect(await refreshRollcall(security.actor, id)).toBe(0);

    await setSafe(security.actor, id, a, true);
    await setSafe(security.actor, id, b, true);
    await setSafe(security.actor, id, b, false);
    const open = await openRollcall(security.actor);
    expect(open!.people.filter((p) => p.safeAt).map((p) => p.visitId)).toEqual([a]);

    // Eksik varken de bitirilebilir; eksikler kayıtta kalır
    await endRollcall(security.actor, id);
    expect(await openRollcall(security.actor)).toBeNull();
    const marks = await db().select().from(evacuationMarks).where(eq(evacuationMarks.rollcallId, id));
    expect(marks).toHaveLength(3);
    expect(marks.find((m) => m.visitId === c)!.safeAt).toBeNull();

    await expect(setSafe(security.actor, id, c, true)).rejects.toMatchObject({ code: "rollcall_ended" });
    const err = await db().update(evacuationMarks).set({ safeAt: new Date() }).where(eq(evacuationMarks.visitId, c)).catch((e: unknown) => e);
    expect(isImmutableViolation(err)).toBe(true);
    const err2 = await db().update(evacuationRollcalls).set({ kind: "real" }).where(eq(evacuationRollcalls.id, id)).catch((e: unknown) => e);
    expect(isImmutableViolation(err2)).toBe(true);
    // Yeni yoklama açılabilir
    expect((await startRollcall(security.actor, "real")).id).not.toBe(id);
  });

  it("kağıt yedeği PDF'i üretilir ve her indirme kayda geçer", async () => {
    const { security, host } = await people();
    await inside(security, host, "PDF Misafiri");
    const inPdf = await evacuationPdf(security.actor, null);
    expect(inPdf.buffer.subarray(0, 4).toString()).toBe("%PDF");
    const { id } = await startRollcall(security.actor, "drill");
    const rcPdf = await evacuationPdf(security.actor, id);
    expect(rcPdf.buffer.subarray(0, 4).toString()).toBe("%PDF");
    const logs = await db().select().from(reportExports).where(eq(reportExports.actorId, security.userId));
    expect(logs.map((l) => l.report)).toEqual(["evacuation", "evacuation"]);
    expect(logs.map((l) => l.rowCount)).toEqual([1, 1]);
  });
});

describe("Ziyaretçi raporları (SPEC 10.1, karar #162)", () => {
  it("ziyaretçi kayıt defteri: güvenlik ve İSG görür; tarih aralığına göre", async () => {
    const { security, ohs, hr, host } = await people();
    await inside(security, host, "Defter Misafiri", { id: { idKind: "tc", idNumber: testNationalId(909) } });
    const f = await parseFilters("visitors", {});
    const r = await runReport(security.actor, "visitors", f);
    expect(r.tables[0]!.rows).toHaveLength(1);
    const row = r.tables[0]!.rows[0]!;
    expect(row[1]).toBe("Defter Misafiri");
    expect(row[5]).toBe("checked_in");
    expect(String(row[12])).toMatch(/\*{6}/);
    expect((await runReport(ohs.actor, "visitors", f)).tables[0]!.rows).toHaveLength(1);
    await expect(runReport(hr.actor, "visitors", f)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(runReport(host.actor, "visitors", f)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("taşeron uygunluk: firma başına çalışan, geçerli ve geçersiz sayısı; İSG ve İK görür", async () => {
    const { security, ohs, hr, host } = await people();
    const { id: companyId } = await createCompany(security.actor, { name: "Uygunluk Ltd.", taxNo: "1112223334" });
    const v1 = await createVisit(security.actor, { visitorType: "contractor", contractorCompanyId: companyId, plannedDate: today(), fullName: "Geçerli Usta", hostSicilNo: host.sicilNo, id: { idKind: "tc", idNumber: testNationalId(811) } });
    await createVisit(security.actor, { visitorType: "contractor", contractorCompanyId: companyId, plannedDate: today(), fullName: "Geçersiz Usta", hostSicilNo: host.sicilNo, id: { idKind: "tc", idNumber: testNationalId(822) } });
    const [vis] = await owner()<{ visitor_id: string }[]>`select visitor_id from visits where id = ${v1.id}`;
    await owner()`insert into contractor_clearances (id, visitor_id, visit_id, valid_until) values (gen_random_uuid(), ${vis!.visitor_id}, ${v1.id}, (current_date + 200))`;
    const f = await parseFilters("contractors", {});
    const r = await runReport(ohs.actor, "contractors", f);
    const row = r.tables[0]!.rows.find((x) => x[0] === "Uygunluk Ltd.")!;
    expect(row.slice(4, 7)).toEqual([2, 1, 1]);
    expect(row[7]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect((await runReport(hr.actor, "contractors", f)).tables[0]!.rows.length).toBeGreaterThan(0);
    await expect(runReport(security.actor, "contractors", f)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
