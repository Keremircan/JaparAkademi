"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { actionUser, runAction, type ActionResult } from "@/features/shared/action-result";
import {
  addToBlacklist,
  cancelVisit,
  createBriefingDraft,
  createCompany,
  createVisit,
  discardBriefingDraft,
  liftBlacklist,
  publishBriefing,
  saveBriefingDraft,
  setCompanyArchived,
  updateCompany,
  updateVisit,
  briefingDraftSchema,
  resendVisitLink,
} from "@/server/services/visitors";

const uuid = z.uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const optText = (max: number) => z.string().max(max).nullable().optional();
const visitorType = z.enum(["office", "site", "contractor"]);
const idSchema = z
  .object({ idKind: z.enum(["tc", "passport"]), idNumber: z.string().min(1).max(30), idCountry: optText(2) })
  .nullable()
  .optional();

const visitSchema = z.object({
  visitorType,
  plannedDate: date,
  fullName: z.string().min(1).max(200),
  companyName: optText(200),
  contractorCompanyId: uuid.nullable().optional(),
  phone: optText(30),
  email: optText(200),
  note: optText(500),
  hostSicilNo: optText(30),
  id: idSchema,
});

export async function createVisitAction(input: z.infer<typeof visitSchema>): Promise<ActionResult<{ id: string }>> {
  const parsed = visitSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  return runAction(() => createVisit(actor, parsed.data));
}

export async function updateVisitAction(id: string, input: z.infer<typeof visitSchema>): Promise<ActionResult> {
  const parsed = visitSchema.omit({ hostSicilNo: true }).safeParse(input);
  if (!parsed.success || !uuid.safeParse(id).success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(() => updateVisit(actor, id, parsed.data));
  if (result.ok) refresh();
  return result;
}

export async function resendVisitLinkAction(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  return runAction(() => resendVisitLink(actor, id));
}

export async function cancelVisitAction(id: string, reason: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success || !z.string().max(500).safeParse(reason).success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(() => cancelVisit(actor, id, reason));
  if (result.ok) refresh();
  return result;
}

// ---- Taşeron firmalar ----

const companySchema = z.object({
  name: z.string().min(1).max(200),
  taxNo: optText(20),
  responsibleName: optText(200),
  phone: optText(30),
  email: optText(200),
  contractEnd: date.nullable().optional(),
});

export async function saveCompanyAction(id: string | null, input: z.infer<typeof companySchema>): Promise<ActionResult<{ id: string }>> {
  const parsed = companySchema.safeParse(input);
  if (!parsed.success || (id && !uuid.safeParse(id).success)) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(async () => {
    if (id) {
      await updateCompany(actor, id, parsed.data);
      return { id };
    }
    return createCompany(actor, parsed.data);
  });
  if (result.ok) refresh();
  return result;
}

export async function setCompanyArchivedAction(id: string, archived: boolean): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(() => setCompanyArchived(actor, id, archived));
  if (result.ok) refresh();
  return result;
}

// ---- Kara liste ----

const blacklistSchema = z.object({
  fullName: z.string().min(1).max(200),
  idKind: z.enum(["tc", "passport"]),
  idNumber: z.string().min(1).max(30),
  idCountry: optText(2),
  reason: z.string().min(1).max(1000),
  endsAt: date.nullable().optional(),
});

export async function addToBlacklistAction(input: z.infer<typeof blacklistSchema>): Promise<ActionResult> {
  const parsed = blacklistSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(async () => {
    await addToBlacklist(actor, parsed.data);
  });
  if (result.ok) refresh();
  return result;
}

export async function liftBlacklistAction(id: string, reason: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success || !z.string().max(1000).safeParse(reason).success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(() => liftBlacklist(actor, id, reason));
  if (result.ok) refresh();
  return result;
}

// ---- Bilgilendirme paketleri ----

export async function createBriefingDraftAction(type: string): Promise<ActionResult<{ id: string }>> {
  const parsed = visitorType.safeParse(type);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  return runAction(() => createBriefingDraft(actor, parsed.data));
}

export async function saveBriefingDraftAction(id: string, input: unknown): Promise<ActionResult> {
  const parsed = briefingDraftSchema.safeParse(input);
  if (!parsed.success || !uuid.safeParse(id).success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  return runAction(() => saveBriefingDraft(actor, id, parsed.data));
}

export async function publishBriefingAction(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(() => publishBriefing(actor, id));
  if (result.ok) refresh();
  return result;
}

export async function discardBriefingDraftAction(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(() => discardBriefingDraft(actor, id));
  if (result.ok) refresh();
  return result;
}
