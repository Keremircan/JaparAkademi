"use server";

import { refresh } from "next/cache";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { actionUser, runAction, type ActionResult } from "@/features/shared/action-result";
import { redirect } from "@/i18n/navigation";
import { scheduleInputSchema, scheduleItemsSchema } from "@/lib/schedules";
import {
  chooseWorkSchedule,
  deleteWorkSchedule,
  keepMyScheduleCopy,
  revertMyScheduleCopy,
  saveMyScheduleCopy,
  saveWorkSchedule,
} from "@/server/services/schedules";

/** Çalışma programı eylemleri (iş paketi 3.9, kararlar #251–257). */

const uuid = z.uuid();

/** İK: programı oluşturur ya da günceller; başarılıysa pozisyonun program listesine döner. */
export async function saveWorkScheduleAction(positionId: string, scheduleId: string | null, input: unknown): Promise<ActionResult> {
  const parsed = scheduleInputSchema.safeParse(input);
  if (!uuid.safeParse(positionId).success || (scheduleId !== null && !uuid.safeParse(scheduleId).success) || !parsed.success) {
    return { ok: false, error: "invalid_input" };
  }
  const { actor } = await actionUser();
  const result = await runAction(() => saveWorkSchedule(actor, positionId, scheduleId, parsed.data));
  if (!result.ok) return result;
  return redirect({ href: `/manage/schedules/${positionId}`, locale: await getLocale() });
}

/** İK: programı kaldırır (seçimler ve kişisel kopyalar da silinir). */
export async function deleteWorkScheduleAction(positionId: string, scheduleId: string): Promise<ActionResult> {
  if (!uuid.safeParse(positionId).success || !uuid.safeParse(scheduleId).success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(() => deleteWorkSchedule(actor, scheduleId));
  if (!result.ok) return result;
  return redirect({ href: `/manage/schedules/${positionId}`, locale: await getLocale() });
}

/** Personel: vardiya programını seçer. */
export async function chooseScheduleAction(scheduleId: string): Promise<ActionResult> {
  if (!uuid.safeParse(scheduleId).success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(() => chooseWorkSchedule(actor, scheduleId));
  if (result.ok) refresh();
  return result;
}

/** Personel: kendi programını kaydeder ve Programım'a döner. */
export async function saveMyScheduleAction(scheduleId: string, items: unknown): Promise<ActionResult> {
  const parsed = scheduleItemsSchema.safeParse(items);
  if (!uuid.safeParse(scheduleId).success || !parsed.success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(() => saveMyScheduleCopy(actor, scheduleId, parsed.data));
  if (!result.ok) return result;
  return redirect({ href: "/schedule", locale: await getLocale() });
}

/** Personel: "Pozisyon programına dön" ya da "Yeni programa geç". */
export async function revertMyScheduleAction(scheduleId: string): Promise<ActionResult> {
  if (!uuid.safeParse(scheduleId).success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(() => revertMyScheduleCopy(actor, scheduleId));
  if (result.ok) refresh();
  return result;
}

/** Personel: "Kendi programımı koru". */
export async function keepMyScheduleAction(scheduleId: string): Promise<ActionResult> {
  if (!uuid.safeParse(scheduleId).success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(() => keepMyScheduleCopy(actor, scheduleId));
  if (result.ok) refresh();
  return result;
}
