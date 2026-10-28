"use server";

import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { z } from "zod";
import { actionUser, runAction, type ActionResult } from "@/features/shared/action-result";
import { env } from "@/server/env";
import { DEVICE_COOKIE, DEVICE_COOKIE_MAX_AGE, registerDevice, revokeDevice } from "@/server/services/devices";

/** Bu tarayıcıyı ortak cihaz olarak kaydeder: belirteç yalnızca bu tarayıcının çerezine yazılır. */
export async function registerThisDeviceAction(name: string, kind: "shared_pc" | "kiosk" = "shared_pc"): Promise<ActionResult> {
  if (!z.string().max(100).safeParse(name).success || !z.enum(["shared_pc", "kiosk"]).safeParse(kind).success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(() => registerDevice(actor, { name, kind }));
  if (!result.ok) return result;
  (await cookies()).set(DEVICE_COOKIE, result.data.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env().APP_URL.startsWith("https://"),
    path: "/",
    maxAge: DEVICE_COOKIE_MAX_AGE,
  });
  refresh();
  return { ok: true, data: undefined };
}

export async function revokeDeviceAction(id: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "invalid_input" };
  const { actor } = await actionUser();
  const result = await runAction(() => revokeDevice(actor, id));
  if (result.ok) refresh();
  return result;
}
