"use server";

import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { refresh } from "next/cache";
import { z } from "zod";
import { actionUser, formText, runAction, type ActionResult } from "@/features/shared/action-result";
import { redirect } from "@/i18n/navigation";
import { renderCredentialSlips, type CredentialSlip } from "@/server/pdf/credentials";
import { cancelImport, commitImport, validateImport } from "@/server/services/imports";
import {
  createPerson,
  getPerson,
  resetPassword,
  revealNationalId,
  setPersonStatus,
  updatePerson,
} from "@/server/services/people";
import { setRoles, setSectionManagerScopes } from "@/server/services/roles";
import { ROLES } from "@/server/authz/roles";

const uuid = z.uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Geçici şifre fişlerini (PDF) base64 olarak üretir; sunucuda saklanmaz. */
async function slipsPdfBase64(slips: CredentialSlip[]): Promise<string> {
  const t = await getTranslations("admin.people.slip");
  const tApp = await getTranslations("app");
  const format = await getFormatter();
  const pdf = await renderCredentialSlips(slips, {
    appName: tApp("name"),
    title: t("title"),
    sicil: t("sicil"),
    position: t("position"),
    password: t("password"),
    instructions: t("instructions"),
    issuedAt: t("issuedAt", { date: format.dateTime(new Date(), { dateStyle: "short" }) }),
  });
  return pdf.toString("base64");
}

const personSchema = z.object({
  fullName: z.string().min(1).max(160),
  positionId: uuid.nullable(),
  nationalId: z.string().max(20).nullable(),
  phone: z.string().max(30).nullable(),
  email: z.string().max(200).nullable(),
  employmentType: z.enum(["employee", "intern"]),
  hireDate: isoDate.nullable(),
  trainingRequired: z.boolean(),
});

function readPerson(formData: FormData) {
  return personSchema.safeParse({
    fullName: formText(formData, "fullName") ?? "",
    positionId: formText(formData, "positionId"),
    nationalId: formText(formData, "nationalId"),
    phone: formText(formData, "phone"),
    email: formText(formData, "email"),
    employmentType: formText(formData, "employmentType") ?? "employee",
    hireDate: formText(formData, "hireDate"),
    trainingRequired: formData.get("trainingRequired") === "on",
  });
}

export type CreatedPerson = { userId: string; tempPassword: string; slipPdf: string };

export async function createPersonAction(
  _prev: ActionResult<CreatedPerson> | null,
  formData: FormData,
): Promise<ActionResult<CreatedPerson>> {
  const person = readPerson(formData);
  const sicilNo = z.string().min(1).max(32).safeParse(formText(formData, "sicilNo") ?? "");
  if (!person.success || !sicilNo.success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  return runAction(async () => {
    const { userId, tempPassword } = await createPerson(actor, { ...person.data, sicilNo: sicilNo.data });
    const slipPdf = await slipsPdfBase64([
      { sicilNo: sicilNo.data.trim(), fullName: person.data.fullName.trim(), positionName: "", tempPassword },
    ]);
    return { userId, tempPassword, slipPdf };
  });
}

export async function updatePersonAction(
  userId: string,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const person = readPerson(formData);
  if (!person.success || !uuid.safeParse(userId).success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(() => updatePerson(actor, userId, person.data));
  if (!result.ok) return result;
  return redirect({ href: `/admin/people/${userId}`, locale: await getLocale() });
}

export async function setPersonStatusAction(
  userId: string,
  status: "active" | "passive" | "terminated",
  endDate?: string | null,
): Promise<ActionResult> {
  const parsed = z
    .object({ userId: uuid, status: z.enum(["active", "passive", "terminated"]), endDate: isoDate.nullable() })
    .safeParse({ userId, status, endDate: endDate || null });
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(() => setPersonStatus(actor, parsed.data.userId, parsed.data));
  if (result.ok) refresh();
  return result;
}

export async function resetPasswordAction(userId: string): Promise<ActionResult<{ tempPassword: string; slipPdf: string }>> {
  if (!uuid.safeParse(userId).success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  return runAction(async () => {
    const { tempPassword } = await resetPassword(actor, userId);
    const person = await getPerson(actor, userId);
    const slipPdf = await slipsPdfBase64([{ sicilNo: person.sicilNo, fullName: person.fullName, positionName: "", tempPassword }]);
    return { tempPassword, slipPdf };
  });
}

export async function revealNationalIdAction(userId: string): Promise<ActionResult<string | null>> {
  if (!uuid.safeParse(userId).success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  return runAction(() => revealNationalId(actor, userId));
}

// ---- Roller ve kapsam (yalnızca sistem yöneticisi; yetki serviste) ----

export async function setRolesAction(userId: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const roles = z.array(z.enum(ROLES)).safeParse(formData.getAll("roles"));
  if (!roles.success || !uuid.safeParse(userId).success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(() => setRoles(actor, userId, roles.data));
  if (result.ok) refresh();
  return result;
}

export async function setScopesAction(userId: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const ids = z.array(uuid).safeParse(formData.getAll("orgUnitIds"));
  if (!ids.success || !uuid.safeParse(userId).success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(() => setSectionManagerScopes(actor, userId, ids.data));
  if (result.ok) refresh();
  return result;
}

// ---- Excel aktarımı ----

export async function uploadImportAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const file = formData.get("file");
  const mode = z.enum(["existing_staff", "new_hires"]).safeParse(formData.get("mode"));
  if (!(file instanceof File) || !mode.success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(async () =>
    validateImport(actor, { fileName: file.name, buffer: Buffer.from(await file.arrayBuffer()), mode: mode.data }),
  );
  if (!result.ok) return result;
  return redirect({ href: `/admin/people/import/${result.data.batchId}`, locale: await getLocale() });
}

export type CommitImportResult = { created: number; updated: number; unchanged: number; slipPdf: string | null };

export async function commitImportAction(batchId: string): Promise<ActionResult<CommitImportResult>> {
  if (!uuid.safeParse(batchId).success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  return runAction(async () => {
    const { credentials, ...counts } = await commitImport(actor, batchId);
    const slipPdf = credentials.length ? await slipsPdfBase64(credentials) : null;
    return { ...counts, slipPdf };
  });
}

export async function cancelImportAction(batchId: string): Promise<ActionResult> {
  if (!uuid.safeParse(batchId).success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(() => cancelImport(actor, batchId));
  if (result.ok) refresh();
  return result;
}
