"use server";

import { getLocale } from "next-intl/server";
import { refresh } from "next/cache";
import { z } from "zod";
import { actionUser, formText, runAction, type ActionResult } from "@/features/shared/action-result";
import { redirect } from "@/i18n/navigation";
import { OHS_TOPICS } from "@/lib/ohs";
import { saveQuizQuestions } from "@/server/services/quiz";
import {
  archiveModule,
  createModule,
  MODULE_KINDS,
  pickableContents,
  saveTasks,
  setModuleContents,
  updateModule,
} from "@/server/services/modules";

const uuid = z.uuid();
const optInt = (min: number, max: number) =>
  z.preprocess((v) => (v === null || v === "" ? null : Number(v)), z.number().int().min(min).max(max).nullable());

const baseSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().max(2000).nullable(),
  durationMin: z.coerce.number().int().min(1).max(100000),
  isOhs: z.boolean(),
  ohsTopic: z.enum(OHS_TOPICS).nullable(),
  remoteAllowed: z.boolean(),
  validityMonths: optInt(1, 240),
  commonTarget: z.enum(["all", "blue", "white"]).nullable(),
  commonSortOrder: optInt(0, 1000),
});

function readBase(formData: FormData) {
  return baseSchema.safeParse({
    title: formText(formData, "title") ?? "",
    description: formText(formData, "description"),
    durationMin: formText(formData, "durationMin"),
    isOhs: formData.get("isOhs") === "on",
    ohsTopic: formText(formData, "ohsTopic"),
    remoteAllowed: formData.get("remoteAllowed") === "on",
    validityMonths: formText(formData, "validityMonths"),
    commonTarget: formText(formData, "commonTarget"),
    commonSortOrder: formText(formData, "commonSortOrder"),
  });
}

export async function createModuleAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const base = readBase(formData);
  const kind = z.enum(MODULE_KINDS).safeParse(formText(formData, "kind"));
  const owner = z.union([z.literal("common"), z.uuid()]).safeParse(formText(formData, "owner"));
  if (!base.success || !kind.success || !owner.success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(() =>
    createModule(actor, { ...base.data, kind: kind.data, ownerOrgUnitId: owner.data === "common" ? null : owner.data }),
  );
  if (!result.ok) return result;
  return redirect({ href: `/manage/modules/${result.data.id}`, locale: await getLocale() });
}

export async function updateModuleAction(moduleId: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const base = readBase(formData);
  if (!uuid.safeParse(moduleId).success || !base.success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(() => updateModule(actor, moduleId, base.data));
  if (result.ok) refresh();
  return result;
}

export async function setModuleContentsAction(moduleId: string, contentIds: unknown): Promise<ActionResult> {
  const ids = z.array(uuid).max(100).safeParse(contentIds);
  if (!uuid.safeParse(moduleId).success || !ids.success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(() => setModuleContents(actor, moduleId, ids.data));
  if (result.ok) refresh();
  return result;
}

const taskSchema = z.array(
  z.object({
    id: uuid.optional(),
    title: z.string().max(200),
    description: z.string().max(2000).nullable(),
    isCritical: z.boolean(),
    competencyId: uuid.nullable().optional(),
  }),
).max(100);

export async function saveTasksAction(moduleId: string, tasks: unknown): Promise<ActionResult> {
  const parsed = taskSchema.safeParse(tasks);
  if (!uuid.safeParse(moduleId).success || !parsed.success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(() => saveTasks(actor, moduleId, parsed.data));
  if (result.ok) refresh();
  return result;
}

export async function archiveModuleAction(moduleId: string): Promise<ActionResult> {
  if (!uuid.safeParse(moduleId).success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(() => archiveModule(actor, moduleId));
  if (result.ok) refresh();
  return result;
}

const quizSchema = z
  .array(
    z.object({
      id: uuid.optional(),
      type: z.enum(["single_choice", "true_false"]),
      stem: z.string().max(1000),
      options: z.array(z.string().max(300)).max(6),
      correctIndex: z.number().int().min(0).max(5),
      explanation: z.string().max(2000).nullable(),
    }),
  )
  .max(5);

export async function saveQuizAction(moduleId: string, input: unknown): Promise<ActionResult> {
  const parsed = quizSchema.safeParse(input);
  if (!uuid.safeParse(moduleId).success || !parsed.success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(() => saveQuizQuestions(actor, moduleId, parsed.data));
  if (result.ok) refresh();
  return result;
}

/** İçerik seçici (modül içerikleri ve kart bağlantıları için). */
export async function searchContentsAction(q: string): Promise<ActionResult<{ id: string; title: string; type: string; ownerName: string | null }[]>> {
  const parsed = z.string().max(100).safeParse(q);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  return runAction(() => pickableContents(actor, parsed.data));
}
