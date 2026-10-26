import { eq } from "drizzle-orm";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { importBatches, importRows, personnel } from "@/server/db/schema";
import { withActor } from "@/server/db/with-actor";
import { ForbiddenError, isImmutableViolation } from "@/server/errors";
import { signIn } from "@/server/services/auth";
import {
  buildImportTemplate,
  cancelImport,
  cleanupStaleImports,
  commitImport,
  getImportBatch,
  validateImport,
} from "@/server/services/imports";
import { parseWorkbook } from "@/server/services/imports/parse";
import { createPerson } from "@/server/services/people";
import { systemActor } from "@/server/authz/actor";
import { owner } from "../support/db";
import { createTestUser, meta } from "../support/factories";
import { seedTestOrg } from "../support/org";
import { buildPeopleXlsx } from "../support/xlsx";

async function setup() {
  const org = await seedTestOrg();
  const hr = await createTestUser({ roles: ["hr"] });
  return { org, hr };
}

describe("FG-1.4 Excel personel aktarımı", () => {
  it("doğrulama: geçerli ve hatalı satırları kaydeder; mevcut sicil güncelleme olarak işaretlenir", async () => {
    const { hr } = await setup();
    await createPerson(hr.actor, { sicilNo: "7002", fullName: "Var Olan", employmentType: "employee", trainingRequired: false });
    const buffer = await buildPeopleXlsx([
      ["7001", "Ayşe Yılmaz", "Üretim", "Pres Operatörü", "05.01.2026", "Mavi", "10000000146"],
      ["7002", "Var Olan Güncel", "uretim", "PRES-OP", "06.01.2026", "Mavi"],
      ["7003", "Hatalı Kişi", "Lojistik", "Forkliftçi", "05.01.2026", "Mavi"],
    ]);
    const { batchId } = await validateImport(hr.actor, { fileName: "personel.xlsx", buffer, mode: "new_hires" });
    const { batch, rows } = await getImportBatch(hr.actor, batchId);

    expect(batch).toMatchObject({ totalRows: 3, validRows: 2, errorRows: 1, status: "validated" });
    expect(rows.map((r) => [r.sicilNo, r.status, r.isUpdate])).toEqual([
      ["7001", "valid", false],
      ["7002", "valid", true],
      ["7003", "error", false],
    ]);
    expect(rows[2]!.errors).toContain("department_not_found");
    // TC yalnızca korumalı hâliyle saklanır
    const [raw] = await db().select({ data: importRows.data }).from(importRows).where(eq(importRows.sicilNo, "7001"));
    expect(JSON.stringify(raw?.data)).not.toContain("10000000146");
    expect(rows[0]!.nationalIdMasked).toBe("100******46");
  });

  it("onay: yeni hesaplar açılır (geçici şifreyle giriş), mevcutlar güncellenir, hatalı satır atlanır", async () => {
    const { org, hr } = await setup();
    const existing = await createPerson(hr.actor, { sicilNo: "7102", fullName: "Var Olan", employmentType: "employee", trainingRequired: false });
    const buffer = await buildPeopleXlsx([
      ["7101", "Yeni Kişi", "Üretim", "Pres Operatörü", "05.01.2026", "Mavi"],
      ["7102", "Var Olan Güncel", "Üretim", "Pres Operatörü", "06.01.2026", "Mavi"],
      ["7103", "Hatalı", "Yok", "Yok", "05.01.2026", "Mavi"],
    ]);
    const { batchId } = await validateImport(hr.actor, { fileName: "p.xlsx", buffer, mode: "new_hires" });
    const result = await commitImport(hr.actor, batchId);

    expect(result).toMatchObject({ created: 1, updated: 1, unchanged: 0 });
    expect(result.credentials).toHaveLength(1);
    expect(result.credentials[0]).toMatchObject({ sicilNo: "7101", fullName: "Yeni Kişi", positionName: "Pres Operatörü" });

    const login = await signIn({ sicilNo: "7101", password: result.credentials[0]!.tempPassword, sharedDevice: false }, meta());
    expect(login).toMatchObject({ ok: true, mustChangePassword: true });

    const [created] = await db().select().from(personnel).where(eq(personnel.sicilNo, "7101"));
    expect(created).toMatchObject({ source: "excel", trainingRequired: true, positionId: org.positions.presOp, hireDate: "2026-01-05" });
    const [updated] = await db().select().from(personnel).where(eq(personnel.userId, existing.userId));
    // Karar #2: mevcut kişinin "yeni işe giren" bilgisi aktarım moduyla değişmez
    expect(updated).toMatchObject({ fullName: "Var Olan Güncel", positionId: org.positions.presOp, trainingRequired: false });

    const { batch, rows } = await getImportBatch(hr.actor, batchId);
    expect(batch).toMatchObject({ status: "committed", createdCount: 1, updatedCount: 1 });
    expect(rows.map((r) => r.status)).toEqual(["created", "updated", "error"]);
  });

  it("mevcut personel modu: yeni hesaplara eğitim atanmaz; aynı dosya ikinci kez değişiklik yaratmaz", async () => {
    const { hr } = await setup();
    const buffer = await buildPeopleXlsx([["7201", "Eski Çalışan", "Üretim", "Pres Operatörü", "05.01.2020", "Mavi"]]);
    const first = await validateImport(hr.actor, { fileName: "a.xlsx", buffer, mode: "existing_staff" });
    await commitImport(hr.actor, first.batchId);
    const [p] = await db().select().from(personnel).where(eq(personnel.sicilNo, "7201"));
    expect(p?.trainingRequired).toBe(false);

    const second = await validateImport(hr.actor, { fileName: "a.xlsx", buffer, mode: "existing_staff" });
    expect(await commitImport(hr.actor, second.batchId)).toMatchObject({ created: 0, updated: 0, unchanged: 1, credentials: [] });
  });

  it("onaylanan aktarım tekrar onaylanamaz ve satırları değiştirilemez", async () => {
    const { hr } = await setup();
    const buffer = await buildPeopleXlsx([["7301", "Kişi", "Üretim", "Pres Operatörü", "05.01.2026", "Mavi"]]);
    const { batchId } = await validateImport(hr.actor, { fileName: "a.xlsx", buffer, mode: "new_hires" });
    await commitImport(hr.actor, batchId);
    await expect(commitImport(hr.actor, batchId)).rejects.toMatchObject({ code: "import_not_pending" });
    const err = await withActor(hr.actor, (tx) => tx.update(importRows).set({ status: "error" }).where(eq(importRows.batchId, batchId))).catch(
      (e: unknown) => e,
    );
    expect(isImmutableViolation(err)).toBe(true);
  });

  it("iptal ve 24 saatlik temizlik: kişisel veri içeren satırlar silinir", async () => {
    const { hr } = await setup();
    const buffer = await buildPeopleXlsx([["7401", "Kişi", "Üretim", "Pres Operatörü", "05.01.2026", "Mavi"]]);
    const a = await validateImport(hr.actor, { fileName: "a.xlsx", buffer, mode: "new_hires" });
    await cancelImport(hr.actor, a.batchId);
    expect(await db().select().from(importRows).where(eq(importRows.batchId, a.batchId))).toHaveLength(0);

    const b = await validateImport(hr.actor, { fileName: "b.xlsx", buffer, mode: "new_hires" });
    await owner()`update import_batches set created_at = now() - interval '25 hours' where id = ${b.batchId}`;
    expect(await cleanupStaleImports(systemActor("test"))).toBe(1);
    const [batch] = await db().select().from(importBatches).where(eq(importBatches.id, b.batchId));
    expect(batch?.status).toBe("cancelled");
    expect(await db().select().from(importRows).where(eq(importRows.batchId, b.batchId))).toHaveLength(0);
  });

  it("dosya hataları: eksik sütun, boş dosya, okunamayan dosya", async () => {
    const { hr } = await setup();
    await expect(
      validateImport(hr.actor, { fileName: "x.xlsx", buffer: await buildPeopleXlsx([["1"]], ["Sicil No"]), mode: "new_hires" }),
    ).rejects.toMatchObject({ code: "missing_columns" });
    await expect(validateImport(hr.actor, { fileName: "x.xlsx", buffer: await buildPeopleXlsx([]), mode: "new_hires" })).rejects.toMatchObject({
      code: "no_rows",
    });
    await expect(validateImport(hr.actor, { fileName: "x.xlsx", buffer: Buffer.from("merhaba"), mode: "new_hires" })).rejects.toMatchObject({
      code: "file_unreadable",
    });
  });

  it("başka personele kayıtlı TC satırı hatalıdır", async () => {
    const { hr } = await setup();
    await createPerson(hr.actor, { sicilNo: "7501", fullName: "TC Sahibi", nationalId: "10000000146", employmentType: "employee", trainingRequired: false });
    const buffer = await buildPeopleXlsx([["7502", "Başka", "Üretim", "Pres Operatörü", "05.01.2026", "Mavi", "10000000146"]]);
    const { batchId } = await validateImport(hr.actor, { fileName: "a.xlsx", buffer, mode: "new_hires" });
    const { rows } = await getImportBatch(hr.actor, batchId);
    expect(rows[0]!.errors).toContain("national_id_taken");
  });

  it("şablon: başlıklar, departman listesi ve pozisyon sayfası; şablon geri okunabilir", async () => {
    const { hr } = await setup();
    const xlsx = await buildImportTemplate(hr.actor);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(xlsx as unknown as ExcelJS.Buffer);
    expect(wb.getWorksheet("Personel")?.getRow(1).values).toContain("Sicil No");
    expect(wb.getWorksheet("Pozisyonlar")?.rowCount).toBeGreaterThan(1);
    const parsed = await parseWorkbook(xlsx);
    expect(parsed.missingColumns).toEqual([]);
  });

  it("yalnızca İK ve sistem yöneticisi aktarım yapar", async () => {
    await seedTestOrg();
    const buffer = await buildPeopleXlsx([["1", "A", "Üretim", "Pres Operatörü", "05.01.2026", "Mavi"]]);
    for (const roles of [[], ["section_manager"], ["ohs_specialist"]] as const) {
      const u = await createTestUser({ roles: [...roles] });
      await expect(validateImport(u.actor, { fileName: "a.xlsx", buffer, mode: "new_hires" })).rejects.toBeInstanceOf(ForbiddenError);
    }
  });
});
