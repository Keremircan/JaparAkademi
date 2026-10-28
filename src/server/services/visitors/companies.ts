import { and, asc, eq, isNull } from "drizzle-orm";
import type { Actor } from "@/server/authz/actor";
import { assertCan, assertUser } from "@/server/authz/policy";
import { db } from "@/server/db/client";
import { contractorCompanies, visitors } from "@/server/db/schema";
import { withActor } from "@/server/db/with-actor";
import { NotFoundError, ValidationError } from "@/server/errors";
import { cleanContact } from "./identity";

/** Taşeron firma kartı (FG-8.3): İSG uzmanı ve güvenlik yönetir (karar #128). */
export type CompanyInput = {
  name: string;
  taxNo?: string | null;
  responsibleName?: string | null;
  phone?: string | null;
  email?: string | null;
  contractEnd?: string | null;
};

export type Company = typeof contractorCompanies.$inferSelect;

function clean(input: CompanyInput) {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 200) throw new ValidationError("invalid_name");
  const taxNo = input.taxNo?.replace(/\s/g, "") || null;
  if (taxNo && !/^\d{10,11}$/.test(taxNo)) throw new ValidationError("tax_no_invalid");
  const contractEnd = input.contractEnd || null;
  if (contractEnd && !/^\d{4}-\d{2}-\d{2}$/.test(contractEnd)) throw new ValidationError("invalid_date");
  return { name, taxNo, responsibleName: input.responsibleName?.trim() || null, contractEnd, ...cleanContact(input) };
}

/** Vergi no tekrarını kullanıcıya anlamlı hatayla bildirir. */
async function assertTaxNoFree(taxNo: string | null, exceptId?: string) {
  if (!taxNo) return;
  const [row] = await db().select({ id: contractorCompanies.id }).from(contractorCompanies).where(eq(contractorCompanies.taxNo, taxNo)).limit(1);
  if (row && row.id !== exceptId) throw new ValidationError("tax_no_taken");
}

export async function listCompanies(actor: Actor, opts: { includeArchived?: boolean } = {}) {
  assertCan(actor, "contractors.manage");
  return db()
    .select()
    .from(contractorCompanies)
    .where(opts.includeArchived ? undefined : isNull(contractorCompanies.archivedAt))
    .orderBy(asc(contractorCompanies.name));
}

/** Ön kayıt formundaki firma seçimi: her personel etkin firmaların adını görebilir. */
export async function companyOptions(actor: Actor): Promise<{ id: string; name: string }[]> {
  assertUser(actor);
  return db()
    .select({ id: contractorCompanies.id, name: contractorCompanies.name })
    .from(contractorCompanies)
    .where(isNull(contractorCompanies.archivedAt))
    .orderBy(asc(contractorCompanies.name));
}

export async function getCompany(actor: Actor, id: string) {
  assertCan(actor, "contractors.manage");
  const [row] = await db().select().from(contractorCompanies).where(eq(contractorCompanies.id, id)).limit(1);
  if (!row) throw new NotFoundError("contractor_company");
  const workers = await db()
    .select({ id: visitors.id, fullName: visitors.fullName, nationalIdMasked: visitors.nationalIdMasked })
    .from(visitors)
    .where(and(eq(visitors.contractorCompanyId, id), isNull(visitors.anonymizedAt)))
    .orderBy(asc(visitors.fullName));
  return { ...row, workers };
}

export async function createCompany(actor: Actor, input: CompanyInput): Promise<{ id: string }> {
  assertCan(actor, "contractors.manage");
  assertUser(actor);
  const values = clean(input);
  await assertTaxNoFree(values.taxNo);
  const [row] = await withActor(actor, (tx) =>
    tx
      .insert(contractorCompanies)
      .values({ ...values, createdBy: actor.userId })
      .returning({ id: contractorCompanies.id }),
  );
  return { id: row!.id };
}

export async function updateCompany(actor: Actor, id: string, input: CompanyInput): Promise<void> {
  assertCan(actor, "contractors.manage");
  const values = clean(input);
  await getCompany(actor, id);
  await assertTaxNoFree(values.taxNo, id);
  await withActor(actor, (tx) => tx.update(contractorCompanies).set(values).where(eq(contractorCompanies.id, id)));
}

/** Silme yok; arşivlenen firma yeni ön kayıtta seçilemez. */
export async function setCompanyArchived(actor: Actor, id: string, archived: boolean): Promise<void> {
  assertCan(actor, "contractors.manage");
  await getCompany(actor, id);
  await withActor(actor, (tx) =>
    tx
      .update(contractorCompanies)
      .set({ archivedAt: archived ? new Date() : null })
      .where(eq(contractorCompanies.id, id)),
  );
}

/** Ziyaretçinin kendi kaydı formu (hesapsız): etkin firmaların yalnızca adı (karar #139). */
export async function publicCompanyOptions(): Promise<{ id: string; name: string }[]> {
  return db()
    .select({ id: contractorCompanies.id, name: contractorCompanies.name })
    .from(contractorCompanies)
    .where(isNull(contractorCompanies.archivedAt))
    .orderBy(asc(contractorCompanies.name));
}
