import { and, asc, eq, inArray, lte } from "drizzle-orm";
import { systemActor } from "@/server/authz/actor";
import { emailOutbox } from "@/server/db/schema";
import { withActor } from "@/server/db/with-actor";
import { logger } from "@/server/logger";
import { MailError, sendMail } from "@/server/mail";
import { nextAttemptDelayMs } from "@/server/state/notifications";
import { getSettings } from "../settings";
import { notify, usersWithRole } from "./index";

/**
 * E-posta kuyruğunu işler (worker, dakikada bir; karar #87). Satırlar kısa süreliğine kiralanır (SKIP LOCKED),
 * gönderim transaction dışında yapılır. Başarısız gönderim üstel beklemeyle yeniden denenir; deneme sınırı aşılınca
 * kalıcı hata olur ve sistem yöneticilerine uygulama içi alarm gider.
 */

const BATCH = 20;
const LEASE_MS = 10 * 60_000;

export async function dispatchEmails(): Promise<{ sent: number; failed: number }> {
  const actor = systemActor("worker:mail.dispatch");
  const { "mail.max_attempts": maxAttempts } = await getSettings(["mail.max_attempts"]);
  const claimed = await withActor(actor, async (tx) => {
    const rows = await tx
      .select()
      .from(emailOutbox)
      .where(and(eq(emailOutbox.status, "pending"), lte(emailOutbox.nextAttemptAt, new Date())))
      .orderBy(asc(emailOutbox.nextAttemptAt))
      .limit(BATCH)
      .for("update", { skipLocked: true });
    if (rows.length) {
      await tx
        .update(emailOutbox)
        .set({ nextAttemptAt: new Date(Date.now() + LEASE_MS) })
        .where(inArray(emailOutbox.id, rows.map((r) => r.id)));
    }
    return rows;
  });

  let sent = 0;
  let failed = 0;
  for (const m of claimed) {
    try {
      await sendMail({ to: m.toAddress, subject: m.subject, html: m.bodyHtml, text: m.bodyText });
      await withActor(actor, (tx) => tx.update(emailOutbox).set({ status: "sent", sentAt: new Date(), attempts: m.attempts + 1, lastError: null }).where(eq(emailOutbox.id, m.id)));
      sent++;
    } catch (err) {
      const attempts = m.attempts + 1;
      const retryable = !(err instanceof MailError) || err.retryable;
      const final = !retryable || attempts >= maxAttempts;
      const message = err instanceof Error ? err.message.slice(0, 500) : "unknown";
      logger.warn({ outboxId: m.id, attempts, final }, "E-posta gönderilemedi");
      await withActor(actor, async (tx) => {
        await tx
          .update(emailOutbox)
          .set(final ? { status: "failed", attempts, lastError: message } : { attempts, lastError: message, nextAttemptAt: new Date(Date.now() + nextAttemptDelayMs(attempts)) })
          .where(eq(emailOutbox.id, m.id));
        // İş hatası alarmı (SPEC 11.1): sistem yöneticilerine tek, tazelenen bildirim
        if (final) await notify(tx, { kind: "email_failed", userIds: await usersWithRole(tx, "sysadmin"), subjectKey: "email_failed", link: "/admin" });
      });
      if (final) failed++;
    }
  }
  return { sent, failed };
}
