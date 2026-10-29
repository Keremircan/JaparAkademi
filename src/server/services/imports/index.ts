import ExcelJS from "exceljs";
import { and, asc, eq, inArray, lt } from "drizzle-orm";
import type { Actor } from "@/server/authz/actor";
import { assertCan } from "@/server/authz/policy";
import { hmacNationalId, protectNationalId } from "@/server/crypto/national-id";
import { db, type DbOrTx } from "@/server/db/client";
import { importBatches, importRows, orgUnits, personnel, positions, users } from "@/server/db/schema";
import { withActor } from "@/server/db/with-actor";
import { syncAssignmentForPerson } from "@/server/services/assignments/engine";
import { NotFoundError, ValidationError } from "@/server/errors";
import { insertAccount, prepareInvitedAccount } from "@/server/services/accounts";
import { issueInvitation, type IssuedInvite } from "@/server/services/invitations";
import {
  checkRows,
  MAX_IMPORT_BYTES,
  type NormalizedRow,
  type OrgLookup,
  parseWorkbook,
  TEMPLATE_HEADERS,
} from "./parse";

/**
 * Excel personel aktarımı (FG-1.4): yükle → doğrula/önizle → onayla.
 * Satırlar sicil no'ya göre eklenir veya güncellenir. Yeni hesaplara geçici şifre üretilir;
 * şifreler saklanmaz, onay anında bir kez PDF olarak verilir.
 */

export const STALE_IMPORT_HOURS = 24;

type StoredRowData = Omit<Partial<NormalizedRow>, "nationalId"> & {
  nationalId?: { enc: string; hmac: string; masked: string } | null;
  existingUserId?: string | null;
};

async function loadLookup(conn: DbOrTx = db()): Promise<OrgLookup> {
  const [units, posRows] = await Promise.all([conn.select().from(orgUnits), conn.select().from(positions)]);
  const deptOf = new Map(units.map((u) => [u.id, u.parentId ?? u.id]));
  const positionsByDepartment: OrgLookup["positionsByDepartment"] = new Map();
  const positionsByCode: OrgLookup["positionsByCode"] = new Map();
  for (const p of posRows) {
    const departmentId = deptOf.get(p.orgUnitId)!;
    const list = positionsByDepartment.get(departmentId) ?? [];
    list.push({ id: p.id, name: p.name, code: p.code, status: p.status, collarType: p.collarType });
    positionsByDepartment.set(departmentId, list);
    positionsByCode.set(p.code, { id: p.id, departmentId, status: p.status, collarType: p.collarType });
  }
  return {
    departments: units
      .filter((u) => u.kind === "department")
      .map((u) => ({ id: u.id, name: u.name, code: u.code, isActive: u.isActive })),
    positionsByDepartment,
    positionsByCode,
  };
}

/** Dosyayı okur, satırları doğrular ve önizleme için kaydeder. */
export async function validateImport(
  actor: Actor,
  input: { fileName: string; buffer: ArrayBuffer | Buffer; mode: "existing_staff" | "new_hires" },
): Promise<{ batchId: string }> {
  assertCan(actor, "people.manage");
  if (actor.kind !== "user") throw new ValidationError("user_required");
  const size = input.buffer.byteLength;
  if (size === 0) throw new ValidationError("file_empty");
  if (size > MAX_IMPORT_BYTES) throw new ValidationError("file_too_large");

  let parsed;
  try {
    parsed = await parseWorkbook(input.buffer);
  } catch {
    throw new ValidationError("file_unreadable");
  }
  if (parsed.missingColumns.length > 0) throw new ValidationError("missing_columns", parsed.missingColumns);
  if (parsed.tooManyRows) throw new ValidationError("too_many_rows");
  if (parsed.rows.length === 0) throw new ValidationError("no_rows");

  const checks = checkRows(parsed.rows, await loadLookup());

  // Veritabanı kontrolleri: mevcut sicil (güncelleme) ve başka kişiye ait TC
  const sicils = checks.map((c) => c.sicilNo).filter((s): s is string => !!s);
  const existing = sicils.length
    ? await db().select({ id: users.id, username: users.username }).from(users).where(inArray(users.username, sicils))
    : [];
  const userBySicil = new Map(existing.map((u) => [u.username!, u.id]));

  const hmacs = checks.map((c) => (c.data.nationalId ? hmacNationalId(c.data.nationalId) : null));
  const hmacList = hmacs.filter((h): h is string => !!h);
  const owners = hmacList.length
    ? await db()
        .select({ hmac: personnel.nationalIdHmac, sicilNo: personnel.sicilNo })
        .from(personnel)
        .where(inArray(personnel.nationalIdHmac, hmacList))
    : [];
  const ownerByHmac = new Map(owners.map((o) => [o.hmac!, o.sicilNo]));

  const rows = checks.map((c, i) => {
    const hmac = hmacs[i];
    const owner = hmac ? ownerByHmac.get(hmac) : undefined;
    if (owner && owner !== c.sicilNo) c.errors.push("national_id_taken");
    const { nationalId, ...rest } = c.data;
    const data: StoredRowData = {
      ...rest,
      nationalId: nationalId ? protectNationalId(nationalId) : null,
      existingUserId: c.sicilNo ? (userBySicil.get(c.sicilNo) ?? null) : null,
    };
    return {
      rowNumber: c.rowNumber,
      sicilNo: c.sicilNo,
      data,
      errors: c.errors,
      status: c.errors.length ? ("error" as const) : ("valid" as const),
    };
  });
  const errorRows = rows.filter((r) => r.status === "error").length;

  const batchId = await withActor(actor, async (tx) => {
    const [batch] = await tx
      .insert(importBatches)
      .values({
        fileName: input.fileName.slice(0, 200),
        fileSize: size,
        mode: input.mode,
        totalRows: rows.length,
        validRows: rows.length - errorRows,
        errorRows,
        createdBy: actor.userId,
      })
      .returning({ id: importBatches.id });
    for (let i = 0; i < rows.length; i += 500) {
      await tx.insert(importRows).values(rows.slice(i, i + 500).map((r) => ({ ...r, batchId: batch!.id })));
    }
    return batch!.id;
  });
  return { batchId };
}

export type ImportPreviewRow = {
  rowNumber: number;
  sicilNo: string | null;
  fullName: string | null;
  positionId: string | null;
  hireDate: string | null;
  nationalIdMasked: string | null;
  isUpdate: boolean;
  status: string;
  errors: string[];
};

export async function getImportBatch(actor: Actor, batchId: string) {
  assertCan(actor, "people.manage");
  const [batch] = await db().select().from(importBatches).where(eq(importBatches.id, batchId)).limit(1);
  if (!batch) throw new NotFoundError("import_batch");
  const rows = await db()
    .select()
    .from(importRows)
    .where(eq(importRows.batchId, batchId))
    .orderBy(asc(importRows.rowNumber));
  const preview: ImportPreviewRow[] = rows.map((r) => {
    const d = r.data as StoredRowData;
    return {
      rowNumber: r.rowNumber,
      sicilNo: r.sicilNo,
      fullName: d.fullName ?? null,
      positionId: d.positionId ?? null,
      hireDate: d.hireDate ?? null,
      nationalIdMasked: d.nationalId?.masked ?? null,
      isUpdate: !!d.existingUserId,
      status: r.status,
      errors: r.errors,
    };
  });
  return { batch, rows: preview };
}


async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]!);
      }
    }),
  );
  return out;
}

/**
 * Onay: geçerli satırları uygular (tek transaction). Yeni hesaplar şifresiz açılır ve basılı kanaldan davet
 * alır (karar #185); kodlar yalnızca bu çağrının sonucunda döner, saklanmaz.
 */
export async function commitImport(
  actor: Actor,
  batchId: string,
): Promise<{ created: number; updated: number; unchanged: number; invites: IssuedInvite[] }> {
  assertCan(actor, "people.manage");
  if (actor.kind !== "user") throw new ValidationError("user_required");
  const [batch] = await db().select().from(importBatches).where(eq(importBatches.id, batchId)).limit(1);
  if (!batch) throw new NotFoundError("import_batch");
  if (batch.status !== "validated") throw new ValidationError("import_not_pending");

  const rows = await db().select().from(importRows).where(eq(importRows.batchId, batchId)).orderBy(asc(importRows.rowNumber));
  const valid = rows.filter((r) => r.status === "valid");
  if (valid.length === 0) throw new ValidationError("no_valid_rows");

  // Doğrulamadan bu yana açılmış hesaplar varsa güncellemeye döner
  const sicils = valid.map((r) => r.sicilNo!);
  const existing = await db().select({ id: users.id, username: users.username }).from(users).where(inArray(users.username, sicils));
  const userBySicil = new Map(existing.map((u) => [u.username!, u.id]));

  const toCreate = valid.filter((r) => !userBySicil.has(r.sicilNo!));
  const prepared = await mapLimit(toCreate, 8, async (row) => {
    const d = row.data as StoredRowData;
    const account = await prepareInvitedAccount({
        sicilNo: d.sicilNo!,
        fullName: d.fullName!,
        positionId: d.positionId!,
        nationalId: d.nationalId ?? null,
        phone: d.phone ?? null,
        email: d.email ?? null,
        hireDate: d.hireDate!,
        source: "excel",
        trainingRequired: batch.mode === "new_hires",
    });
    return { rowId: row.id, account };
  });

  const invites: IssuedInvite[] = [];
  let updated = 0;
  let unchanged = 0;
  const now = new Date();

  await withActor(actor, async (tx) => {
    const resultByRow = new Map<string, { status: "created" | "updated" | "unchanged"; userId: string }>();

    for (const p of prepared) {
      const userId = await insertAccount(tx, p.account, actor.userId);
      resultByRow.set(p.rowId, { status: "created", userId });
      invites.push(await issueInvitation(tx, { userId, channel: "print", createdBy: actor.userId }));
    }

    for (const row of valid) {
      const userId = userBySicil.get(row.sicilNo!);
      if (!userId) continue;
      const d = row.data as StoredRowData;
      const [current] = await tx.select().from(personnel).where(eq(personnel.userId, userId)).limit(1);
      if (!current) continue;
      // Boş bırakılan isteğe bağlı alanlar mevcut değeri silmez
      const next = {
        fullName: d.fullName!,
        positionId: d.positionId!,
        hireDate: d.hireDate!,
        phone: d.phone ?? current.phone,
        email: d.email ?? current.email,
        nationalIdEnc: d.nationalId?.enc ?? current.nationalIdEnc,
        nationalIdHmac: d.nationalId?.hmac ?? current.nationalIdHmac,
        nationalIdMasked: d.nationalId?.masked ?? current.nationalIdMasked,
      };
      const changed =
        next.fullName !== current.fullName ||
        next.positionId !== current.positionId ||
        next.hireDate !== current.hireDate ||
        next.phone !== current.phone ||
        next.email !== current.email ||
        next.nationalIdHmac !== current.nationalIdHmac;
      if (changed) {
        // TC aynıysa yeniden şifrelenmiş değeri yazma (gereksiz denetim kaydı olmasın)
        const values =
          next.nationalIdHmac === current.nationalIdHmac
            ? { ...next, nationalIdEnc: current.nationalIdEnc, nationalIdMasked: current.nationalIdMasked }
            : next;
        await tx.update(personnel).set(values).where(eq(personnel.userId, userId));
        await tx.update(users).set({ name: next.fullName }).where(eq(users.id, userId));
        if (next.positionId !== current.positionId) await syncAssignmentForPerson(tx, userId, actor.userId);
        updated++;
      } else unchanged++;
      resultByRow.set(row.id, { status: changed ? "updated" : "unchanged", userId });
    }

    for (const row of rows) {
      const result = resultByRow.get(row.id);
      await tx
        .update(importRows)
        .set({ status: result?.status ?? row.status, userId: result?.userId ?? null, committedAt: now })
        .where(eq(importRows.id, row.id));
    }
    await tx
      .update(importBatches)
      .set({
        status: "committed",
        committedBy: actor.userId,
        committedAt: now,
        createdCount: invites.length,
        updatedCount: updated,
      })
      .where(eq(importBatches.id, batchId));
  });

  return { created: invites.length, updated, unchanged, invites };
}

/** İptal: satırlar (kişisel veri) silinir, aktarım kaydı "iptal" olarak kalır. */
export async function cancelImport(actor: Actor, batchId: string): Promise<void> {
  assertCan(actor, "people.manage");
  const [batch] = await db().select().from(importBatches).where(eq(importBatches.id, batchId)).limit(1);
  if (!batch) throw new NotFoundError("import_batch");
  if (batch.status !== "validated") throw new ValidationError("import_not_pending");
  await withActor(actor, async (tx) => {
    await tx.delete(importRows).where(eq(importRows.batchId, batchId));
    await tx.update(importBatches).set({ status: "cancelled" }).where(eq(importBatches.id, batchId));
  });
}

/** Worker işi: 24 saatten eski, onaylanmamış aktarımların satırlarını siler ve aktarımı iptal eder. */
export async function cleanupStaleImports(actor: Actor): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_IMPORT_HOURS * 60 * 60 * 1000);
  const stale = await db()
    .select({ id: importBatches.id })
    .from(importBatches)
    .where(and(eq(importBatches.status, "validated"), lt(importBatches.createdAt, cutoff)));
  if (stale.length === 0) return 0;
  const ids = stale.map((s) => s.id);
  await withActor(actor, async (tx) => {
    await tx.delete(importRows).where(inArray(importRows.batchId, ids));
    await tx.update(importBatches).set({ status: "cancelled" }).where(inArray(importBatches.id, ids));
  });
  return ids.length;
}

/** Boş aktarım şablonu: başlıklar, açılır listeler (departman, yaka tipi) ve pozisyon listesi. */
export async function buildImportTemplate(actor: Actor): Promise<Buffer> {
  assertCan(actor, "people.manage");
  const lookup = await loadLookup();
  const departments = lookup.departments.filter((d) => d.isActive).sort((a, b) => a.name.localeCompare(b.name, "tr"));

  const wb = new ExcelJS.Workbook();
  wb.creator = "JAPAR Akademi";
  const sheet = wb.addWorksheet("Personel");
  const headers = Object.values(TEMPLATE_HEADERS);
  sheet.addRow(headers);
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  headers.forEach((h, i) => (sheet.getColumn(i + 1).width = Math.max(14, h.length + 4)));
  sheet.getColumn(1).numFmt = "@";
  sheet.getColumn(7).numFmt = "@";
  sheet.getColumn(5).numFmt = "dd.mm.yyyy";

  const lists = wb.addWorksheet("Listeler", { state: "hidden" });
  lists.getCell("A1").value = "Departman";
  departments.forEach((d, i) => (lists.getCell(`A${i + 2}`).value = d.name));
  const deptRange = `Listeler!$A$2:$A$${Math.max(2, departments.length + 1)}`;

  for (let r = 2; r <= 1001; r++) {
    sheet.getCell(`C${r}`).dataValidation = { type: "list", allowBlank: true, formulae: [deptRange] };
    sheet.getCell(`F${r}`).dataValidation = { type: "list", allowBlank: true, formulae: ['"Mavi,Beyaz"'] };
  }

  const info = wb.addWorksheet("Pozisyonlar");
  info.addRow(["Departman", "Pozisyon", "Pozisyon kodu", "Yaka tipi"]);
  info.getRow(1).font = { bold: true };
  for (const d of departments) {
    for (const p of (lookup.positionsByDepartment.get(d.id) ?? []).filter((p) => p.status === "active")) {
      info.addRow([d.name, p.name, p.code, p.collarType === "blue" ? "Mavi" : "Beyaz"]);
    }
  }
  [24, 32, 18, 12].forEach((w, i) => (info.getColumn(i + 1).width = w));

  return Buffer.from(await wb.xlsx.writeBuffer());
}
