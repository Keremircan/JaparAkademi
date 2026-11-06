import { randomUUID } from "node:crypto";
import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import { createTranslator } from "next-intl";
import { toAppLocale } from "@/lib/locale";
import type { Actor } from "@/server/authz/actor";
import { assertCan, assertUser } from "@/server/authz/policy";
import { db } from "@/server/db/client";
import { emailOutbox, personnel } from "@/server/db/schema";
import { withActor } from "@/server/db/with-actor";
import { env } from "@/server/env";
import { ValidationError } from "@/server/errors";
import { messagesFor } from "@/server/i18n/messages";
import { logger } from "@/server/logger";
import { MailError, mailEnabled, mailSender, mailTransport, sendMail, type MailTransport } from "@/server/mail";
import { formatMailError, isLinkEmail, maskEmail, nextDailyReset, parseMailError, type MailProblem } from "@/server/state/mail";
import { emailHtml } from "@/server/state/notifications";
import { sentToday } from "./notifications/dispatch";
import { getSettings } from "./settings";

/**
 * E-posta durumu ekranı (iş paketi 3.7, karar #261): sağlayıcı, gönderen, bugünkü sayaç, son 7 gün ve son hatalar;
 * "Deneme e-postası gönder" sonucu hemen gösterilir. Adresler maskelenir; yalnızca sistem yöneticisi (ve owner).
 */

/** Ekrandaki e-posta türü grubu: bağlantı türleri tek tek, bildirimler tek grup. */
export type MailKindGroup = "password_reset" | "visitor_link" | "account_invite" | "mail_test" | "notification";

function kindGroup(kind: string): MailKindGroup {
  if (kind === "mail_test") return "mail_test";
  return isLinkEmail(kind) ? (kind as MailKindGroup) : "notification";
}

export type MailFailure = { id: string; kind: MailKindGroup; to: string; problem: MailProblem; detail: string; at: Date };

export type MailStatus = {
  transport: MailTransport;
  enabled: boolean;
  sender: string | null;
  /** 0 = sınırsız */
  limit: number;
  reserve: number;
  sentToday: number;
  resetsAt: Date;
  pending: number;
  /** Bekleyenlerden en son hata alan (kota/hız sınırıyla bekletilenler dahil) */
  pendingProblem: { problem: MailProblem; detail: string; at: Date } | null;
  week: { sent: number; failed: number };
  failures: MailFailure[];
  /** Deneme e-postası için önerilen alıcı (kişinin kendi adresi) */
  myEmail: string | null;
};

const WEEK = sql`now() - interval '7 days'`;

export async function mailStatus(actor: Actor): Promise<MailStatus> {
  assertCan(actor, "mail.manage");
  const conn = db();
  const s = await getSettings(["mail.daily_limit", "mail.link_reserve"]);
  const [today, [pending], [weekSent], [weekFailed], failures, [pendingError], me] = await Promise.all([
    sentToday(conn),
    conn.select({ n: count() }).from(emailOutbox).where(eq(emailOutbox.status, "pending")),
    conn.select({ n: count() }).from(emailOutbox).where(and(eq(emailOutbox.status, "sent"), gte(emailOutbox.sentAt, WEEK))),
    conn.select({ n: count() }).from(emailOutbox).where(and(eq(emailOutbox.status, "failed"), gte(emailOutbox.updatedAt, WEEK))),
    conn
      .select({ id: emailOutbox.id, kind: emailOutbox.kind, to: emailOutbox.toAddress, lastError: emailOutbox.lastError, at: emailOutbox.updatedAt })
      .from(emailOutbox)
      .where(and(eq(emailOutbox.status, "failed"), gte(emailOutbox.updatedAt, WEEK)))
      .orderBy(desc(emailOutbox.updatedAt))
      .limit(10),
    conn
      .select({ lastError: emailOutbox.lastError, at: emailOutbox.updatedAt })
      .from(emailOutbox)
      .where(and(eq(emailOutbox.status, "pending"), sql`${emailOutbox.lastError} is not null`))
      .orderBy(desc(emailOutbox.updatedAt))
      .limit(1),
    actor.kind === "user"
      ? conn.select({ email: personnel.email }).from(personnel).where(eq(personnel.userId, actor.userId)).limit(1)
      : Promise.resolve([]),
  ]);
  const pendingParsed = parseMailError(pendingError?.lastError ?? null);
  return {
    transport: mailTransport(),
    enabled: mailEnabled(),
    sender: mailSender(),
    limit: s["mail.daily_limit"],
    reserve: s["mail.link_reserve"],
    sentToday: today,
    resetsAt: nextDailyReset(new Date()),
    pending: pending?.n ?? 0,
    pendingProblem: pendingParsed && pendingError ? { ...pendingParsed, at: pendingError.at } : null,
    week: { sent: weekSent?.n ?? 0, failed: weekFailed?.n ?? 0 },
    failures: failures.map((f) => {
      const parsed = parseMailError(f.lastError) ?? { problem: "unknown" as const, detail: "" };
      return { id: f.id, kind: kindGroup(f.kind), to: maskEmail(f.to), problem: parsed.problem, detail: parsed.detail, at: f.at };
    }),
    myEmail: me[0]?.email ?? null,
  };
}

export type TestMailResult = { ok: true } | { ok: false; problem: MailProblem; detail: string };

/**
 * Deneme e-postası: kuyruğa girmeden hemen gönderilir, sonucu döner. Gönderim kaydı günlük sayaca ve son hatalara
 * girsin diye `email_outbox`'a `mail_test` türüyle yazılır. E-posta gönderimi kapalıyken (log) yapılamaz.
 */
export async function sendTestEmail(actor: Actor, input: { to: string; locale: string }): Promise<TestMailResult> {
  assertCan(actor, "mail.manage");
  assertUser(actor);
  if (!mailEnabled()) throw new ValidationError("mail_disabled");
  const [me] = await db().select({ fullName: personnel.fullName }).from(personnel).where(eq(personnel.userId, actor.userId)).limit(1);
  const t = createTranslator({ locale: toAppLocale(input.locale), messages: messagesFor(input.locale), namespace: "mailStatus.testEmail" });
  const subject = t("subject");
  const body = t("body", { name: me?.fullName ?? "-" });
  const footer = t("footer");
  const html = emailHtml({ heading: subject, body, linkLabel: t("open"), url: env().APP_URL, footer });
  const text = `${subject}\n\n${body}\n\n${footer}`;

  let result: TestMailResult = { ok: true };
  try {
    await sendMail({ to: input.to, subject, html, text, idempotencyKey: `mail-test-${randomUUID()}` });
  } catch (err) {
    const problem = err instanceof MailError ? err.problem : "unknown";
    const detail = err instanceof Error ? err.message.slice(0, 300) : "unknown";
    logger.warn({ problem }, "Deneme e-postası gönderilemedi");
    result = { ok: false, problem, detail };
  }
  const now = new Date();
  await withActor(actor, (tx) =>
    tx.insert(emailOutbox).values({
      kind: "mail_test",
      toAddress: input.to,
      subject,
      bodyText: text,
      bodyHtml: html,
      status: result.ok ? "sent" : "failed",
      attempts: 1,
      lastError: result.ok ? null : formatMailError(result.problem, result.detail),
      sentAt: result.ok ? now : null,
      nextAttemptAt: now,
    }),
  );
  return result;
}
