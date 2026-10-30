import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { and, desc, eq, isNotNull, isNull, ne } from "drizzle-orm";
import { createTranslator } from "next-intl";
import { getAuth } from "@/server/auth/auth";
import { checkPassword } from "@/server/auth/password-policy";
import { systemActor, type Actor } from "@/server/authz/actor";
import { assertCan, assertUser, isOwner } from "@/server/authz/policy";
import { db, type DbOrTx, type Tx } from "@/server/db/client";
import { accountInvitations, accounts, emailOutbox, personnel, positions, sessions, userRoles, users } from "@/server/db/schema";
import { withActor } from "@/server/db/with-actor";
import { NotFoundError, ValidationError } from "@/server/errors";
import { env } from "@/server/env";
import { encryptInviteLink } from "@/server/crypto/invite-link";
import { emailHtml } from "@/server/state/notifications";
import {
  accountState,
  channelProblem,
  formatInviteCode,
  type InviteChannel,
  isInvitationOpen,
  normalizePhone,
  parseInviteCode,
  whatsappShareUrl,
  type AccountState,
} from "@/server/state/invitations";
import messages from "../../../messages/tr.json";
import { isIpBlocked, recordAttempt, signIn, type RequestMeta, type SignInResult } from "./auth";
import { getSetting, getSettings } from "./settings";

/**
 * Hesaba davet ve etkinleştirme (iş paketi 2.6b, kararlar #185–191).
 *  - Üç kanal aynı daveti üretir: e-posta (bağlantı e-postayla gider), WhatsApp (İK'nın cihazında açılan paylaş
 *    bağlantısı; sunucu WhatsApp'a bağlanmaz), basılı (QR + 8 haneli kod).
 *  - Token yalnızca SHA-256 özetiyle, kod HMAC ile saklanır. Tek kullanımlık ve süreli; yeni davet eskisini iptal eder.
 *  - Davetli hesabın şifresi kimsenin bilmediği rastgele bir değerdir; kişi etkinleştirirken kendi şifresini belirler.
 */

const inviteActor = systemActor("auth:invite");
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

function hashCode(userId: string, code: string): string {
  const key = createHmac("sha256", env().BETTER_AUTH_SECRET).update("japar-akademi:invite-code:v1").digest();
  return createHmac("sha256", key).update(`${userId}:${code}`).digest("hex");
}

function sameHash(a: string, b: string): boolean {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && timingSafeEqual(x, y);
}

/** E-posta kanalı yalnızca gerçek e-posta gönderimi açıkken seçilebilir (karar #191). */
export function inviteMailEnabled(): boolean {
  return env().MAIL_TRANSPORT === "graph";
}

/** Kimsenin bilmediği şifrenin özeti (davetli hesap etkinleşene kadar giriş yapılamaz). */
export async function unusablePasswordHash(): Promise<string> {
  return (await getAuth().$context).password.hash(randomBytes(32).toString("base64url"));
}

/** İK'nın cihazında açılacak hazır mesajlı WhatsApp bağlantısı (karar #188). */
export function inviteWhatsappUrl(input: { phone: string; fullName: string; url: string; hours: number }): string {
  const t = createTranslator({ locale: "tr", messages, namespace: "invite.message" });
  return whatsappShareUrl(normalizePhone(input.phone)!, t("whatsapp", { name: input.fullName, url: input.url, hours: input.hours }));
}

export type IssuedInvite = {
  invitationId: string;
  userId: string;
  sicilNo: string;
  fullName: string;
  positionName: string;
  channel: InviteChannel;
  url: string;
  /** Yalnızca basılı kanalda: "1234 5678" */
  code: string | null;
  expiresAt: Date;
  /** Yalnızca WhatsApp kanalında: İK'nın cihazında açılacak bağlantı */
  whatsappUrl: string | null;
};

/**
 * Kişiye yeni davet açar (verilen transaction içinde). Kişinin açık davetleri iptal edilir.
 * E-posta kanalında e-posta aynı transaction'da kuyruğa yazılır.
 */
export async function issueInvitation(
  tx: Tx,
  input: { userId: string; channel: InviteChannel; createdBy: string | null; batchId?: string | null },
  now = new Date(),
): Promise<IssuedInvite> {
  const [person] = await tx
    .select({
      sicilNo: personnel.sicilNo,
      fullName: personnel.fullName,
      email: personnel.email,
      phone: personnel.phone,
      status: personnel.status,
      positionName: positions.name,
    })
    .from(personnel)
    .leftJoin(positions, eq(positions.id, personnel.positionId))
    .where(eq(personnel.userId, input.userId))
    .limit(1);
  if (!person) throw new NotFoundError("person");
  if (person.status !== "active") throw new ValidationError("person_inactive");
  const problem = channelProblem(input.channel, person, inviteMailEnabled());
  if (problem) throw new ValidationError(problem);

  const hours = await getSetting("auth.invite_valid_hours");
  const expiresAt = new Date(now.getTime() + hours * 60 * 60_000);
  await tx
    .update(accountInvitations)
    .set({ revokedAt: now, linkEnc: null })
    .where(and(eq(accountInvitations.userId, input.userId), isNull(accountInvitations.usedAt), isNull(accountInvitations.revokedAt)));

  const token = randomBytes(32).toString("base64url");
  const code = input.channel === "print" ? String(randomInt(0, 100_000_000)).padStart(8, "0") : null;
  const url = new URL(`/activate/${token}`, env().APP_URL).toString();
  const [row] = await tx
    .insert(accountInvitations)
    .values({
      userId: input.userId,
      channel: input.channel,
      batchId: input.batchId ?? null,
      tokenHash: hashToken(token),
      codeHash: code ? hashCode(input.userId, code) : null,
      // Toplu WhatsApp listesi yeniden açılabilsin diye bağlantı şifreli saklanır (karar #201)
      linkEnc: input.batchId && input.channel === "whatsapp" ? encryptInviteLink(url) : null,
      expiresAt,
      createdBy: input.createdBy,
    })
    .returning({ id: accountInvitations.id });

  const t = createTranslator({ locale: "tr", messages, namespace: "invite.message" });
  let whatsappUrl: string | null = null;
  if (input.channel === "email") {
    const subject = t("emailSubject");
    const body = t("emailBody", { name: person.fullName, hours });
    await tx.insert(emailOutbox).values({
      kind: "account_invite",
      toAddress: person.email!,
      subject,
      bodyText: `${subject}\n\n${body}\n${url}\n\n${t("emailFooter")}`,
      bodyHtml: emailHtml({ heading: subject, body, linkLabel: t("emailOpen"), url, footer: t("emailFooter") }),
    });
  } else if (input.channel === "whatsapp") {
    whatsappUrl = inviteWhatsappUrl({ phone: person.phone!, fullName: person.fullName, url, hours });
  }

  return {
    invitationId: row!.id,
    userId: input.userId,
    sicilNo: person.sicilNo,
    fullName: person.fullName,
    positionName: person.positionName ?? "",
    channel: input.channel,
    url,
    code: code ? formatInviteCode(code) : null,
    expiresAt,
    whatsappUrl,
  };
}

/**
 * İK "yeniden davet" (şifre sıfırlamanın yerini alır, karar #185): yeni davet açılır, mevcut şifre geçersiz olur,
 * kilit kalkar, bütün oturumlar kapanır. Üst yöneticiyi yalnızca üst yönetici yeniden davet edebilir.
 */
export async function reinvite(actor: Actor, userId: string, channel: InviteChannel): Promise<IssuedInvite> {
  assertCan(actor, "people.manage");
  assertUser(actor);
  if (actor.userId === userId) throw new ValidationError("cannot_invite_self");
  const targetRoles = await db().select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, userId));
  if (targetRoles.some((r) => r.role === "owner") && !isOwner(actor)) throw new ValidationError("owner_only");
  const hash = await unusablePasswordHash();
  return withActor(actor, async (tx) => {
    const issued = await issueInvitation(tx, { userId, channel, createdBy: actor.userId });
    await tx
      .update(accounts)
      .set({ password: hash })
      .where(and(eq(accounts.userId, userId), eq(accounts.providerId, "credential")));
    await tx
      .update(personnel)
      .set({ activatedAt: null, mustChangePassword: false, failedLoginCount: 0, lockedUntil: null })
      .where(eq(personnel.userId, userId));
    await tx.delete(sessions).where(eq(sessions.userId, userId));
    return issued;
  });
}

export type InviteStatus = {
  state: AccountState;
  channel: InviteChannel | null;
  expiresAt: Date | null;
  createdAt: Date | null;
};

/** Kişinin hesap/davet durumu (İK ekranı). */
export async function inviteStatus(actor: Actor, userId: string, conn: DbOrTx = db()): Promise<InviteStatus> {
  assertCan(actor, "people.view");
  const [[person], [latest], maxAttempts] = await Promise.all([
    conn
      .select({ activatedAt: personnel.activatedAt, mustChangePassword: personnel.mustChangePassword })
      .from(personnel)
      .where(eq(personnel.userId, userId))
      .limit(1),
    conn
      .select()
      .from(accountInvitations)
      .where(eq(accountInvitations.userId, userId))
      .orderBy(desc(accountInvitations.createdAt))
      .limit(1),
    getSetting("auth.invite_code_attempts"),
  ]);
  if (!person) throw new NotFoundError("person");
  return {
    state: accountState({
      activatedAt: person.activatedAt,
      mustChangePassword: person.mustChangePassword,
      latestInvite: latest ?? null,
      now: new Date(),
      maxAttempts,
    }),
    channel: latest?.channel ?? null,
    expiresAt: latest?.expiresAt ?? null,
    createdAt: latest?.createdAt ?? null,
  };
}

// ---------------------------------------------------------------------------
// Etkinleştirme (hesapsız ekranlar)
// ---------------------------------------------------------------------------

async function openInvitation(conn: DbOrTx, token: string, lock = false) {
  if (!TOKEN_PATTERN.test(token)) return null;
  const q = conn
    .select({
      id: accountInvitations.id,
      userId: accountInvitations.userId,
      usedAt: accountInvitations.usedAt,
      revokedAt: accountInvitations.revokedAt,
      expiresAt: accountInvitations.expiresAt,
      failedAttempts: accountInvitations.failedAttempts,
      sicilNo: personnel.sicilNo,
      fullName: personnel.fullName,
      status: personnel.status,
    })
    .from(accountInvitations)
    .innerJoin(personnel, eq(personnel.userId, accountInvitations.userId))
    .where(eq(accountInvitations.tokenHash, hashToken(token)))
    .limit(1);
  const [row] = lock ? await q.for("update", { of: accountInvitations }) : await q;
  if (!row || row.status !== "active") return null;
  const max = await getSetting("auth.invite_code_attempts");
  return isInvitationOpen(row, new Date(), max) ? row : null;
}

/** Etkinleştirme ekranında gösterilecek kişi (bağlantı geçerliyse). */
export async function invitationForToken(token: string): Promise<{ fullName: string; sicilNo: string } | null> {
  const row = await openInvitation(db(), token);
  return row ? { fullName: row.fullName, sicilNo: row.sicilNo } : null;
}

/**
 * Bağlantıyla etkinleştirme: kişi şifresini belirler, davet kullanılmış olur, oturum açılır (karar #187).
 * Ortak cihaz kuralları girişle aynıdır.
 */
export async function activateWithToken(
  input: { token: string; newPassword: string; sharedDevice: boolean },
  meta: RequestMeta,
): Promise<SignInResult> {
  const row = await openInvitation(db(), input.token);
  if (!row) throw new ValidationError("invite_invalid");
  const minLength = await getSetting("auth.password_min_length");
  const issues = checkPassword(input.newPassword, { minLength, sicilNo: row.sicilNo });
  if (issues.length > 0) throw new ValidationError("weak_password", issues);
  const hash = await (await getAuth().$context).password.hash(input.newPassword);

  await withActor(inviteActor, async (tx) => {
    // Eşzamanlı iki kullanımda yalnızca biri geçer
    const locked = await openInvitation(tx, input.token, true);
    if (!locked) throw new ValidationError("invite_invalid");
    const now = new Date();
    await tx.update(accountInvitations).set({ usedAt: now, linkEnc: null }).where(eq(accountInvitations.id, locked.id));
    await tx
      .update(accountInvitations)
      .set({ revokedAt: now, linkEnc: null })
      .where(
        and(
          eq(accountInvitations.userId, locked.userId),
          ne(accountInvitations.id, locked.id),
          isNull(accountInvitations.usedAt),
          isNull(accountInvitations.revokedAt),
        ),
      );
    await tx
      .update(accounts)
      .set({ password: hash })
      .where(and(eq(accounts.userId, locked.userId), eq(accounts.providerId, "credential")));
    await tx
      .update(personnel)
      .set({ activatedAt: now, passwordChangedAt: now, mustChangePassword: false, failedLoginCount: 0, lockedUntil: null })
      .where(eq(personnel.userId, locked.userId));
    await tx.delete(sessions).where(eq(sessions.userId, locked.userId));
  });
  await recordAttempt(row.sicilNo, "activated", meta, row.userId);
  return signIn({ sicilNo: row.sicilNo, password: input.newPassword, sharedDevice: input.sharedDevice }, meta);
}

/**
 * Kağıttaki kodla etkinleştirme, 1. adım: sicil no + kod doğrulanır. Doğruysa davetin bağlantısı yenilenir ve
 * yeni bağlantı döner (2. adım bağlantıyla etkinleştirmeyle aynıdır). Her hata aynı genel mesajı verir;
 * davet başına `auth.invite_code_attempts` hatada davet kullanılamaz olur, IP sınırı girişle ortaktır.
 */
export async function verifyInviteCode(input: { sicilNo: string; code: string }, meta: RequestMeta): Promise<{ token: string }> {
  const sicilNo = input.sicilNo.trim().slice(0, 64);
  if (await isIpBlocked(meta.ip)) {
    await recordAttempt(sicilNo, "rate_limited", meta);
    throw new ValidationError("rate_limited");
  }
  const s = await getSettings(["auth.invite_code_attempts"]);
  const max = s["auth.invite_code_attempts"];
  const [person] = await db()
    .select({ userId: personnel.userId, status: personnel.status })
    .from(personnel)
    .innerJoin(users, eq(users.id, personnel.userId))
    .where(eq(users.username, sicilNo))
    .limit(1);
  const [inv] = person
    ? await db()
        .select()
        .from(accountInvitations)
        .where(and(eq(accountInvitations.userId, person.userId), isNotNull(accountInvitations.codeHash)))
        .orderBy(desc(accountInvitations.createdAt))
        .limit(1)
    : [];
  const code = parseInviteCode(input.code);
  const now = new Date();
  const open = !!inv && person?.status === "active" && isInvitationOpen(inv, now, max);
  const match = open && !!code && sameHash(inv.codeHash!, hashCode(inv.userId, code));

  if (!match) {
    if (open) {
      await withActor(inviteActor, (tx) =>
        tx
          .update(accountInvitations)
          .set({ failedAttempts: inv.failedAttempts + 1 })
          .where(eq(accountInvitations.id, inv.id)),
      );
    }
    await recordAttempt(sicilNo, "bad_invite", meta, person?.userId ?? null);
    throw new ValidationError("invite_invalid");
  }

  const token = randomBytes(32).toString("base64url");
  await withActor(inviteActor, (tx) =>
    tx.update(accountInvitations).set({ tokenHash: hashToken(token) }).where(eq(accountInvitations.id, inv.id)),
  );
  return { token };
}

