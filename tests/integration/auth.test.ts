import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { getAuth } from "@/server/auth/auth";
import { db } from "@/server/db/client";
import { loginAttempts, personnel, sessions } from "@/server/db/schema";
import { ValidationError } from "@/server/errors";
import { createAccount } from "@/server/services/accounts";
import { changePassword, loadSessionUser, signIn, signOut } from "@/server/services/auth";
import { setSetting } from "@/server/services/settings";
import { systemActor } from "@/server/authz/actor";
import { owner } from "../support/db";
import { cookieHeader, createTestUser, meta, TEST_PASSWORD } from "../support/factories";

async function sessionFromCookie(cookie: string) {
  const s = await getAuth().api.getSession({ headers: new Headers({ cookie }), query: { disableRefresh: true } });
  return s ? loadSessionUser(s.session.id) : null;
}

describe("Giriş: sicil no + şifre (SPEC 11.4)", () => {
  it("doğru bilgilerle oturum açılır, roller ve ortak cihaz bilgisi yüklenir", async () => {
    const { sicilNo } = await createTestUser({ roles: ["trainer"] });
    const result = await signIn({ sicilNo, password: TEST_PASSWORD, sharedDevice: true }, meta());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const user = await sessionFromCookie(cookieHeader(result.setCookieHeaders));
    expect(user).toMatchObject({ sicilNo, sharedDevice: true });
    expect(user?.roles.sort()).toEqual(["personnel", "trainer"]);
  });

  it("sicil no başındaki/sonundaki boşluklar yok sayılır", async () => {
    const { sicilNo } = await createTestUser();
    const result = await signIn({ sicilNo: `  ${sicilNo} `, password: TEST_PASSWORD, sharedDevice: false }, meta());
    expect(result.ok).toBe(true);
  });

  it("yanlış şifre ve bilinmeyen sicil aynı genel hatayı verir", async () => {
    const { sicilNo } = await createTestUser();
    const wrong = await signIn({ sicilNo, password: "yanlis-sifre", sharedDevice: false }, meta());
    const unknown = await signIn({ sicilNo: "YOK999", password: TEST_PASSWORD, sharedDevice: false }, meta());
    expect(wrong).toEqual({ ok: false, reason: "invalid_credentials" });
    expect(unknown).toEqual({ ok: false, reason: "invalid_credentials" });
  });

  it("her deneme login_attempts tablosuna kaydedilir", async () => {
    const { sicilNo, userId } = await createTestUser();
    await signIn({ sicilNo, password: "yanlis-sifre", sharedDevice: false }, meta());
    await signIn({ sicilNo, password: TEST_PASSWORD, sharedDevice: false }, meta());
    const rows = await db().select().from(loginAttempts).where(eq(loginAttempts.userId, userId));
    expect(rows.map((r) => r.result).sort()).toEqual(["bad_password", "success"]);
  });

  it("5 hatalı denemeden sonra hesap kilitlenir; doğru şifre de reddedilir", async () => {
    const { sicilNo } = await createTestUser();
    for (let i = 0; i < 4; i++) {
      expect((await signIn({ sicilNo, password: "yanlis", sharedDevice: false }, meta())).ok).toBe(false);
    }
    const fifth = await signIn({ sicilNo, password: "yanlis", sharedDevice: false }, meta());
    expect(fifth).toMatchObject({ ok: false, reason: "locked" });

    const correct = await signIn({ sicilNo, password: TEST_PASSWORD, sharedDevice: false }, meta());
    expect(correct).toMatchObject({ ok: false, reason: "locked" });
  });

  it("kilit süresi dolunca giriş yapılabilir ve sayaç sıfırlanır", async () => {
    const { sicilNo, userId } = await createTestUser();
    await owner()`update personnel set locked_until = now() - interval '1 minute' where user_id = ${userId}`;
    const result = await signIn({ sicilNo, password: TEST_PASSWORD, sharedDevice: false }, meta());
    expect(result.ok).toBe(true);
    const [p] = await db().select().from(personnel).where(eq(personnel.userId, userId));
    expect(p?.failedLoginCount).toBe(0);
    expect(p?.lockedUntil).toBeNull();
  });

  it("aynı IP'den çok sayıda başarısız deneme sınırlanır (auth.ip_max_failures)", async () => {
    const { actor } = await createTestUser({ roles: ["sysadmin"] });
    await setSetting(actor, "auth.ip_max_failures", 3);
    const ip = "192.0.2.50";
    for (let i = 0; i < 3; i++) {
      await signIn({ sicilNo: `YOK${i}`, password: "x", sharedDevice: false }, meta({ ip }));
    }
    const { sicilNo } = await createTestUser();
    const blocked = await signIn({ sicilNo, password: TEST_PASSWORD, sharedDevice: false }, meta({ ip }));
    expect(blocked).toEqual({ ok: false, reason: "rate_limited" });

    const otherIp = await signIn({ sicilNo, password: TEST_PASSWORD, sharedDevice: false }, meta({ ip: "192.0.2.51" }));
    expect(otherIp.ok).toBe(true);
  });

  it("pasif personel doğru şifreyle bile giriş yapamaz ve oturum açık kalmaz", async () => {
    const { sicilNo, userId } = await createTestUser();
    await owner()`update personnel set status = 'passive' where user_id = ${userId}`;
    const result = await signIn({ sicilNo, password: TEST_PASSWORD, sharedDevice: false }, meta());
    expect(result).toEqual({ ok: false, reason: "inactive" });
    const open = await db().select().from(sessions).where(eq(sessions.userId, userId));
    expect(open).toHaveLength(0);
  });

  it("açık kayıt kapalıdır (Better Auth sign-up reddedilir)", async () => {
    await expect(
      getAuth().api.signUpEmail({ body: { email: "yeni@ornek.com", password: "Kl8#mxPq2x", name: "Yeni" } }),
    ).rejects.toThrow();
  });

  it("aynı sicil numarasıyla ikinci hesap açılamaz", async () => {
    const { sicilNo } = await createTestUser();
    await expect(
      createAccount(systemActor("test"), { sicilNo, fullName: "Başka Kişi", password: TEST_PASSWORD }),
    ).rejects.toMatchObject({ code: "sicil_taken" });
  });
});

describe("Oturum süreleri (session.* parametreleri)", () => {
  async function loggedIn(sharedDevice: boolean) {
    const u = await createTestUser();
    const result = await signIn({ sicilNo: u.sicilNo, password: TEST_PASSWORD, sharedDevice }, meta());
    if (!result.ok) throw new Error("giriş başarısız");
    return { ...u, cookie: cookieHeader(result.setCookieHeaders) };
  }

  it("ortak cihazda işlemsizlik süresi dolunca oturum kapanır", async () => {
    const { cookie, userId } = await loggedIn(true);
    await owner()`update sessions set last_seen_at = now() - interval '11 minutes' where user_id = ${userId}`;
    expect(await sessionFromCookie(cookie)).toBeNull();
    expect(await db().select().from(sessions).where(eq(sessions.userId, userId))).toHaveLength(0);
  });

  it("kişisel cihazda aynı işlemsizlik oturumu kapatmaz", async () => {
    const { cookie, userId } = await loggedIn(false);
    await owner()`update sessions set last_seen_at = now() - interval '11 minutes' where user_id = ${userId}`;
    expect(await sessionFromCookie(cookie)).not.toBeNull();
  });

  it("kişisel cihazda 30 gün işlemsizlikten sonra oturum kapanır", async () => {
    const { cookie, userId } = await loggedIn(false);
    await owner()`update sessions set last_seen_at = now() - interval '31 days' where user_id = ${userId}`;
    expect(await sessionFromCookie(cookie)).toBeNull();
  });

  it("personel pasife alınınca açık oturumu da geçersiz olur", async () => {
    const { cookie, userId } = await loggedIn(false);
    await owner()`update personnel set status = 'passive' where user_id = ${userId}`;
    expect(await sessionFromCookie(cookie)).toBeNull();
  });

  it("çıkış yapınca oturum kapanır", async () => {
    const { cookie } = await loggedIn(false);
    await signOut(meta({ cookie }));
    expect(await sessionFromCookie(cookie)).toBeNull();
  });
});

describe("Şifre değiştirme", () => {
  it("ilk girişte şifre değiştirme zorunluluğu kullanıcıya yansır", async () => {
    const { sicilNo } = await createTestUser({ mustChangePassword: true });
    const result = await signIn({ sicilNo, password: TEST_PASSWORD, sharedDevice: false }, meta());
    expect(result).toMatchObject({ ok: true, mustChangePassword: true });
  });

  it("şifre değişince zorunluluk kalkar, diğer oturumlar kapanır, cihaz modu korunur", async () => {
    const { sicilNo, userId } = await createTestUser({ mustChangePassword: true });
    const first = await signIn({ sicilNo, password: TEST_PASSWORD, sharedDevice: true }, meta());
    const second = await signIn({ sicilNo, password: TEST_PASSWORD, sharedDevice: false }, meta());
    if (!first.ok || !second.ok) throw new Error("giriş başarısız");
    const cookie = cookieHeader(first.setCookieHeaders);
    const user = (await sessionFromCookie(cookie))!;

    const { setCookieHeaders } = await changePassword(
      user,
      { currentPassword: TEST_PASSWORD, newPassword: "Yeni.Sifre-77" },
      meta({ cookie }),
    );

    const fresh = await sessionFromCookie(cookieHeader(setCookieHeaders));
    expect(fresh).toMatchObject({ mustChangePassword: false, sharedDevice: true });
    expect(await sessionFromCookie(cookieHeader(second.setCookieHeaders))).toBeNull();

    const relogin = await signIn({ sicilNo, password: "Yeni.Sifre-77", sharedDevice: false }, meta());
    expect(relogin.ok).toBe(true);
    const [p] = await db().select().from(personnel).where(and(eq(personnel.userId, userId)));
    expect(p?.passwordChangedAt).not.toBeNull();
  });

  it("zayıf yeni şifre politikaya göre reddedilir", async () => {
    const { sicilNo } = await createTestUser();
    const r = await signIn({ sicilNo, password: TEST_PASSWORD, sharedDevice: false }, meta());
    if (!r.ok) throw new Error("giriş başarısız");
    const cookie = cookieHeader(r.setCookieHeaders);
    const user = (await sessionFromCookie(cookie))!;

    const err = await changePassword(user, { currentPassword: TEST_PASSWORD, newPassword: "12345678" }, meta({ cookie })).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ValidationError);
    expect((err as ValidationError).details).toEqual(expect.arrayContaining(["common", "sequential"]));
  });

  it("mevcut şifre yanlışsa değiştirilemez", async () => {
    const { sicilNo } = await createTestUser();
    const r = await signIn({ sicilNo, password: TEST_PASSWORD, sharedDevice: false }, meta());
    if (!r.ok) throw new Error("giriş başarısız");
    const cookie = cookieHeader(r.setCookieHeaders);
    const user = (await sessionFromCookie(cookie))!;
    await expect(
      changePassword(user, { currentPassword: "yanlis-sifre", newPassword: "Yeni.Sifre-77" }, meta({ cookie })),
    ).rejects.toMatchObject({ code: "current_password_invalid" });
  });
});
