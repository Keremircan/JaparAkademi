"use server";

import { getLocale } from "next-intl/server";
import { refresh } from "next/cache";
import { z } from "zod";
import { actionUser, formText, runAction, type ActionResult } from "@/features/shared/action-result";
import { redirect } from "@/i18n/navigation";
import {
  createOrgUnit,
  createPosition,
  setOrgUnitActive,
  setPositionStatus,
  updateOrgUnit,
  updatePosition,
} from "@/server/services/org";

const uuid = z.uuid();

const unitSchema = z.object({
  id: uuid.nullable(),
  kind: z.enum(["department", "section"]),
  parentId: uuid.nullable(),
  name: z.string().min(1).max(120),
  code: z.string().min(1).max(40),
});

export async function saveOrgUnitAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = unitSchema.safeParse({
    id: formText(formData, "id"),
    kind: formText(formData, "kind"),
    parentId: formText(formData, "parentId"),
    name: formText(formData, "name") ?? "",
    code: formText(formData, "code") ?? "",
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const { id, ...input } = parsed.data;
  const result = await runAction(async () => {
    if (id) await updateOrgUnit(actor, id, input);
    else await createOrgUnit(actor, input);
  });
  if (!result.ok) return result;
  return redirect({ href: "/admin/org", locale: await getLocale() });
}

export async function setOrgUnitActiveAction(id: string, active: boolean): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(() => setOrgUnitActive(actor, id, z.boolean().parse(active)));
  if (result.ok) refresh();
  return result;
}

const positionSchema = z.object({
  id: uuid.nullable(),
  orgUnitId: uuid,
  name: z.string().min(1).max(120),
  code: z.string().min(1).max(40),
  collarType: z.enum(["blue", "white"]),
  shiftPattern: z.string().max(120).nullable(),
  supervisorPositionId: uuid.nullable(),
  deputyPositionId: uuid.nullable(),
});

export async function savePositionAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = positionSchema.safeParse({
    id: formText(formData, "id"),
    orgUnitId: formText(formData, "orgUnitId"),
    name: formText(formData, "name") ?? "",
    code: formText(formData, "code") ?? "",
    collarType: formText(formData, "collarType"),
    shiftPattern: formText(formData, "shiftPattern"),
    supervisorPositionId: formText(formData, "supervisorPositionId"),
    deputyPositionId: formText(formData, "deputyPositionId"),
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const { id, ...input } = parsed.data;
  const result = await runAction(async () => {
    if (id) await updatePosition(actor, id, input);
    else await createPosition(actor, input);
  });
  if (!result.ok) return result;
  return redirect({ href: "/admin/org", locale: await getLocale() });
}

export async function setPositionStatusAction(id: string, status: "active" | "passive"): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(() => setPositionStatus(actor, id, z.enum(["active", "passive"]).parse(status)));
  if (result.ok) refresh();
  return result;
}
