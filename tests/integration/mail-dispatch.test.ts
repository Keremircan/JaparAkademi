import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db/client";
import { emailOutbox, notifications } from "@/server/db/schema";
import type { MailMessage } from "@/server/mail";
import { dispatchEmails } from "@/server/services/notifications/dispatch";
import { setSetting } from "@/server/services/settings";
import { owner } from "../support/db";
import { createTestUser } from "../support/factories";

const mode = vi.hoisted(() => ({
  kind: "fail" as "ok" | "fail" | "quota",
  retryable: true,
  calls: [] as MailMessage[],
}));

vi.mock("@/server/mail", async (importActual) => {
  const actual = await importActual<typeof import("@/server/mail")>();
  return {
    ...actual,
    sendMail: async (message: MailMessage) => {
      mode.calls.push(message);
      if (mode.kind === "ok") return;
      if (mode.kind === "quota") throw new actual.MailError("Resend 429 daily_quota_exceeded", true, "quota");
      throw new actual.MailError("Graph sendMail başarısız (503)", mode.retryable);
    },
  };
});

beforeEach(() => {
  mode.kind = "fail";
  mode.retryable = true;
  mode.calls = [];
});

/** Kuyruğa e-posta ekler. Zamanı geçmiş olarak eklenir: veritabanı (Docker) saati uygulama saatinden biraz ileride olabilir. */
async function queue(kind = "readiness_pending", to = "a@example.com", ageSeconds = 1) {
  const [row] = await owner()<{ id: string }[]>`
    insert into email_outbox (id, kind, to_address, subject, body_text, body_html, next_attempt_at, created_at)
    values (gen_random_uuid(), ${kind}, ${to}, ${`Konu ${to}`}, 'metin', '<p>metin</p>', now() - make_interval(secs => ${ageSeconds}), now() - make_interval(secs => ${ageSeconds}))
    returning id`;
  return row!.id;
}

async function queued() {
  const id = await queue();
  const [row] = await db().select().from(emailOutbox).where(eq(emailOutbox.id, id));
  return row!;
}

async function statusOf(id: string) {
  const [row] = await db().select().from(emailOutbox).where(eq(emailOutbox.id, id));
  return row!;
}

describe("e-posta kuyruğu hataları (karar #87)", () => {
  it("geçici hatada üstel beklemeyle yeniden denenir; sınır aşılınca kalıcı hata ve sistem yöneticisine alarm", async () => {
    const admin = await createTestUser({ roles: ["sysadmin"] });
    mode.retryable = true;
    const row = await queued();
    await dispatchEmails();
    let after = await statusOf(row.id);
    expect(after).toMatchObject({ status: "pending", attempts: 1, lastError: expect.stringContaining("503") });
    expect(after.nextAttemptAt.getTime()).toBeGreaterThan(Date.now() + 30_000);

    // Deneme sınırına (5) gelene kadar zamanı ileri al
    for (let i = 0; i < 4; i++) {
      await owner()`update email_outbox set next_attempt_at = now() - interval '1 second'`;
      await dispatchEmails();
    }
    after = await statusOf(row.id);
    expect(after).toMatchObject({ status: "failed", attempts: 5 });
    const alarms = await db().select().from(notifications).where(eq(notifications.userId, admin.userId));
    expect(alarms.map((a) => a.kind)).toEqual(["email_failed"]);
    // FG-3.7 karar #261: alarm e-posta durumu ekranına götürür
    expect(alarms[0]!.link).toBe("/admin/email");
  });

  it("kalıcı hatada (yetki, adres) hemen başarısız sayılır", async () => {
    mode.retryable = false;
    const row = await queued();
    await dispatchEmails();
    expect(await statusOf(row.id)).toMatchObject({ status: "failed", attempts: 1 });
  });
});

describe("İş paketi 3.7: günlük sınır ve öncelik", () => {
  it("FG-3.7 karar #260: sınırda önce bağlantı e-postaları gider; bildirimler ayrılan payı kullanamaz, kalanlar bekler", async () => {
    const admin = await createTestUser({ roles: ["sysadmin"] });
    await setSetting(admin.actor, "mail.daily_limit", 4);
    await setSetting(admin.actor, "mail.link_reserve", 2);
    // Bugün (UTC günü) bir e-posta gönderilmiş; dünkü sayılmaz
    await owner()`insert into email_outbox (id, kind, to_address, subject, body_text, body_html, status, sent_at) values
      (gen_random_uuid(), 'readiness_pending', 'eski@example.com', 'K', 'm', '<p>m</p>', 'sent', now()),
      (gen_random_uuid(), 'readiness_pending', 'dun@example.com', 'K', 'm', '<p>m</p>', 'sent', date_trunc('day', now(), 'UTC') - interval '1 hour')`;
    // En eski bildirimler önde, bağlantılar sonra eklenmiş
    const notifA = await queue("readiness_pending", "a@example.com", 60);
    const notifB = await queue("weekly_summary", "b@example.com", 50);
    const invite = await queue("account_invite", "davet@example.com", 40);
    const reset = await queue("password_reset", "sifre@example.com", 30);

    mode.kind = "ok";
    // Kalan hak: bağlantılar 3, bildirimler 1 (4 − 2 − 1)
    expect(await dispatchEmails()).toEqual({ sent: 3, failed: 0, deferred: 0 });
    expect(mode.calls.map((c) => c.to)).toEqual(["sifre@example.com", "davet@example.com", "a@example.com"]);
    expect((await statusOf(notifB)).status).toBe("pending");
    expect((await statusOf(notifB)).attempts).toBe(0);
    for (const id of [reset, invite, notifA]) expect((await statusOf(id)).status).toBe("sent");
    // Aynı deneme iki kez gönderilmesin diye her istekte anahtar (karar #260)
    expect(mode.calls[0]!.idempotencyKey).toBe(`outbox-${reset}-0`);

    // Sınır doldu: yeni şifre sıfırlama da bekler; hata değildir, alarm gitmez
    const late = await queue("password_reset", "gec@example.com");
    mode.calls = [];
    expect(await dispatchEmails()).toEqual({ sent: 0, failed: 0, deferred: 0 });
    expect(mode.calls).toHaveLength(0);
    expect((await statusOf(late)).status).toBe("pending");
    expect(await db().select().from(notifications).where(eq(notifications.userId, admin.userId))).toHaveLength(0);

    // 0 = sınırsız: bekleyenler gider, bağlantı önce
    await setSetting(admin.actor, "mail.daily_limit", 0);
    await dispatchEmails();
    expect(mode.calls.map((c) => c.to)).toEqual(["gec@example.com", "b@example.com"]);
  });

  it("FG-3.7 karar #260: sağlayıcı kotası dolunca kuyruk bekletilir; deneme sayılmaz, alarm gitmez", async () => {
    const admin = await createTestUser({ roles: ["sysadmin"] });
    const first = await queue("password_reset", "x@example.com", 20);
    const second = await queue("readiness_pending", "y@example.com", 10);
    mode.kind = "quota";
    expect(await dispatchEmails()).toEqual({ sent: 0, failed: 0, deferred: 2 });
    // İlk istekte kota hatası; ikinci hiç denenmez
    expect(mode.calls).toHaveLength(1);
    const a = await statusOf(first);
    const b = await statusOf(second);
    expect(a).toMatchObject({ status: "pending", attempts: 0, lastError: "[quota] Resend 429 daily_quota_exceeded" });
    expect(b).toMatchObject({ status: "pending", attempts: 0, lastError: null });
    expect(a.nextAttemptAt.getTime()).toBeGreaterThan(Date.now() + 30 * 60_000);
    expect(b.nextAttemptAt.getTime()).toBeGreaterThan(Date.now() + 30 * 60_000);
    expect(await db().select().from(notifications).where(eq(notifications.userId, admin.userId))).toHaveLength(0);
  });
});
