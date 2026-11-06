import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { systemActor } from "@/server/authz/actor";
import { db } from "@/server/db/client";
import { accountInvitations, auditLog, loginAttempts, mediaAssets, personErasures, personnel, signatures } from "@/server/db/schema";
import { withActor } from "@/server/db/with-actor";
import { ForbiddenError, isImmutableViolation, ValidationError } from "@/server/errors";
import { todayIn } from "@/lib/dates";
import { signIn } from "@/server/services/auth";
import { erasePerson, erasureInfo } from "@/server/services/erasure";
import { reinvite } from "@/server/services/invitations";
import { setPersonStatus, updatePerson } from "@/server/services/people";
import { setRoles } from "@/server/services/roles";
import { createSignature, uploadSignatureImage } from "@/server/services/signatures";
import { headObject } from "@/server/storage/client";
import { owner } from "../support/db";
import { createTestUser, meta, TEST_PASSWORD } from "../support/factories";
import { testSignaturePng } from "../support/signature";

const today = () => todayIn("Europe/Istanbul");
const REASON = "KVKK silme talebi, test başvurusu";

async function person(userId: string) {
  const [p] = await db().select().from(personnel).where(eq(personnel.userId, userId));
  return p!;
}

/** Üst yönetici + işten ayrılmış kişi. */
async function setup(opts: { terminate?: boolean } = {}) {
  const boss = await createTestUser({ roles: ["owner"] });
  const target = await createTestUser({ email: `${randomUUID().slice(0, 8)}@japar.test`, phone: "+905551112233" });
  if (opts.terminate !== false) await setPersonStatus(boss.actor, target.userId, { status: "terminated", endDate: today() });
  const name = (await person(target.userId)).fullName;
  return { boss, target, name, phrase: `${name} silmeyi onaylıyorum` };
}

async function expectError(p: Promise<unknown>, type: typeof ValidationError | typeof ForbiddenError, code: string) {
  const err = await p.catch((e: unknown) => e);
  expect(err).toBeInstanceOf(type);
  // ForbiddenError'da kod hep "forbidden"; neden `permission` alanında
  if (err instanceof ForbiddenError) expect(err.permission).toBe(code);
  else expect((err as { code: string }).code).toBe(code);
}

describe("Kişiyi kalıcı silme (kararlar #264–267)", () => {
  it("karar #264: yalnızca üst yönetici siler; İK ve sistem yöneticisi silemez", async () => {
    const { target, phrase } = await setup();
    for (const roles of [["hr"], ["sysadmin"], ["hr", "sysadmin"]] as const) {
      const other = await createTestUser({ roles: [...roles] });
      await expectError(erasePerson(other.actor, target.userId, { reason: REASON, confirmation: phrase }), ForbiddenError, "people.erase");
    }
    expect((await person(target.userId)).anonymizedAt).toBeNull();
  });

  it("karar #264: yalnızca işten ayrılmış kişi silinir; üst yönetici kendini silemez", async () => {
    const { boss, target, phrase } = await setup({ terminate: false });
    await expectError(erasePerson(boss.actor, target.userId, { reason: REASON, confirmation: phrase }), ValidationError, "person_not_terminated");
    await setPersonStatus(boss.actor, target.userId, { status: "passive" });
    await expectError(erasePerson(boss.actor, target.userId, { reason: REASON, confirmation: phrase }), ValidationError, "person_not_terminated");
    await expectError(erasePerson(boss.actor, boss.userId, { reason: REASON, confirmation: phrase }), ForbiddenError, "self_action");
    expect((await person(target.userId)).anonymizedAt).toBeNull();
  });

  it("karar #265: onay metni eşleşmeli ve gerekçe yazılmalı; aksi hâlde hiçbir şey değişmez", async () => {
    const { boss, target, phrase } = await setup();
    await expectError(erasePerson(boss.actor, target.userId, { reason: REASON, confirmation: "silmeyi onaylıyorum" }), ValidationError, "erase_confirmation_mismatch");
    await expectError(erasePerson(boss.actor, target.userId, { reason: REASON, confirmation: "Başka Kişi silmeyi onaylıyorum" }), ValidationError, "erase_confirmation_mismatch");
    await expectError(erasePerson(boss.actor, target.userId, { reason: "  ", confirmation: phrase }), ValidationError, "erase_reason_required");
    expect((await person(target.userId)).anonymizedAt).toBeNull();
    expect(await db().select().from(personErasures).where(eq(personErasures.userId, target.userId))).toHaveLength(0);
  });

  it("FG-12.3 karar #264/#267: kişisel veri hemen silinir, kayıtlar isimsiz kalır, imza görseli depodan silinir", async () => {
    const { boss, target, name, phrase } = await setup();
    // Önceki giriş, imza ve kullanılmamış WhatsApp daveti
    await setPersonStatus(boss.actor, target.userId, { status: "active" });
    expect((await signIn({ sicilNo: target.sicilNo, password: TEST_PASSWORD, sharedDevice: false }, meta({ ip: "10.7.7.7" }))).ok).toBe(true);
    const image = await uploadSignatureImage(testSignaturePng(3));
    const signatureId = await withActor(systemActor("test:erasure"), (tx) =>
      createSignature(tx, {
        image,
        signerUserId: target.userId,
        capturedBy: target.userId,
        subjectType: "test",
        subjectId: randomUUID(),
        role: "trainee",
        hash: "b".repeat(64),
        ip: "10.7.7.7",
        userAgent: "vitest",
      }),
    );
    const inviteId = randomUUID();
    await owner()`insert into account_invitations (id, user_id, channel, token_hash, expires_at, link_enc, created_by)
                  values (${inviteId}, ${target.userId}, 'whatsapp', ${randomUUID()}, now() + interval '3 days', 'sifreli-baglanti', ${boss.userId})`;
    await setPersonStatus(boss.actor, target.userId, { status: "terminated", endDate: today() });

    // İngilizce ekrandaki onay metni de kabul edilir; harf büyüklüğü önemsiz
    const { label } = await erasePerson(boss.actor, target.userId, { reason: ` ${REASON} `, confirmation: `i confirm deleting ${name.toUpperCase()}` });
    expect(phrase).toContain(name);
    expect(label).toMatch(/^Anonim #[0-9A-F]{8}$/);

    const p = await person(target.userId);
    expect(p.fullName).toBe(label);
    expect(p.sicilNo).toMatch(/^ANON-[0-9A-F]{12}$/);
    expect(label).toBe(`Anonim #${p.sicilNo.slice(-8)}`);
    expect(p).toMatchObject({ email: null, phone: null, nationalIdMasked: null });
    expect(p.anonymizedAt).toBeInstanceOf(Date);
    expect((await signIn({ sicilNo: target.sicilNo, password: TEST_PASSWORD, sharedDevice: false }, meta())).ok).toBe(false);

    // Silme kaydı: kim, gerekçe (kırpılmış)
    const [record] = await db().select().from(personErasures).where(eq(personErasures.userId, target.userId));
    expect(record).toMatchObject({ erasedBy: boss.userId, reason: REASON });
    expect(await erasureInfo(boss.actor, target.userId)).toMatchObject({ reason: REASON, erasedByName: (await person(boss.userId)).fullName });

    // Kayıtlar duruyor, IP/cihaz silindi; imza görseli depodan silindi
    const attempts = await db().select().from(loginAttempts).where(eq(loginAttempts.userId, target.userId));
    expect(attempts.length).toBeGreaterThan(0);
    expect(attempts.every((a) => a.ip === null)).toBe(true);
    const [sig] = await db().select().from(signatures).where(eq(signatures.id, signatureId));
    expect(sig).toMatchObject({ ip: null, subjectHash: "b".repeat(64) });
    const [asset] = await db().select().from(mediaAssets).where(eq(mediaAssets.id, sig!.imageAssetId!));
    expect(asset!.status).toBe("purged");
    expect(await headObject(image.key)).toBeNull();

    // Davet geçersiz, saklanan bağlantı silindi: kişiye yeniden hesap açılamaz
    const [invite] = await db().select().from(accountInvitations).where(eq(accountInvitations.id, inviteId));
    expect(invite!.linkEnc).toBeNull();
    expect(invite!.revokedAt).toBeInstanceOf(Date);

    // Denetim kaydında ad, sicil, e-posta kalmadı
    const leaks = await db()
      .select({ id: auditLog.id })
      .from(auditLog)
      .where(sql`(${auditLog.oldData}::text || coalesce(${auditLog.newData}::text, '')) ~ ${`(${name}|${target.sicilNo}|10\\.7\\.7\\.7)`}`);
    expect(leaks).toHaveLength(0);
  });

  it("karar #266: silinmiş kişi değiştirilemez, yeniden etkinleştirilemez, davet edilemez, ikinci kez silinemez", async () => {
    const { boss, target, phrase } = await setup();
    await erasePerson(boss.actor, target.userId, { reason: REASON, confirmation: phrase });
    const hr = await createTestUser({ roles: ["hr"] });

    await expectError(updatePerson(hr.actor, target.userId, { fullName: "Geri Gelen Ad", employmentType: "employee", trainingRequired: false }), ValidationError, "person_erased");
    await expectError(setPersonStatus(hr.actor, target.userId, { status: "active" }), ValidationError, "person_erased");
    await expectError(setRoles(boss.actor, target.userId, ["trainer"]), ValidationError, "person_erased");
    await expectError(reinvite(hr.actor, target.userId, "print"), ValidationError, "person_erased");
    await expectError(erasePerson(boss.actor, target.userId, { reason: REASON, confirmation: phrase }), ValidationError, "person_erased");
    expect((await person(target.userId)).status).toBe("terminated");
  });

  it("karar #268: aynı dakikada açılan kişiler ayrı ayrı silinir; anonim sicil ve kullanıcı adı çakışmaz", async () => {
    const { boss, target, phrase } = await setup();
    // UUIDv7: art arda açılan hesapların kimlikleri aynı zaman önekiyle başlar
    const twin = await createTestUser();
    expect(twin.userId.slice(0, 8)).toBe(target.userId.slice(0, 8));
    await setPersonStatus(boss.actor, twin.userId, { status: "terminated", endDate: today() });
    const twinName = (await person(twin.userId)).fullName;

    await erasePerson(boss.actor, target.userId, { reason: REASON, confirmation: phrase });
    await erasePerson(boss.actor, twin.userId, { reason: REASON, confirmation: `${twinName} silmeyi onaylıyorum` });
    const [a, b] = [await person(target.userId), await person(twin.userId)];
    expect(a.anonymizedAt).toBeInstanceOf(Date);
    expect(b.anonymizedAt).toBeInstanceOf(Date);
    expect(a.sicilNo).not.toBe(b.sicilNo);
    const users = await owner()<{ username: string }[]>`select username from users where id in (${target.userId}, ${twin.userId})`;
    expect(new Set(users.map((u) => u.username)).size).toBe(2);
  });

  it("karar #267: silme kaydı değiştirilemez ve silinemez", async () => {
    const { boss, target, phrase } = await setup();
    await erasePerson(boss.actor, target.userId, { reason: REASON, confirmation: phrase });
    const update = await db()
      .update(personErasures)
      .set({ reason: "değişti" })
      .where(eq(personErasures.userId, target.userId))
      .catch((e: unknown) => e);
    expect(isImmutableViolation(update)).toBe(true);
    const del = await db()
      .delete(personErasures)
      .where(eq(personErasures.userId, target.userId))
      .catch((e: unknown) => e);
    expect(isImmutableViolation(del)).toBe(true);
  });
});
