"use server";

import { getLocale } from "next-intl/server";
import { refresh } from "next/cache";
import { z } from "zod";
import { actionUser, runAction, type ActionResult } from "@/features/shared/action-result";
import { redirect } from "@/i18n/navigation";
import {
  approveClassroomSession,
  createClassroomSession,
  rejectClassroomSession,
  searchPeople,
  submitClassroomSession,
  updateClassroomSession,
} from "@/server/services/classroom";

const uuid = z.uuid();
const schema = z.object({
  moduleId: uuid,
  trainerUserId: uuid,
  sessionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  durationMin: z.number().int().min(1).max(1440),
  location: z.string().max(200),
  notes: z.string().max(2000).nullable(),
  scannedFormAssetId: uuid.nullable(),
  attendeeIds: z.array(uuid).max(500),
});

export async function saveClassroomAction(id: string | null, input: unknown): Promise<ActionResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success || (id && !uuid.safeParse(id).success)) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(async () => (id ? (await updateClassroomSession(actor, id, parsed.data), id) : (await createClassroomSession(actor, parsed.data)).id));
  if (!result.ok) return result;
  return redirect({ href: `/manage/classroom/${result.data}`, locale: await getLocale() });
}

export async function submitClassroomAction(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(() => submitClassroomSession(actor, id));
  if (result.ok) refresh();
  return result;
}

/** Onay paneli not alanını da gönderir; sınıf eğitimi onayında not saklanmaz. */
export async function approveClassroomAction(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(() => approveClassroomSession(actor, id));
  if (result.ok) refresh();
  return result.ok ? { ok: true, data: undefined } : result;
}

export async function rejectClassroomAction(id: string, comment: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success || !z.string().max(2000).safeParse(comment).success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(() => rejectClassroomSession(actor, id, comment));
  if (result.ok) refresh();
  return result;
}

export async function searchPeopleAction(q: string): Promise<ActionResult<{ userId: string; name: string; sicilNo: string }[]>> {
  if (!z.string().max(100).safeParse(q).success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  return runAction(() => searchPeople(actor, q));
}
