import { createHash, randomBytes } from "node:crypto";
import { createTranslator } from "next-intl";
import { and, count, eq, gt, isNull, sql } from "drizzle-orm";
import { getAuth } from "@/server/auth/auth";
import { checkPassword } from "@/server/auth/password-policy";
import { systemActor } from "@/server/authz/actor";
import { db } from "@/server/db/client";
import { accounts, emailOutbox, passwordResetTokens, personnel, sessions } from "@/server/db/schema";
import { withActor } from "@/server/db/with-actor";
import { ValidationError } from "@/server/errors";
import { env } from "@/server/env";
import { emailHtml } from "@/server/state/notifications";
import { localizedPath, messagesFor } from "@/server/i18n/messages";
import { toAppLocale } from "@/lib/locale";
import { getSetting, getSettings } from "./settings";

/**
 * E-postayla şifre sıfırlama (SPEC 11.4, karar #88).
 *  - Ekran mesajı her durumda aynıdır: sicilin var olup olmadığı ya da e-postası olup olmadığı sızdırılmaz.
 *  - Bağlantı tek kullanımlık ve süreli (`auth.reset_link_minutes`); token yalnızca SHA-256 özetiyle saklanır.
 *  - Sicil ve IP başına saatlik sınır (`auth.reset_max_per_hour`). Sıfırlanınca bütün oturumlar kapanır.
 */

const actor = systemActor("auth:password-reset");
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const HOUR = 60 * 60_000;

export async function requestPasswordReset(input: { sicilNo: string; ip: string | null }): Promise<void> {
  const sicilNo = input.sicilNo.trim();
  if (!sicilNo || sicilNo.length > 50) return;
  const s = await getSettings(["auth.reset_link_minutes", "auth.reset_max_per_hour"]);
  const since = new Date(Date.now() - HOUR);
  if (input.ip) {
    const [byIp] = await db()
      .select({ n: count() })
      .from(passwordResetTokens)
      .where(and(eq(passwordResetTokens.ip, input.ip), gt(passwordResetTokens.createdAt, since)));
    if ((byIp?.n ?? 0) >= s["auth.reset_max_per_hour"] * 5) return;
  }
  const [person] = await db()
    .select({ userId: personnel.userId, email: personnel.email, status: personnel.status, locale: personnel.locale })
    .from(personnel)
    .where(eq(personnel.sicilNo, sicilNo))
    .limit(1);
  if (!person || person.status !== "active" || !person.email) return;
  const [recent] = await db()
    .select({ n: count() })
    .from(passwordResetTokens)
    .where(and(eq(passwordResetTokens.userId, person.userId), gt(passwordResetTokens.createdAt, since)));
  if ((recent?.n ?? 0) >= s["auth.reset_max_per_hour"]) return;

  const token = randomBytes(32).toString("base64url");
  const minutes = s["auth.reset_link_minutes"];
  // Kişinin dilinde (karar #207)
  const url = new URL(localizedPath(`/reset-password/${token}`, person.locale), env().APP_URL).toString();
  const t = createTranslator({ locale: toAppLocale(person.locale), messages: messagesFor(person.locale), namespace: "auth.reset.email" });
  const subject = t("subject");
  await withActor(actor, async (tx) => {
    await tx.insert(passwordResetTokens).values({ userId: person.userId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + minutes * 60_000), ip: input.ip });
    await tx.insert(emailOutbox).values({
      kind: "password_reset",
      toAddress: person.email!,
      subject,
      bodyText: `${subject}\n\n${t("body", { minutes })}\n${url}\n\n${t("footer")}`,
      bodyHtml: emailHtml({ heading: subject, body: t("body", { minutes }), linkLabel: t("open"), url, footer: t("footer") }),
    });
  });
}

async function findToken(token: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const [row] = await db()
    .select({ id: passwordResetTokens.id, userId: passwordResetTokens.userId, sicilNo: personnel.sicilNo })
    .from(passwordResetTokens)
    .innerJoin(personnel, eq(personnel.userId, passwordResetTokens.userId))
    .where(
      and(
        eq(passwordResetTokens.tokenHash, hashToken(token)),
        isNull(passwordResetTokens.usedAt),
        gt(passwordResetTokens.expiresAt, new Date()),
        eq(personnel.status, "active"),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function isResetTokenValid(token: string): Promise<boolean> {
  return !!(await findToken(token));
}

export async function resetPasswordWithToken(input: { token: string; newPassword: string }): Promise<void> {
  const row = await findToken(input.token);
  if (!row) throw new ValidationError("reset_link_invalid");
  const minLength = await getSetting("auth.password_min_length");
  const issues = checkPassword(input.newPassword, { minLength, sicilNo: row.sicilNo });
  if (issues.length > 0) throw new ValidationError("weak_password", issues);
  const hash = await (await getAuth().$context).password.hash(input.newPassword);
  await withActor(actor, async (tx) => {
    // Eşzamanlı iki kullanımda yalnızca biri geçer
    const used = await tx
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(and(eq(passwordResetTokens.id, row.id), isNull(passwordResetTokens.usedAt)))
      .returning({ id: passwordResetTokens.id });
    if (used.length === 0) throw new ValidationError("reset_link_invalid");
    await tx
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(and(eq(passwordResetTokens.userId, row.userId), isNull(passwordResetTokens.usedAt)));
    await tx.update(accounts).set({ password: hash }).where(and(eq(accounts.userId, row.userId), eq(accounts.providerId, "credential")));
    await tx
      .update(personnel)
      .set({
        mustChangePassword: false,
        passwordChangedAt: new Date(),
        activatedAt: sql`coalesce(${personnel.activatedAt}, now())`,
        failedLoginCount: 0,
        lockedUntil: null,
      })
      .where(eq(personnel.userId, row.userId));
    await tx.delete(sessions).where(eq(sessions.userId, row.userId));
  });
}
