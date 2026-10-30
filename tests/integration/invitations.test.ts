import { and, eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { db } from "@/server/db/client";
import { accountInvitations, auditLog, emailOutbox, loginAttempts, personnel, sessions } from "@/server/db/schema";
import { signIn } from "@/server/services/auth";
import {
  activateWithToken,
  invitationForToken,
  inviteStatus,
  reinvite,
  verifyInviteCode,
} from "@/server/services/invitations";
import { createPerson } from "@/server/services/people";
import { setRoles } from "@/server/services/roles";
import { owner } from "../support/db";
import { createTestUser, meta, TEST_PASSWORD } from "../support/factories";

// E-posta kanalını denemek için gerçek gönderim açık sayılır (testte e-posta yalnızca kuyruğa yazılır, gönderilmez)
vi.hoisted(() => {
  process.env.MAIL_TRANSPORT = "graph";
  process.env.GRAPH_TENANT_ID ||= "test-tenant";
  process.env.GRAPH_CLIENT_ID ||= "test-client";
  process.env.GRAPH_CLIENT_SECRET ||= "test-secret";
  process.env.MAIL_FROM ||= "akademi@japar.test";
});

const base = { employmentType: "employee" as const, trainingRequired: false };
const NEW_PASSWORD = "Kalip-Degisimi-77";
const tokenOf = (url: string) => url.split("/activate/")[1]!;

/** Davetle açılan kişi: davet bilgisi + kişi kimliği. */
async function invited(...args: Parameters<typeof createPerson>) {
  const r = await createPerson(...args);
  return { ...r.invite!, userId: r.userId };
}

describe("İş paketi 2.6b: hesaba davet ve etkinleştirme", () => {
  it("karar #186–187: basılı kod → bağlantı → kişi şifresini belirler, oturum açılır; davet bir kez kullanılır", async () => {
    const hr = await createTestUser({ roles: ["hr"] });
    const invite = await invited(hr.actor, { ...base, sicilNo: "8001", fullName: "Hasan Demir", channel: "print" });
    expect(await inviteStatus(hr.actor, invite.userId)).toMatchObject({ state: "invite_pending", channel: "print" });

    // Kod boşluklu ya da boşluksuz yazılabilir
    const { token } = await verifyInviteCode({ sicilNo: "8001", code: invite.code!.replace(" ", "") }, meta());
    expect(await invitationForToken(token)).toEqual({ fullName: "Hasan Demir", sicilNo: "8001" });
    // Kod doğrulanınca kağıttaki eski QR bağlantısı geçersiz olur (bağlantı yenilenir)
    expect(await invitationForToken(tokenOf(invite.url))).toBeNull();

    await expect(activateWithToken({ token, newPassword: "8001", sharedDevice: false }, meta())).rejects.toMatchObject({ code: "weak_password" });
    const login = await activateWithToken({ token, newPassword: NEW_PASSWORD, sharedDevice: false }, meta());
    expect(login).toMatchObject({ ok: true, mustChangePassword: false });

    const [p] = await db().select().from(personnel).where(eq(personnel.userId, invite.userId));
    expect(p?.activatedAt).not.toBeNull();
    expect(await inviteStatus(hr.actor, invite.userId)).toMatchObject({ state: "active" });
    expect((await signIn({ sicilNo: "8001", password: NEW_PASSWORD, sharedDevice: false }, meta())).ok).toBe(true);

    // Tek kullanımlık
    await expect(activateWithToken({ token, newPassword: "Baska-Sifre-123", sharedDevice: false }, meta())).rejects.toMatchObject({ code: "invite_invalid" });
    await expect(verifyInviteCode({ sicilNo: "8001", code: invite.code! }, meta())).rejects.toMatchObject({ code: "invite_invalid" });

    const attempts = await db().select({ result: loginAttempts.result }).from(loginAttempts).where(eq(loginAttempts.userId, invite.userId));
    expect(attempts.map((a) => a.result)).toContain("activated");
    // Token ve kod özetleri denetim kaydına maskeli yazılır
    const [audit] = await db().select().from(auditLog).where(and(eq(auditLog.tableName, "account_invitations"), eq(auditLog.action, "INSERT")));
    expect((audit?.newData as Record<string, unknown>).token_hash).toBe("***");
  });

  it("karar #186: hatalı kod sayılır; hak dolunca doğru kod da geçmez, her hata aynı mesajı verir", async () => {
    const hr = await createTestUser({ roles: ["hr"] });
    const invite = await invited(hr.actor, { ...base, sicilNo: "8002", fullName: "Fatma Şahin", channel: "print" });
    const wrong = invite.code === "0000 0000" ? "1111 1111" : "0000 0000";
    for (let i = 0; i < 5; i++) {
      await expect(verifyInviteCode({ sicilNo: "8002", code: wrong }, meta({ ip: `10.1.0.${i}` }))).rejects.toMatchObject({ code: "invite_invalid" });
    }
    await expect(verifyInviteCode({ sicilNo: "8002", code: invite.code! }, meta({ ip: "10.1.0.9" }))).rejects.toMatchObject({ code: "invite_invalid" });
    // Bilinmeyen sicil de aynı genel hatayı verir
    await expect(verifyInviteCode({ sicilNo: "yok-8002", code: invite.code! }, meta({ ip: "10.1.0.10" }))).rejects.toMatchObject({ code: "invite_invalid" });
    // Hakkı dolan davet kullanılamaz; İK yeniden davet eder
    expect(await inviteStatus(hr.actor, invite.userId)).toMatchObject({ state: "invite_expired" });
  });

  it("karar #186: aynı IP'den çok sayıda hatalı kod girişte geçici engel (girişle ortak sınır)", async () => {
    const ip = "10.2.0.1";
    for (let i = 0; i < 20; i++) {
      await expect(verifyInviteCode({ sicilNo: `yok-${i}`, code: "1234 5678" }, meta({ ip }))).rejects.toMatchObject({ code: "invite_invalid" });
    }
    await expect(verifyInviteCode({ sicilNo: "yok", code: "1234 5678" }, meta({ ip }))).rejects.toMatchObject({ code: "rate_limited" });
    const worker = await createTestUser();
    expect(await signIn({ sicilNo: worker.sicilNo, password: TEST_PASSWORD, sharedDevice: false }, meta({ ip }))).toMatchObject({ reason: "rate_limited" });
  });

  it("karar #186: süresi dolan davet kullanılamaz", async () => {
    const hr = await createTestUser({ roles: ["hr"] });
    const invite = await invited(hr.actor, { ...base, sicilNo: "8003", fullName: "Süre Dolan", channel: "print" });
    await owner()`update account_invitations set expires_at = now() - interval '1 minute' where user_id = ${invite.userId}`;
    expect(await invitationForToken(tokenOf(invite.url))).toBeNull();
    await expect(verifyInviteCode({ sicilNo: "8003", code: invite.code! }, meta())).rejects.toMatchObject({ code: "invite_invalid" });
    expect(await inviteStatus(hr.actor, invite.userId)).toMatchObject({ state: "invite_expired" });
  });

  it("karar #188: WhatsApp kanalı telefon ister; İK'nın cihazında açılacak wa.me bağlantısı üretilir", async () => {
    const hr = await createTestUser({ roles: ["hr"] });
    await expect(createPerson(hr.actor, { ...base, sicilNo: "8004", fullName: "Telefonsuz", channel: "whatsapp" })).rejects.toMatchObject({
      code: "invite_phone_missing",
    });
    const invite = await invited(hr.actor, { ...base, sicilNo: "8005", fullName: "Mehmet Kaya", phone: "0532 111 22 33", channel: "whatsapp" });
    expect(invite.code).toBeNull();
    const wa = new URL(invite.whatsappUrl!);
    expect(wa.origin + wa.pathname).toBe("https://wa.me/905321112233");
    expect(wa.searchParams.get("text")).toContain("Mehmet Kaya");
    expect(wa.searchParams.get("text")).toContain(invite.url);
    const login = await activateWithToken({ token: tokenOf(invite.url), newPassword: NEW_PASSWORD, sharedDevice: true }, meta());
    expect(login.ok).toBe(true);
    const [s] = await db().select().from(sessions).where(eq(sessions.userId, invite.userId));
    expect(s?.sharedDevice).toBe(true);
  });

  it("karar #185: e-posta kanalı e-postayı aynı transaction'da kuyruğa yazar; e-postası olmayana seçilemez", async () => {
    const hr = await createTestUser({ roles: ["hr"] });
    await expect(createPerson(hr.actor, { ...base, sicilNo: "8006", fullName: "E-postasız", channel: "email" })).rejects.toMatchObject({
      code: "invite_email_missing",
    });
    const invite = await invited(hr.actor, { ...base, sicilNo: "8007", fullName: "Ayşe Yılmaz", email: "Ayse@Japar.Test", channel: "email" });
    const [mail] = await db().select().from(emailOutbox).where(eq(emailOutbox.toAddress, "ayse@japar.test"));
    expect(mail).toMatchObject({ kind: "account_invite", status: "pending" });
    expect(mail?.bodyText).toContain(invite.url);
  });

  it("karar #185: yeniden davet eski şifreyi ve daveti geçersiz kılar, oturumları kapatır; kişi kendini davet edemez", async () => {
    const hr = await createTestUser({ roles: ["hr"] });
    const worker = await createTestUser();
    await signIn({ sicilNo: worker.sicilNo, password: TEST_PASSWORD, sharedDevice: false }, meta());
    await owner()`update personnel set locked_until = now() + interval '1 hour', failed_login_count = 3 where user_id = ${worker.userId}`;

    const first = await reinvite(hr.actor, worker.userId, "print");
    const second = await reinvite(hr.actor, worker.userId, "print");
    expect(await db().select().from(sessions).where(eq(sessions.userId, worker.userId))).toHaveLength(0);
    expect((await signIn({ sicilNo: worker.sicilNo, password: TEST_PASSWORD, sharedDevice: false }, meta())).ok).toBe(false);
    // Yalnızca son davet geçerli
    await expect(verifyInviteCode({ sicilNo: worker.sicilNo, code: first.code! }, meta())).rejects.toMatchObject({ code: "invite_invalid" });
    const open = await db()
      .select()
      .from(accountInvitations)
      .where(eq(accountInvitations.userId, worker.userId));
    expect(open.filter((i) => !i.revokedAt)).toHaveLength(1);
    const { token } = await verifyInviteCode({ sicilNo: worker.sicilNo, code: second.code! }, meta());
    expect((await activateWithToken({ token, newPassword: NEW_PASSWORD, sharedDevice: false }, meta())).ok).toBe(true);

    await expect(reinvite(hr.actor, hr.userId, "print")).rejects.toMatchObject({ code: "cannot_invite_self" });
  });

  it("karar #193: üst yöneticiyi yalnızca üst yönetici yeniden davet eder", async () => {
    const hr = await createTestUser({ roles: ["hr"] });
    const boss = await createTestUser({ roles: ["owner"] });
    const other = await createTestUser({ roles: ["owner"] });
    await expect(reinvite(hr.actor, boss.userId, "print")).rejects.toMatchObject({ code: "owner_only" });
    expect((await reinvite(other.actor, boss.userId, "print")).code).toMatch(/^\d{4} \d{4}$/);
  });

  it("karar #189: owner, sysadmin ve İK kayıtlı e-postayla girer; diğer roller e-postayla giremez", async () => {
    const hr = await createTestUser({ roles: ["hr"], email: "ik.uzmani@japar.test" });
    const worker = await createTestUser({ email: "isci@japar.test" });
    expect(await signIn({ sicilNo: "IK.Uzmani@japar.test", password: TEST_PASSWORD, sharedDevice: false }, meta())).toMatchObject({ ok: true });
    expect(await signIn({ sicilNo: "isci@japar.test", password: TEST_PASSWORD, sharedDevice: false }, meta())).toMatchObject({
      ok: false,
      reason: "invalid_credentials",
    });
    expect((await signIn({ sicilNo: worker.sicilNo, password: TEST_PASSWORD, sharedDevice: false }, meta())).ok).toBe(true);
    const [attempt] = await db().select().from(loginAttempts).where(eq(loginAttempts.sicilInput, "isci@japar.test"));
    expect(attempt?.result).toBe("unknown_user");
    expect(hr.userId).toBeTruthy();
  });

  it("karar #189: e-postayla giriş rolü için e-posta kayıtlı ve tekil olmalı", async () => {
    const admin = await createTestUser({ roles: ["sysadmin"] });
    const noMail = await createTestUser();
    await expect(setRoles(admin.actor, noMail.userId, ["hr"])).rejects.toMatchObject({ code: "login_email_required" });
    await createTestUser({ email: "ortak@japar.test" });
    const dup = await createTestUser({ email: "ORTAK@japar.test" });
    await expect(setRoles(admin.actor, dup.userId, ["sysadmin"])).rejects.toMatchObject({ code: "login_email_taken" });
    const ok = await createTestUser({ email: "tekil@japar.test" });
    await setRoles(admin.actor, ok.userId, ["hr", "trainer"]);
  });
});
