import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { systemActor } from "@/server/authz/actor";
import { db } from "@/server/db/client";
import { loginAttempts, reportExports } from "@/server/db/schema";
import { withActor } from "@/server/db/with-actor";
import { isImmutableViolation } from "@/server/errors";
import { signIn } from "@/server/services/auth";
import { exportLoginAttempts, listLoginAttempts } from "@/server/services/login-log";
import { purgeOldLoginAttempts } from "@/server/services/retention";
import { LOGIN_RESULTS } from "@/server/state/login-log";
import { owner } from "../support/db";
import { createTestUser, meta, TEST_PASSWORD } from "../support/factories";

const labels = {
  sheet: "Giriş kayıtları",
  columns: ["Zaman", "Yazılan", "Kişi", "Sicil", "Sonuç", "IP", "Tarayıcı"],
  results: Object.fromEntries(LOGIN_RESULTS.map((r) => [r, r])) as Record<(typeof LOGIN_RESULTS)[number], string>,
};
const none = { q: null, result: null, from: null, to: null };

describe("Giriş kayıtları ekranı (kararlar #215–216)", () => {
  it("yalnızca sistem yöneticisi ve üst yönetici görür", async () => {
    const sys = await createTestUser({ roles: ["sysadmin"] });
    const boss = await createTestUser({ roles: ["owner"] });
    await expect(listLoginAttempts(sys.actor, none)).resolves.toBeTruthy();
    await expect(listLoginAttempts(boss.actor, none)).resolves.toBeTruthy();
    for (const roles of [["hr"], ["security"], ["section_manager"], []] as const) {
      const u = await createTestUser({ roles: [...roles] });
      await expect(listLoginAttempts(u.actor, none)).rejects.toMatchObject({ code: "forbidden" });
      await expect(exportLoginAttempts(u.actor, none, labels)).rejects.toMatchObject({ code: "forbidden" });
    }
  });

  it("kişi ve IP ile süzülür; başarısızlar ayrı süzülür; bilinmeyen kullanıcının yazdığı metin maskelenir", async () => {
    const sys = await createTestUser({ roles: ["sysadmin"] });
    const worker = await createTestUser();
    const ip = `10.77.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 200)}`;
    await signIn({ sicilNo: worker.sicilNo, password: "yanlis-sifre-1", sharedDevice: false }, meta({ ip }));
    await signIn({ sicilNo: worker.sicilNo, password: TEST_PASSWORD, sharedDevice: false }, meta({ ip }));
    await signIn({ sicilNo: "GizliSifre123!", password: "x", sharedDevice: false }, meta({ ip }));

    const mine = await listLoginAttempts(sys.actor, { ...none, q: worker.sicilNo });
    expect(mine.entries.map((e) => e.result)).toEqual(["success", "bad_password"]);
    expect(mine.entries[0]).toMatchObject({ sicilNo: worker.sicilNo, userId: worker.userId, ip, userAgent: "vitest" });
    expect(mine.summary).toEqual({ success: 1, bad_password: 1 });

    const byIp = await listLoginAttempts(sys.actor, { ...none, q: ip, result: "failed" });
    expect(byIp.entries.map((e) => e.result).sort()).toEqual(["bad_password", "unknown_user"]);
    const unknown = byIp.entries.find((e) => e.result === "unknown_user")!;
    expect(unknown.input).toBe("Giz•••");
    expect(unknown.userId).toBeNull();
    // Özet sonuç süzgecinden bağımsızdır (aralıktaki bütün sonuçlar)
    expect(byIp.summary).toEqual({ success: 1, bad_password: 1, unknown_user: 1 });
  });

  it("Excel indirme kayda geçer; maskeli metin dosyada da maskelidir", async () => {
    const sys = await createTestUser({ roles: ["sysadmin"] });
    const ip = `10.78.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 200)}`;
    await signIn({ sicilNo: "BenimSifrem99", password: "x", sharedDevice: false }, meta({ ip }));
    const { buffer, rowCount } = await exportLoginAttempts(sys.actor, { ...none, q: ip }, labels);
    expect(rowCount).toBe(1);
    expect(buffer.length).toBeGreaterThan(1000);
    expect(buffer.includes(Buffer.from("BenimSifrem99"))).toBe(false);
    const [log] = await db().select().from(reportExports).where(eq(reportExports.actorId, sys.userId));
    expect(log).toMatchObject({ report: "login_attempts", format: "xlsx", rowCount: 1 });
  });

  it("karar #216: saklama süresini geçen kayıtlar gece silinir; son 30 gün hiçbir koşulda silinemez; uygulama doğrudan silemez", async () => {
    const old = `OLD-${Date.now()}`;
    const recent = `RECENT-${Date.now()}`;
    await owner()`insert into login_attempts (id, at, sicil_input, result) values (gen_random_uuid(), now() - interval '400 days', ${old}, 'unknown_user'), (gen_random_uuid(), now() - interval '10 days', ${recent}, 'unknown_user')`;
    const actor = systemActor("test:retention");
    expect(await purgeOldLoginAttempts(actor)).toBeGreaterThanOrEqual(1);
    const left = await db().select({ input: loginAttempts.sicilInput }).from(loginAttempts).where(sql`${loginAttempts.sicilInput} in (${old}, ${recent})`);
    expect(left.map((r) => r.input)).toEqual([recent]);

    const tooNew = await withActor(actor, (tx) => tx.execute(sql`select app_purge_login_attempts(now() - interval '5 days')`)).catch((e: unknown) => e);
    expect(isImmutableViolation(tooNew)).toBe(true);
    const direct = await withActor(actor, (tx) => tx.delete(loginAttempts).where(eq(loginAttempts.sicilInput, recent))).catch((e: unknown) => e);
    expect(isImmutableViolation(direct)).toBe(true);
  });
});
