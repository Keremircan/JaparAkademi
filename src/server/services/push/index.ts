import { and, eq, inArray } from "drizzle-orm";
import type { Actor } from "@/server/authz/actor";
import { assertUser } from "@/server/authz/policy";
import { db, type Tx } from "@/server/db/client";
import { personnel, pushOutbox, pushSubscriptions } from "@/server/db/schema";
import { withActor } from "@/server/db/with-actor";
import { env } from "@/server/env";
import { ValidationError } from "@/server/errors";
import { isAllowedPushEndpoint, shortUserAgent } from "@/server/state/push";
import type { NotificationKind } from "@/server/state/notifications";
import { getSettings } from "../settings";
import { toActor, type SessionUser } from "../auth";

/**
 * Web push abonelikleri (SPEC 10.2, iş paketi 2.6, kararlar #175–184).
 *  - Tercih cihaz bazındadır: abonelik varsa bu cihaza push gider (karar #177).
 *  - Abonelik oturuma bağlıdır; çıkışta ve oturum bitince silinir. Ortak cihazda açılamaz (karar #178).
 *  - Aynı tarayıcıda başka biri abone olursa adres yeni kişiye geçer (önceki kişiye artık gitmez).
 */

export type PushSubscriptionInput = { endpoint: string; keys: { p256dh: string; auth: string } };

/** Push bu sunucuda açık mı (VAPID genel anahtarı tanımlı). Tarayıcıya yalnızca genel anahtar verilir. */
export function pushPublicKey(): string | null {
  return env().VAPID_PUBLIC_KEY ?? null;
}

/** Bu tarayıcının aboneliği bu kişiye mi kayıtlı (profildeki aç/kapat durumu). */
export async function isSubscribed(actor: Actor, endpoint: string): Promise<boolean> {
  assertUser(actor);
  const [row] = await db()
    .select({ id: pushSubscriptions.id })
    .from(pushSubscriptions)
    .where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.userId, actor.userId)))
    .limit(1);
  return !!row;
}

export async function subscribePush(user: SessionUser, input: PushSubscriptionInput, userAgent: string | null): Promise<void> {
  if (user.sharedDevice) throw new ValidationError("shared_device");
  if (!pushPublicKey()) throw new ValidationError("push_unavailable");
  if (!isAllowedPushEndpoint(input.endpoint)) throw new ValidationError("push_endpoint");
  const actor = toActor(user);
  await withActor(actor, async (tx) => {
    // Adres tekil: aynı tarayıcının önceki kaydı (başka bir kişi ya da oturum) yerini yeni kayda bırakır
    await tx.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, input.endpoint));
    await tx.insert(pushSubscriptions).values({
      userId: user.userId,
      sessionId: user.sessionId,
      endpoint: input.endpoint,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      userAgent: shortUserAgent(userAgent),
    });
  });
}

export async function unsubscribePush(actor: Actor, endpoint: string): Promise<void> {
  assertUser(actor);
  await withActor(actor, async (tx) => {
    await tx.delete(pushSubscriptions).where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.userId, actor.userId)));
  });
}

/**
 * Yeni bildirimler için push kuyruğu (notify ile aynı transaction'da). Yalnızca `notify.push_events` türlerinde,
 * aktif personelin aboneliği varsa yazılır (karar #179, #182).
 */
export async function queuePush(tx: Tx, kind: NotificationKind, rows: readonly { notificationId: string; userId: string }[]): Promise<void> {
  if (rows.length === 0) return;
  const { "notify.push_events": events } = await getSettings(["notify.push_events"], tx);
  if (!events.includes(kind)) return;
  const subscribed = new Set(
    (
      await tx
        .selectDistinct({ userId: pushSubscriptions.userId })
        .from(pushSubscriptions)
        .innerJoin(personnel, and(eq(personnel.userId, pushSubscriptions.userId), eq(personnel.status, "active")))
        .where(inArray(pushSubscriptions.userId, rows.map((r) => r.userId)))
    ).map((r) => r.userId),
  );
  const queued = rows.filter((r) => subscribed.has(r.userId));
  if (queued.length) await tx.insert(pushOutbox).values(queued.map((r) => ({ notificationId: r.notificationId, userId: r.userId })));
}
