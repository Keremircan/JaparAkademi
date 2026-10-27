import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { db } from "@/server/db/client";
import { emailOutbox, notifications } from "@/server/db/schema";
import { dispatchEmails } from "@/server/services/notifications/dispatch";
import { owner } from "../support/db";
import { createTestUser } from "../support/factories";

const mode = vi.hoisted(() => ({ retryable: true }));

vi.mock("@/server/mail", async (importActual) => {
  const actual = await importActual<typeof import("@/server/mail")>();
  return {
    ...actual,
    sendMail: async () => {
      throw new actual.MailError("Graph sendMail başarısız (503)", mode.retryable);
    },
  };
});

async function queued() {
  await owner()`insert into email_outbox (id, kind, to_address, subject, body_text, body_html) values (gen_random_uuid(), 'readiness_pending', 'a@example.com', 'Konu', 'metin', '<p>metin</p>')`;
  const [row] = await db().select().from(emailOutbox);
  return row!;
}

describe("e-posta kuyruğu hataları (karar #87)", () => {
  it("geçici hatada üstel beklemeyle yeniden denenir; sınır aşılınca kalıcı hata ve sistem yöneticisine alarm", async () => {
    const admin = await createTestUser({ roles: ["sysadmin"] });
    mode.retryable = true;
    const row = await queued();
    await dispatchEmails();
    let [after] = await db().select().from(emailOutbox).where(eq(emailOutbox.id, row.id));
    expect(after).toMatchObject({ status: "pending", attempts: 1, lastError: expect.stringContaining("503") });
    expect(after!.nextAttemptAt.getTime()).toBeGreaterThan(Date.now() + 30_000);

    // Deneme sınırına (5) gelene kadar zamanı ileri al
    for (let i = 0; i < 4; i++) {
      await owner()`update email_outbox set next_attempt_at = now() - interval '1 second'`;
      await dispatchEmails();
    }
    [after] = await db().select().from(emailOutbox).where(eq(emailOutbox.id, row.id));
    expect(after).toMatchObject({ status: "failed", attempts: 5 });
    const alarms = await db().select().from(notifications).where(eq(notifications.userId, admin.userId));
    expect(alarms.map((a) => a.kind)).toEqual(["email_failed"]);
  });

  it("kalıcı hatada (yetki, adres) hemen başarısız sayılır", async () => {
    mode.retryable = false;
    const row = await queued();
    await dispatchEmails();
    const [after] = await db().select().from(emailOutbox).where(eq(emailOutbox.id, row.id));
    expect(after).toMatchObject({ status: "failed", attempts: 1 });
  });
});
