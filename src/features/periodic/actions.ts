"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { actionUser, runAction, type ActionResult } from "@/features/shared/action-result";
import {
  commitPriorImport,
  previewPriorImport,
  recordPriorTrainings,
  startPeriodicTraining,
  type PriorPreviewRow,
  type StartSkip,
} from "@/server/services/assignments/periodic";

/** Eski personelin periyodik eğitimleri (iş paketi 3.2, kararlar #222–225). */

const uuid = z.uuid();
const ids = z.array(uuid).min(1).max(500);

export async function recordPriorAction(input: unknown): Promise<ActionResult<{ saved: number; skipped: number }>> {
  const parsed = z
    .object({ userIds: ids, moduleId: uuid, completedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), note: z.string().max(500).nullable() })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(() => recordPriorTrainings(actor, parsed.data));
  if (result.ok) refresh();
  return result;
}

export async function startPeriodicAction(userIds: unknown): Promise<ActionResult<{ started: number; skipped: { userId: string; reason: StartSkip }[] }>> {
  const parsed = ids.safeParse(userIds);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(() => startPeriodicTraining(actor, parsed.data));
  if (result.ok) refresh();
  return result;
}

function fileOf(formData: FormData): File | null {
  const file = formData.get("file");
  return file instanceof File && file.size > 0 ? file : null;
}

export async function previewPriorImportAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ rows: PriorPreviewRow[]; missingColumns: string[]; tooManyRows: boolean }>> {
  const file = fileOf(formData);
  if (!file) return { ok: false, error: "file_empty" };
  const { actor } = await actionUser();
  const buffer = Buffer.from(await file.arrayBuffer());
  return runAction(() => previewPriorImport(actor, buffer));
}

export async function commitPriorImportAction(formData: FormData): Promise<ActionResult<{ saved: number; skipped: number }>> {
  const file = fileOf(formData);
  if (!file) return { ok: false, error: "file_empty" };
  const { actor } = await actionUser();
  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await runAction(() => commitPriorImport(actor, buffer));
  if (result.ok) refresh();
  return result;
}
