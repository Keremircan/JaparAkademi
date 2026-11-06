import { and, asc, count, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { systemActor } from "@/server/authz/actor";
import type { DbOrTx } from "@/server/db/client";
import { emailOutbox } from "@/server/db/schema";
import { withActor } from "@/server/db/with-actor";
import { logger } from "@/server/logger";
import { MailError, sendMail } from "@/server/mail";
import { formatMailError, LINK_EMAIL_KINDS, mailBudget, pickWithinBudget } from "@/server/state/mail";
import { nextAttemptDelayMs } from "@/server/state/notifications";
import { getSettings } from "../settings";
import { notify, usersWithRole } from "./index";

/**
 * E-posta kuyruğunu işler (worker, dakikada bir; karar #87). Satırlar kısa süreliğine kiralanır (SKIP LOCKED),
 * gönderim transaction dışında yapılır. Başarısız gönderim üstel beklemeyle yeniden denenir; deneme sınırı aşılınca
 * kalıcı hata olur ve sistem yöneticilerine uygulama içi alarm gider.
 *
 * Günlük sınır (iş paketi 3.7, karar #260): bugün gönderilenler `mail.daily_limit`'e ulaşınca kalanlar ertesi güne
 * bekler (hata değildir, alarm gitmez). Bağlantı e-postaları önce gider; bildirimler `mail.link_reserve` payını
 * kullanamaz. Sağlayıcı kota/hız sınırı bildirirse kuyruk bekletilir, deneme sayılmaz.
 */

const BATCH = 20;
const LEASE_MS = 10 * 60_000;
const QUOTA_PAUSE_MS = 60 * 60_000;
const RATE_PAUSE_MS = 60_000;

/** Bugün (UTC günü) gönderilen e-posta sayısı. Resend'in günlük kotası UTC gece yarısı sıfırlanır. */
export async function sentToday(tx: DbOrTx): Promise<number> {
  const [row] = await tx
    .select({ n: count() })
    .from(emailOutbox)
    .where(and(eq(emailOutbox.status, "sent"), gte(emailOutbox.sentAt, sql`date_trunc('day', now(), 'UTC')`)));
  return row?.n ?? 0;
}

/** Öncelik: şifre sıfırlama → ziyaretçi bağlantısı → hesap daveti → bildirimler. */
const priority = sql`case ${emailOutbox.kind} ${sql.join(
  LINK_EMAIL_KINDS.map((k, i) => sql`when ${k} then ${sql.raw(String(i))}`),
  sql` `,
)} else ${sql.raw(String(LINK_EMAIL_KINDS.length))} end`;

export async function dispatchEmails(): Promise<{ sent: number; failed: number; deferred: number }> {
  const actor = systemActor("worker:mail.dispatch");
  const s = await getSettings(["mail.max_attempts", "mail.daily_limit", "mail.link_reserve"]);
  const claimed = await withActor(actor, async (tx) => {
    const budget = mailBudget({ limit: s["mail.daily_limit"], reserve: s["mail.link_reserve"], sent: await sentToday(tx) });
    if (budget.links <= 0) return [];
    // Veritabanı saatiyle karşılaştırılır: satırlar now() ile yazılır, uygulama saati biraz geride olabilir
    const due = and(eq(emailOutbox.status, "pending"), lte(emailOutbox.nextAttemptAt, sql`now()`));
    const rows = await tx
      .select()
      .from(emailOutbox)
      .where(budget.others > 0 ? due : and(due, inArray(emailOutbox.kind, [...LINK_EMAIL_KINDS])))
      .orderBy(priority, asc(emailOutbox.nextAttemptAt))
      .limit(Math.min(BATCH, budget.links))
      .for("update", { skipLocked: true });
    const picked = pickWithinBudget(rows, budget);
    if (picked.length) {
      await tx
        .update(emailOutbox)
        .set({ nextAttemptAt: new Date(Date.now() + LEASE_MS) })
        .where(inArray(emailOutbox.id, picked.map((r) => r.id)));
    }
    return picked;
  });

  let sent = 0;
  let failed = 0;
  let deferred = 0;
  for (const [i, m] of claimed.entries()) {
    try {
      // Anahtar denemeye göre değişir: çökme sonrası aynı deneme yinelenirse sağlayıcı ikinci kez göndermez
      await sendMail({ to: m.toAddress, subject: m.subject, html: m.bodyHtml, text: m.bodyText, idempotencyKey: `outbox-${m.id}-${m.attempts}` });
      await withActor(actor, (tx) => tx.update(emailOutbox).set({ status: "sent", sentAt: new Date(), attempts: m.attempts + 1, lastError: null }).where(eq(emailOutbox.id, m.id)));
      sent++;
    } catch (err) {
      const problem = err instanceof MailError ? err.problem : "unknown";
      const message = formatMailError(problem, err instanceof Error ? err.message : "unknown");
      if (problem === "quota" || problem === "rate") {
        // Sağlayıcı sınırı: deneme sayılmaz, alarm gitmez; bu ve sıradaki e-postalar bekletilir
        const until = new Date(Date.now() + (problem === "quota" ? QUOTA_PAUSE_MS : RATE_PAUSE_MS));
        const rest = claimed.slice(i + 1).map((r) => r.id);
        await withActor(actor, async (tx) => {
          await tx.update(emailOutbox).set({ lastError: message, nextAttemptAt: until }).where(eq(emailOutbox.id, m.id));
          if (rest.length) await tx.update(emailOutbox).set({ nextAttemptAt: until }).where(inArray(emailOutbox.id, rest));
        });
        deferred += rest.length + 1;
        logger.warn({ problem, deferred: rest.length + 1 }, "E-posta sağlayıcı sınırı: kuyruk bekletiliyor");
        break;
      }
      const attempts = m.attempts + 1;
      const retryable = !(err instanceof MailError) || err.retryable;
      const final = !retryable || attempts >= s["mail.max_attempts"];
      logger.warn({ outboxId: m.id, attempts, final, problem }, "E-posta gönderilemedi");
      await withActor(actor, async (tx) => {
        await tx
          .update(emailOutbox)
          .set(final ? { status: "failed", attempts, lastError: message } : { attempts, lastError: message, nextAttemptAt: new Date(Date.now() + nextAttemptDelayMs(attempts)) })
          .where(eq(emailOutbox.id, m.id));
        // İş hatası alarmı (SPEC 11.1): sistem yöneticilerine tek, tazelenen bildirim; e-posta durumu ekranına götürür
        if (final) await notify(tx, { kind: "email_failed", userIds: await usersWithRole(tx, "sysadmin"), subjectKey: "email_failed", link: "/admin/email" });
      });
      if (final) failed++;
    }
  }
  return { sent, failed, deferred };
}
