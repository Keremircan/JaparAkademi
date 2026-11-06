import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db/client";
import { emailOutbox } from "@/server/db/schema";
import { ForbiddenError } from "@/server/errors";
import type { MailMessage } from "@/server/mail";
import { mailStatus, sendTestEmail } from "@/server/services/mail-status";
import { owner } from "../support/db";
import { createTestUser } from "../support/factories";

const mode = vi.hoisted(() => ({
  enabled: true,
  fail: null as null | "permission",
  calls: [] as MailMessage[],
}));

// Gerçek gönderim yapılmaz: sağlayıcı yanıtı taklit edilir
vi.mock("@/server/mail", async (importActual) => {
  const actual = await importActual<typeof import("@/server/mail")>();
  return {
    ...actual,
    mailEnabled: () => mode.enabled,
    mailTransport: () => (mode.enabled ? "resend" : "log"),
    mailSender: () => "JAPAR Akademi <akademi@akademi.japar.test>",
    sendMail: async (message: MailMessage) => {
      mode.calls.push(message);
      if (mode.fail === "permission") throw new actual.MailError("Resend 403 validation_error", false, "permission");
    },
  };
});

beforeEach(() => {
  mode.enabled = true;
  mode.fail = null;
  mode.calls = [];
});

describe("İş paketi 3.7: e-posta durumu ekranı", () => {
  it("FG-3.7 karar #261: yalnızca sistem yöneticisi; bugünkü sayaç, son 7 gün ve maskeli son hatalar", async () => {
    const hr = await createTestUser({ roles: ["hr"] });
    await expect(mailStatus(hr.actor)).rejects.toBeInstanceOf(ForbiddenError);
    const admin = await createTestUser({ roles: ["sysadmin"], email: "admin@japar.test" });

    await owner()`insert into email_outbox (id, kind, to_address, subject, body_text, body_html, status, sent_at, last_error, updated_at) values
      (gen_random_uuid(), 'readiness_pending', 'a@japar.test', 'K', 'm', '<p>m</p>', 'sent', now(), null, now()),
      (gen_random_uuid(), 'password_reset', 'b@japar.test', 'K', 'm', '<p>m</p>', 'sent', now(), null, now()),
      (gen_random_uuid(), 'account_invite', 'c@japar.test', 'K', 'm', '<p>m</p>', 'sent', now() - interval '3 days', null, now() - interval '3 days'),
      (gen_random_uuid(), 'password_reset', 'ali.veli@japar.test', 'K', 'm', '<p>m</p>', 'failed', null, '[permission] Resend 403 validation_error', now() - interval '1 hour'),
      (gen_random_uuid(), 'weekly_summary', 'eski@japar.test', 'K', 'm', '<p>m</p>', 'failed', null, '[request] Resend 422 invalid_parameter', now() - interval '10 days'),
      (gen_random_uuid(), 'readiness_pending', 'd@japar.test', 'K', 'm', '<p>m</p>', 'pending', null, '[quota] Resend 429 daily_quota_exceeded', now()),
      (gen_random_uuid(), 'readiness_pending', 'e@japar.test', 'K', 'm', '<p>m</p>', 'pending', null, null, now() - interval '1 minute')`;

    const status = await mailStatus(admin.actor);
    expect(status).toMatchObject({
      transport: "resend",
      enabled: true,
      sender: "JAPAR Akademi <akademi@akademi.japar.test>",
      limit: 100,
      reserve: 20,
      sentToday: 2,
      pending: 2,
      week: { sent: 3, failed: 1 },
      pendingProblem: { problem: "quota", detail: "Resend 429 daily_quota_exceeded" },
      myEmail: "admin@japar.test",
    });
    expect(status.failures).toEqual([
      expect.objectContaining({ kind: "password_reset", to: "a***@japar.test", problem: "permission", detail: "Resend 403 validation_error" }),
    ]);
    expect(status.resetsAt.getUTCHours()).toBe(0);
  });

  it("FG-3.7 karar #261: deneme e-postası hemen gönderilir, sonucu döner ve günlük sayaca girer", async () => {
    const admin = await createTestUser({ roles: ["sysadmin"] });
    expect(await sendTestEmail(admin.actor, { to: "deneme@japar.test", locale: "tr" })).toEqual({ ok: true });
    expect(mode.calls).toHaveLength(1);
    expect(mode.calls[0]).toMatchObject({ to: "deneme@japar.test", subject: "JAPAR Akademi deneme e-postası" });
    expect(mode.calls[0]!.idempotencyKey).toMatch(/^mail-test-/);

    mode.fail = "permission";
    expect(await sendTestEmail(admin.actor, { to: "deneme@japar.test", locale: "en" })).toEqual({
      ok: false,
      problem: "permission",
      detail: "Resend 403 validation_error",
    });
    expect(mode.calls[1]!.subject).toBe("JAPAR Akademi test email");

    const rows = await db().select().from(emailOutbox).where(eq(emailOutbox.kind, "mail_test"));
    expect(rows.map((r) => r.status).sort()).toEqual(["failed", "sent"]);
    expect(rows.find((r) => r.status === "failed")?.lastError).toBe("[permission] Resend 403 validation_error");

    const status = await mailStatus(admin.actor);
    expect(status.sentToday).toBe(1);
    expect(status.failures).toEqual([expect.objectContaining({ kind: "mail_test", to: "d***@japar.test", problem: "permission" })]);
  });

  it("FG-3.7 karar #261: e-posta kapalıyken deneme yapılamaz; İK deneme gönderemez", async () => {
    const admin = await createTestUser({ roles: ["sysadmin"] });
    const hr = await createTestUser({ roles: ["hr"] });
    await expect(sendTestEmail(hr.actor, { to: "x@japar.test", locale: "tr" })).rejects.toBeInstanceOf(ForbiddenError);
    mode.enabled = false;
    await expect(sendTestEmail(admin.actor, { to: "x@japar.test", locale: "tr" })).rejects.toMatchObject({ code: "mail_disabled" });
    expect(mode.calls).toHaveLength(0);
    expect((await mailStatus(admin.actor)).enabled).toBe(false);
  });
});
