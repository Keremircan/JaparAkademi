import { createTranslator } from "next-intl";
import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
import webpush from "web-push";
import { systemActor } from "@/server/authz/actor";
import { db } from "@/server/db/client";
import { notifications, pushOutbox, pushSubscriptions } from "@/server/db/schema";
import { withActor } from "@/server/db/with-actor";
import { env } from "@/server/env";
import { logger } from "@/server/logger";
import { nextAttemptDelayMs } from "@/server/state/notifications";
import { classifyPushStatus, isAllowedPushEndpoint, outboxResult, pushPayload, type PushOutcome } from "@/server/state/push";
import messages from "../../../../messages/tr.json";
import { getSettings } from "../settings";

/**
 * Push kuyruğunu işler (worker, dakikada bir; karar #179). E-posta kuyruğuyla aynı düzen: satırlar kısa süreliğine
 * kiralanır, gönderim transaction dışında yapılır. Gönderim anında okunmuş bildirime push gitmez. Push servisi
 * aboneliğin artık olmadığını söylerse (404/410) abonelik silinir.
 */

const BATCH = 50;
const LEASE_MS = 5 * 60_000;

export type PushTarget = { endpoint: string; keys: { p256dh: string; auth: string } };
/** Gönderici: push servisinin HTTP durum kodu, ağ hatasında null. Testler sahte gönderici verir. */
export type PushSender = (target: PushTarget, payload: string, ttlSeconds: number) => Promise<number | null>;

let vapidReady = false;

export const sendWebPush: PushSender = async (target, payload, ttlSeconds) => {
  const e = env();
  if (e.PUSH_TRANSPORT === "log") {
    // Adres ve içerik loga yazılmaz; yalnızca gönderim olduğu
    logger.info("Push (log sürücüsü, gönderilmedi)");
    return 201;
  }
  if (!vapidReady) {
    webpush.setVapidDetails(e.VAPID_SUBJECT!, e.VAPID_PUBLIC_KEY!, e.VAPID_PRIVATE_KEY!);
    vapidReady = true;
  }
  try {
    const res = await webpush.sendNotification(target, payload, { TTL: ttlSeconds, urgency: "normal", timeout: 15_000 });
    return res.statusCode;
  } catch (err) {
    if (err instanceof webpush.WebPushError) return err.statusCode;
    return null;
  }
};

export async function dispatchPush(send: PushSender = sendWebPush): Promise<{ sent: number; skipped: number; failed: number }> {
  const actor = systemActor("worker:push.dispatch");
  const { "push.max_attempts": maxAttempts, "push.ttl_hours": ttlHours } = await getSettings(["push.max_attempts", "push.ttl_hours"]);
  const claimed = await withActor(actor, async (tx) => {
    const rows = await tx
      .select({ id: pushOutbox.id, notificationId: pushOutbox.notificationId, userId: pushOutbox.userId, attempts: pushOutbox.attempts })
      .from(pushOutbox)
      .where(and(eq(pushOutbox.status, "pending"), lte(pushOutbox.nextAttemptAt, sql`now()`)))
      .orderBy(asc(pushOutbox.nextAttemptAt))
      .limit(BATCH)
      .for("update", { skipLocked: true });
    if (rows.length) {
      await tx
        .update(pushOutbox)
        .set({ nextAttemptAt: new Date(Date.now() + LEASE_MS) })
        .where(inArray(pushOutbox.id, rows.map((r) => r.id)));
    }
    return rows;
  });
  if (claimed.length === 0) return { sent: 0, skipped: 0, failed: 0 };

  const t = createTranslator({ locale: "tr", messages, namespace: "notifications.push" });
  const text = { title: t("title"), body: t("body") };
  const ttlSeconds = ttlHours * 3600;
  const counts = { sent: 0, skipped: 0, failed: 0 };

  for (const row of claimed) {
    const [n] = await db().select({ readAt: notifications.readAt }).from(notifications).where(eq(notifications.id, row.notificationId)).limit(1);
    const subs = n && !n.readAt ? await db().select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, row.userId)) : [];
    const outcomes: PushOutcome[] = [];
    const ok: string[] = [];
    const gone: string[] = [];
    const failing: string[] = [];
    for (const s of subs) {
      const outcome = isAllowedPushEndpoint(s.endpoint)
        ? classifyPushStatus(await send({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, pushPayload(row.notificationId, text), ttlSeconds))
        : "gone";
      outcomes.push(outcome);
      (outcome === "ok" ? ok : outcome === "gone" ? gone : failing).push(s.id);
    }
    const attempts = row.attempts + 1;
    const result = outboxResult(outcomes, attempts, maxAttempts);
    await withActor(actor, async (tx) => {
      if (ok.length) await tx.update(pushSubscriptions).set({ lastSuccessAt: new Date(), failureCount: 0 }).where(inArray(pushSubscriptions.id, ok));
      if (gone.length) await tx.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, gone));
      if (failing.length) {
        await tx
          .update(pushSubscriptions)
          .set({ failureCount: sql`${pushSubscriptions.failureCount} + 1` })
          .where(inArray(pushSubscriptions.id, failing));
      }
      await tx
        .update(pushOutbox)
        .set(
          result === "retry"
            ? { attempts, lastError: "retry", nextAttemptAt: new Date(Date.now() + nextAttemptDelayMs(attempts)) }
            : { status: result === "sent" ? "sent" : result === "skipped" ? "skipped" : "failed", attempts, sentAt: result === "sent" ? new Date() : null, lastError: result === "failed" ? "failed" : null },
        )
        .where(eq(pushOutbox.id, row.id));
    });
    if (result === "sent") counts.sent++;
    else if (result === "skipped") counts.skipped++;
    else if (result === "failed") {
      counts.failed++;
      logger.warn({ outboxId: row.id, attempts }, "Push gönderilemedi");
    }
  }
  return counts;
}
