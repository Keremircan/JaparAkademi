"use server";

import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { refresh } from "next/cache";
import { z } from "zod";
import { actionUser, formText, runAction, type ActionResult } from "@/features/shared/action-result";
import { redirect } from "@/i18n/navigation";
import { renderActivationSheets } from "@/server/pdf/activation";
import { reinvite, type IssuedInvite } from "@/server/services/invitations";
import { INVITE_CHANNELS } from "@/server/state/invitations";
import { cancelImport, commitImport, validateImport } from "@/server/services/imports";
import {
  createPerson,
  revealNationalId,
  setPersonStatus,
  updatePerson,
} from "@/server/services/people";
import { setRoles, setSectionManagerScopes } from "@/server/services/roles";
import { ROLES } from "@/server/authz/roles";

const uuid = z.uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Etkinleştirme kağıtlarını (PDF) base64 olarak üretir; sunucuda saklanmaz. */
async function sheetsPdfBase64(invites: IssuedInvite[]): Promise<string> {
  const t = await getTranslations("invite.sheet");
  const tApp = await getTranslations("app");
  const format = await getFormatter();
  const pdf = await renderActivationSheets(
    invites.map((i) => ({
      sicilNo: i.sicilNo,
      fullName: i.fullName,
      positionName: i.positionName,
      url: i.url,
      code: i.code ?? "",
      expires: t("expires", { date: format.dateTime(i.expiresAt, { dateStyle: "short", timeStyle: "short" }) }),
    })),
    {
      appName: tApp("name"),
      title: t("title"),
      sicil: t("sicil"),
      position: t("position"),
      code: t("code"),
      steps: t("steps"),
      note: t("note"),
    },
  );
  return pdf.toString("base64");
}

/** İstemciye dönen davet bilgisi. E-posta kanalında bağlantı dönmez (yalnızca kişiye gider). */
export type InviteResult = {
  userId: string;
  sicilNo: string;
  channel: IssuedInvite["channel"];
  expiresAt: string;
  whatsappUrl: string | null;
  link: string | null;
  code: string | null;
  sheetPdf: string | null;
};

async function toResult(invite: IssuedInvite): Promise<InviteResult> {
  return {
    userId: invite.userId,
    sicilNo: invite.sicilNo,
    channel: invite.channel,
    expiresAt: invite.expiresAt.toISOString(),
    whatsappUrl: invite.whatsappUrl,
    link: invite.channel === "email" ? null : invite.url,
    code: invite.code,
    sheetPdf: invite.channel === "print" ? await sheetsPdfBase64([invite]) : null,
  };
}

const channelSchema = z.enum(INVITE_CHANNELS);

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

export async function createPersonAction(
  _prev: ActionResult<InviteResult> | null,
  formData: FormData,
): Promise<ActionResult<InviteResult>> {
  const person = readPerson(formData);
  const sicilNo = z.string().min(1).max(32).safeParse(formText(formData, "sicilNo") ?? "");
  const channel = channelSchema.safeParse(formText(formData, "channel"));
  if (!person.success || !sicilNo.success || !channel.success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  return runAction(async () => toResult(await createPerson(actor, { ...person.data, sicilNo: sicilNo.data, channel: channel.data })));
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

/** Yeniden davet (şifre sıfırlamanın yerini alır, karar #185). */
export async function reinviteAction(userId: string, _prev: ActionResult<InviteResult> | null, formData: FormData): Promise<ActionResult<InviteResult>> {
  const channel = channelSchema.safeParse(formText(formData, "channel"));
  if (!uuid.safeParse(userId).success || !channel.success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(async () => toResult(await reinvite(actor, userId, channel.data)));
  if (result.ok) refresh();
  return result;
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

export type CommitImportResult = { created: number; updated: number; unchanged: number; sheetPdf: string | null };

export async function commitImportAction(batchId: string): Promise<ActionResult<CommitImportResult>> {
  if (!uuid.safeParse(batchId).success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  return runAction(async () => {
    const { invites, ...counts } = await commitImport(actor, batchId);
    const sheetPdf = invites.length ? await sheetsPdfBase64(invites) : null;
    return { ...counts, sheetPdf };
  });
}

export async function cancelImportAction(batchId: string): Promise<ActionResult> {
  if (!uuid.safeParse(batchId).success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(() => cancelImport(actor, batchId));
  if (result.ok) refresh();
  return result;
}
