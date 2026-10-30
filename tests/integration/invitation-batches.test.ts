import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { systemActor } from "@/server/authz/actor";
import { db } from "@/server/db/client";
import { accountInvitations, invitationBatches } from "@/server/db/schema";
import { ForbiddenError } from "@/server/errors";
import { signIn } from "@/server/services/auth";
import {
  createInvitationBatch,
  getInvitationBatch,
  listInvitees,
  markInviteShared,
  purgeExpiredInviteLinks,
  recentInvitationBatches,
} from "@/server/services/invitation-batches";
import { activateWithToken, inviteStatus, reinvite } from "@/server/services/invitations";
import { createPerson } from "@/server/services/people";
import { setSetting } from "@/server/services/settings";
import { owner } from "../support/db";
import { createTestUser, meta, TEST_PASSWORD } from "../support/factories";

const base = { employmentType: "employee" as const, trainingRequired: false, channel: "none" as const };
const NEW_PASSWORD = "Toplu-Davet-2026";
const tokenFromWa = (waUrl: string) => new URL(waUrl).searchParams.get("text")!.match(/\/activate\/([A-Za-z0-9_-]{43})/)![1]!;

async function person(hr: Awaited<ReturnType<typeof createTestUser>>, sicilNo: string, extra: { phone?: string; email?: string } = {}) {
  const { userId, invite } = await createPerson(hr.actor, { ...base, sicilNo, fullName: `Kişi ${sicilNo}`, ...extra });
  expect(invite).toBeNull();
  return userId;
}

describe("İş paketi 2.6c: toplu davet", () => {
  it("karar #198: davetsiz eklenen kişi giriş yapamaz ve 'Davet edilmedi' görünür", async () => {
    const hr = await createTestUser({ roles: ["hr"] });
    const id = await person(hr, "9001");
    expect(await inviteStatus(hr.actor, id)).toMatchObject({ state: "not_invited", channel: null });
    expect(await db().select().from(accountInvitations).where(eq(accountInvitations.userId, id))).toHaveLength(0);
    expect((await signIn({ sicilNo: "9001", password: TEST_PASSWORD, sharedDevice: false }, meta())).ok).toBe(false);
    expect((await listInvitees(hr.actor, { state: "not_invited", q: "9001" })).map((r) => r.userId)).toEqual([id]);
  });

  it("karar #200: akıllı kip telefonu olana WhatsApp, iletişimi olmayana basılı; atlananlar sayılır", async () => {
    const hr = await createTestUser({ roles: ["hr"] });
    const withPhone = await person(hr, "9011", { phone: "0532 111 22 01" });
    const withMailAndPhone = await person(hr, "9012", { phone: "0532 111 22 02", email: "k9012@japar.test" });
    const nothing = await person(hr, "9013");
    const activated = await createTestUser();
    await owner()`update personnel set activated_at = now() where user_id = ${activated.userId}`;

    // Testte e-posta gönderimi kapalı (MAIL_TRANSPORT=log): e-postası olan da WhatsApp'a düşer
    const result = await createInvitationBatch(hr.actor, { userIds: [withPhone, withMailAndPhone, nothing, activated.userId, hr.userId], mode: "smart" });
    expect(result.counts).toEqual({ email: 0, whatsapp: 2, print: 1, skipped: 2 });
    expect(result.printed.map((p) => [p.userId, p.channel])).toEqual([[nothing, "print"]]);
    expect(result.printed[0]!.code).toMatch(/^\d{4} \d{4}$/);

    const [batch] = await db().select().from(invitationBatches).where(eq(invitationBatches.id, result.batchId));
    expect(batch).toMatchObject({ mode: "smart", total: 3, whatsappCount: 2, printCount: 1, createdBy: hr.userId });
    expect((await inviteStatus(hr.actor, withPhone)).state).toBe("invite_pending");
  });

  it("karar #200: tek kanal kipinde kanala uymayan kişi basılıya düşer", async () => {
    const hr = await createTestUser({ roles: ["hr"] });
    const a = await person(hr, "9021", { phone: "05321112221" });
    const b = await person(hr, "9022");
    const r = await createInvitationBatch(hr.actor, { userIds: [a, b], mode: "whatsapp" });
    expect(r.counts).toMatchObject({ whatsapp: 1, print: 1 });
    const email = await createInvitationBatch(hr.actor, { userIds: [a], mode: "email" });
    expect(email.counts).toMatchObject({ email: 0, print: 1 });
  });

  it("karar #201: WhatsApp listesi yeniden açılır, gönderildi işaretlenir; kullanılan/yenilenen davetin bağlantısı silinir", async () => {
    const hr = await createTestUser({ roles: ["hr"] });
    const a = await person(hr, "9031", { phone: "05321112231" });
    const b = await person(hr, "9032", { phone: "05321112232" });
    const { batchId } = await createInvitationBatch(hr.actor, { userIds: [a, b], mode: "whatsapp" });

    let view = await getInvitationBatch(hr.actor, batchId);
    expect(view.rows.map((r) => [r.sicilNo, r.state, !!r.whatsappUrl])).toEqual([
      ["9031", "open", true],
      ["9032", "open", true],
    ]);
    const rowA = view.rows[0]!;
    expect(new URL(rowA.whatsappUrl!).pathname).toBe("/905321112231");
    // Bağlantı veritabanında şifreli; düz metin saklanmaz
    const [stored] = await db().select().from(accountInvitations).where(eq(accountInvitations.id, rowA.invitationId));
    expect(stored?.linkEnc).toBeTruthy();
    expect(stored?.linkEnc).not.toContain("/activate/");

    await markInviteShared(hr.actor, rowA.invitationId);
    await markInviteShared(hr.actor, rowA.invitationId);
    const firstShared = (await getInvitationBatch(hr.actor, batchId)).rows[0]!.sharedAt;
    expect(firstShared).toBeInstanceOf(Date);

    // A bağlantıyla etkinleştirir → satır "used", bağlantı silinir
    const login = await activateWithToken({ token: tokenFromWa(rowA.whatsappUrl!), newPassword: NEW_PASSWORD, sharedDevice: false }, meta());
    expect(login.ok).toBe(true);
    // B yeniden davet edilir → eski davet "revoked", bağlantı silinir
    await reinvite(hr.actor, b, "print");
    view = await getInvitationBatch(hr.actor, batchId);
    expect(view.rows.map((r) => [r.sicilNo, r.state, r.whatsappUrl])).toEqual([
      ["9031", "used", null],
      ["9032", "revoked", null],
    ]);
    expect(view.rows[0]!.sharedAt).toEqual(firstShared);
    const links = await db().select({ linkEnc: accountInvitations.linkEnc }).from(accountInvitations).where(eq(accountInvitations.batchId, batchId));
    expect(links.every((l) => l.linkEnc === null)).toBe(true);
    expect((await recentInvitationBatches(hr.actor)).find((r) => r.id === batchId)).toMatchObject({ whatsapp: 2, open: 0, shared: 1 });
  });

  it("karar #201: süresi dolan davetlerin bağlantıları gece işiyle silinir", async () => {
    const hr = await createTestUser({ roles: ["hr"] });
    const a = await person(hr, "9041", { phone: "05321112241" });
    const { batchId } = await createInvitationBatch(hr.actor, { userIds: [a], mode: "whatsapp" });
    await owner()`update account_invitations set expires_at = now() - interval '1 minute' where batch_id = ${batchId}`;
    expect(await purgeExpiredInviteLinks(systemActor("test"))).toBeGreaterThanOrEqual(1);
    const [row] = await db().select().from(accountInvitations).where(eq(accountInvitations.batchId, batchId));
    expect(row?.linkEnc).toBeNull();
    expect((await getInvitationBatch(hr.actor, batchId)).rows[0]).toMatchObject({ state: "expired", whatsappUrl: null });
  });

  it("karar #199: sınır parametresi, boş seçim, yetki ve owner koruması", async () => {
    const hr = await createTestUser({ roles: ["hr"] });
    const admin = await createTestUser({ roles: ["sysadmin"] });
    const ids = [await person(hr, "9051"), await person(hr, "9052"), await person(hr, "9053")];
    await setSetting(admin.actor, "auth.invite_batch_max", 2);
    await expect(createInvitationBatch(hr.actor, { userIds: ids, mode: "print" })).rejects.toMatchObject({
      code: "invite_batch_too_large",
      details: { max: 2 },
    });
    await setSetting(admin.actor, "auth.invite_batch_max", 200);
    await expect(createInvitationBatch(hr.actor, { userIds: [], mode: "print" })).rejects.toMatchObject({ code: "invite_batch_empty" });

    const trainer = await createTestUser({ roles: ["trainer"] });
    await expect(createInvitationBatch(trainer.actor, { userIds: ids, mode: "print" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listInvitees(trainer.actor)).rejects.toBeInstanceOf(ForbiddenError);

    const boss = await createTestUser({ roles: ["owner"] });
    await expect(createInvitationBatch(hr.actor, { userIds: [boss.userId], mode: "print" })).rejects.toMatchObject({ code: "invite_batch_empty" });
  });

  it("karar #191: geçici şifreli eski hesap toplu davet edilince eski şifre geçersiz olur", async () => {
    const hr = await createTestUser({ roles: ["hr"] });
    const legacy = await createTestUser({ mustChangePassword: true });
    await owner()`update personnel set activated_at = null where user_id = ${legacy.userId}`;
    expect((await inviteStatus(hr.actor, legacy.userId)).state).toBe("not_activated");
    await createInvitationBatch(hr.actor, { userIds: [legacy.userId], mode: "print" });
    expect((await signIn({ sicilNo: legacy.sicilNo, password: TEST_PASSWORD, sharedDevice: false }, meta())).ok).toBe(false);
  });
});
