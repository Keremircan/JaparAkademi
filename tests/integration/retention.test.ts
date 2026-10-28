import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { systemActor } from "@/server/authz/actor";
import { db } from "@/server/db/client";
import {
  accounts,
  auditLog,
  consents,
  importRows,
  loginAttempts,
  mediaAssets,
  notifications,
  personnel,
  sessions,
  settings,
  signatures,
  userRoles,
  users,
} from "@/server/db/schema";
import { withActor } from "@/server/db/with-actor";
import { ForbiddenError, isImmutableViolation, NotFoundError, pgErrorCode, ValidationError } from "@/server/errors";
import { addDays, todayIn } from "@/lib/dates";
import { signIn } from "@/server/services/auth";
import { notify } from "@/server/services/notifications";
import { purgeOldAuditLog, runRetention } from "@/server/services/retention";
import { getSetting, listSettingsFor, updateSettingFromScreen } from "@/server/services/settings";
import { createSignature, uploadSignatureImage } from "@/server/services/signatures";
import { subtractYears } from "@/server/state/retention";
import { headObject } from "@/server/storage/client";
import { owner } from "../support/db";
import { createTestUser, meta, TEST_PASSWORD } from "../support/factories";
import { testSignaturePng } from "../support/signature";

const actor = systemActor("test:retention");
const today = () => todayIn("Europe/Istanbul");

/** Ayrılmış personel: bitiş tarihi verilen kadar yıl önce. */
async function leaver(endDate: string, status: "terminated" | "active" | "passive" = "terminated") {
  const u = await createTestUser();
  await owner()`update personnel set status = ${status}, end_date = ${endDate}, email = ${`${u.sicilNo.toLowerCase()}@japar.test`}, phone = '05550000000', national_id_masked = '123******90' where user_id = ${u.userId}`;
  return u;
}

async function person(userId: string) {
  const [p] = await db().select().from(personnel).where(eq(personnel.userId, userId));
  return p!;
}

describe("Personel anonimleştirme (SPEC 12.3, iş paketi 2.1)", () => {
  it("FG-12.3 süresi dolan ayrılmış personelin kişi verisi silinir, kayıtları kalır", async () => {
    const admin = await createTestUser({ roles: ["sysadmin"] });
    const u = await createTestUser({ roles: ["trainer"] });
    const originalName = (await person(u.userId)).fullName;

    // Oturum ve giriş denemesi, KVKK onayı, imza, aktarım satırı, bildirim
    expect((await signIn({ sicilNo: u.sicilNo, password: TEST_PASSWORD, sharedDevice: false }, meta({ ip: "10.9.9.9" }))).ok).toBe(true);
    const legalId = randomUUID();
    await owner()`insert into legal_texts (id, kind, version, title, body, published_at) values (${legalId}, 'kvkk_personnel', 99, 'KVKK', 'metin', now())`;
    await owner()`insert into consents (id, user_id, legal_text_id, ip, user_agent) values (${randomUUID()}, ${u.userId}, ${legalId}, '10.9.9.9', 'vitest')`;
    const image = await uploadSignatureImage(testSignaturePng(7));
    const signatureId = await withActor(actor, (tx) =>
      createSignature(tx, {
        image,
        signerUserId: u.userId,
        capturedBy: u.userId,
        subjectType: "test",
        subjectId: randomUUID(),
        role: "trainee",
        hash: "a".repeat(64),
        ip: "10.9.9.9",
        userAgent: "vitest",
      }),
    );
    const batchId = randomUUID();
    await owner()`insert into import_batches (id, file_name, file_size, mode, status, total_rows, valid_rows, error_rows, created_by)
                  values (${batchId}, 'p.xlsx', 1, 'existing_staff', 'committed', 1, 1, 0, ${admin.userId})`;
    await owner()`insert into import_rows (id, batch_id, row_number, sicil_no, data, status, user_id, committed_at)
                  values (${randomUUID()}, ${batchId}, 1, ${u.sicilNo}, ${JSON.stringify({ fullName: originalName, sicilNo: u.sicilNo })}::jsonb, 'created', ${u.userId}, now())`;
    await withActor(actor, (tx) => notify(tx, { kind: "assignment_started", userIds: [u.userId], subjectKey: "t", link: "/learn" }));

    await owner()`update personnel set status = 'terminated', end_date = ${subtractYears(today(), 16)}, email = 'kisi@japar.test', phone = '0555' where user_id = ${u.userId}`;

    const result = await runRetention(actor);
    expect(result.anonymized).toBe(1);
    expect(result.images).toBe(1);

    const p = await person(u.userId);
    expect(p.fullName).toMatch(/^Anonim #[0-9A-F]{8}$/);
    expect(p.sicilNo).toMatch(/^ANON-[0-9A-F]{8}$/);
    expect(p).toMatchObject({ email: null, phone: null, nationalIdEnc: null, nationalIdHmac: null, nationalIdMasked: null });
    expect(p.anonymizedAt).toBeInstanceOf(Date);

    const [user] = await db().select().from(users).where(eq(users.id, u.userId));
    expect(user!.email).toMatch(/@anonim\.invalid$/);
    expect(user!.name).toBe(p.fullName);

    // Giriş kapalı
    for (const t of [sessions, accounts]) expect(await db().select().from(t).where(eq(t.userId, u.userId))).toHaveLength(0);
    expect(await db().select().from(userRoles).where(eq(userRoles.userId, u.userId))).toHaveLength(0);
    expect((await signIn({ sicilNo: u.sicilNo, password: TEST_PASSWORD, sharedDevice: false }, meta())).ok).toBe(false);

    // Değiştirilemez kayıtlar duruyor, kişi verisi temizlendi
    const attempts = await db().select().from(loginAttempts).where(eq(loginAttempts.userId, u.userId));
    expect(attempts.length).toBeGreaterThan(0);
    expect(attempts.every((a) => a.ip === null && a.userAgent === null)).toBe(true);
    const [consent] = await db().select().from(consents).where(eq(consents.userId, u.userId));
    expect(consent).toMatchObject({ ip: null, userAgent: null });
    const [sig] = await db().select().from(signatures).where(eq(signatures.id, signatureId));
    expect(sig).toMatchObject({ ip: null, userAgent: null, subjectHash: "a".repeat(64) });
    const [asset] = await db().select().from(mediaAssets).where(eq(mediaAssets.id, sig!.imageAssetId!));
    expect(asset!.status).toBe("purged");
    expect(await headObject(image.key)).toBeNull();
    const [row] = await db().select().from(importRows).where(eq(importRows.userId, u.userId));
    expect(row).toMatchObject({ data: {}, sicilNo: null });

    // Bildirimler silindi; sistem yöneticisine özet bildirim
    expect(await db().select().from(notifications).where(eq(notifications.userId, u.userId))).toHaveLength(0);
    const adminNotes = await db().select().from(notifications).where(eq(notifications.userId, admin.userId));
    expect(adminNotes.map((n) => n.kind)).toContain("retention_completed");

    // Denetim kaydında ad, sicil, e-posta ve IP kalmadı
    const leaks = await db()
      .select({ id: auditLog.id })
      .from(auditLog)
      .where(
        sql`(${auditLog.oldData}::text || coalesce(${auditLog.newData}::text, '')) ~ ${`(${originalName}|${u.sicilNo}|kisi@japar.test|10\\.9\\.9\\.9)`}`,
      );
    expect(leaks).toHaveLength(0);
  });

  it("süre sınırı: bugün dolan anonimleştirilir, yarın dolan, aktif ve pasif personel beklenir", async () => {
    const due = await leaver(subtractYears(today(), 15));
    const notYet = await leaver(addDays(subtractYears(today(), 15), 1));
    const active = await leaver(subtractYears(today(), 30), "active");
    const passive = await leaver(subtractYears(today(), 30), "passive");

    expect((await runRetention(actor)).anonymized).toBe(1);
    expect((await person(due.userId)).anonymizedAt).not.toBeNull();
    for (const u of [notYet, active, passive]) expect((await person(u.userId)).anonymizedAt).toBeNull();
  });

  it("saklama süresi parametreden okunur ve iş tekrar çalışınca bir şey değişmez", async () => {
    const admin = await createTestUser({ roles: ["sysadmin"] });
    await updateSettingFromScreen(admin.actor, { key: "retention.personnel_years_after_exit", value: 2, note: "Hukuk onayı 2026-10-27 test" });
    const u = await leaver(subtractYears(today(), 3));
    expect((await runRetention(actor)).anonymized).toBe(1);
    const first = await person(u.userId);
    expect((await runRetention(actor)).anonymized).toBe(0);
    expect(await person(u.userId)).toEqual(first);
  });

  it("uygulama rolü değiştirilemez kayıtları saklama bayrağıyla da değiştiremez", async () => {
    const u = await createTestUser();
    await signIn({ sicilNo: u.sicilNo, password: TEST_PASSWORD, sharedDevice: false }, meta());
    const err = await db()
      .transaction(async (tx) => {
        await tx.execute(sql`select set_config('app.retention_job', 'on', true)`);
        await tx.update(loginAttempts).set({ ip: null }).where(eq(loginAttempts.userId, u.userId));
      })
      .catch((e: unknown) => e);
    expect(isImmutableViolation(err)).toBe(true);
  });

  it("aktif personel fonksiyon doğrudan çağrılsa da anonimleştirilmez", async () => {
    const u = await createTestUser();
    const rows = await db().execute(sql`select app_anonymize_people(array[${u.userId}]::uuid[])`);
    expect(rows).toHaveLength(0);
    expect((await person(u.userId)).anonymizedAt).toBeNull();
  });
});

describe("Denetim kaydı saklama süresi", () => {
  it("süresi dolan denetim satırları silinir, yenileri kalır", async () => {
    await createTestUser();
    await owner()`insert into audit_log (at, table_name, record_id, action) values (now() - interval '16 years', 'test', 'eski', 'INSERT')`;
    const before = await db().select({ n: sql<number>`count(*)::int` }).from(auditLog);
    expect(await purgeOldAuditLog(actor)).toBe(1);
    const after = await db().select({ n: sql<number>`count(*)::int` }).from(auditLog);
    expect(after[0]!.n).toBe(before[0]!.n - 1);
  });

  it("son bir yılın denetim kaydı hiçbir koşulda silinemez", async () => {
    const err = await db()
      .execute(sql`select app_purge_audit(now() - interval '1 month')`)
      .catch((e: unknown) => e);
    expect(pgErrorCode(err)).toBe("JA001");
  });
});

describe("Parametreler ekranı (iş paketi 2.1)", () => {
  it("herkes yalnızca yönettiği parametreleri görür", async () => {
    const admin = await createTestUser({ roles: ["sysadmin"] });
    const ohs = await createTestUser({ roles: ["ohs_specialist"] });
    const sysKeys = (await listSettingsFor(admin.actor)).map((r) => r.key);
    const ohsKeys = (await listSettingsFor(ohs.actor)).map((r) => r.key);
    // İSG uzmanı: İSG parametreleri ve ziyaretçi tipleri (iş paketi 2.2)
    expect(ohsKeys.every((k) => k.startsWith("ohs.") || k === "visitor.types")).toBe(true);
    expect(ohsKeys).toContain("visitor.types");
    expect(ohsKeys).toContain("ohs.hazard_class");
    expect(sysKeys.some((k) => k.startsWith("ohs."))).toBe(false);
    expect(sysKeys).not.toContain("certificate.signatories");
    expect(sysKeys).toContain("retention.audit_years");
    for (const roles of [["hr"], ["section_manager"], []] as const) {
      const u = await createTestUser({ roles: [...roles] });
      await expect(listSettingsFor(u.actor)).rejects.toBeInstanceOf(ForbiddenError);
    }
  });

  it("İSG uzmanı tehlike sınıfını ayarlar; değişiklik ve gerekçe kaydedilir", async () => {
    const ohs = await createTestUser({ roles: ["ohs_specialist"] });
    await updateSettingFromScreen(ohs.actor, { key: "ohs.hazard_class", value: "high", note: "Risk değerlendirmesi" });
    expect(await getSetting("ohs.hazard_class")).toBe("high");
    const [row] = await db().select().from(settings).where(eq(settings.key, "ohs.hazard_class"));
    expect(row).toMatchObject({ updatedBy: ohs.userId, changeNote: "Risk değerlendirmesi" });
    const [audit] = await db()
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.tableName, "settings"), eq(auditLog.recordId, "ohs.hazard_class")));
    expect(audit?.newData).toMatchObject({ change_note: "Risk değerlendirmesi", value: "high" });
    const [item] = (await listSettingsFor(ohs.actor)).filter((r) => r.key === "ohs.hazard_class");
    expect(item).toMatchObject({ value: "high", isDefault: false, changeNote: "Risk değerlendirmesi" });
    // Ayarlanmamış duruma (null) geri dönülebilir
    await updateSettingFromScreen(ohs.actor, { key: "ohs.hazard_class", value: null });
    expect(await getSetting("ohs.hazard_class")).toBeNull();
    await updateSettingFromScreen(ohs.actor, { key: "ohs.hazard_class", value: "low" });
    await updateSettingFromScreen(ohs.actor, { key: "ohs.hazard_class", reset: true });
    expect(await getSetting("ohs.hazard_class")).toBeNull();
  });

  it("saklama süresinde gerekçe zorunlu, saat dilimi salt okunur, geçersiz değer reddedilir", async () => {
    const admin = await createTestUser({ roles: ["sysadmin"] });
    await expect(updateSettingFromScreen(admin.actor, { key: "retention.audit_years", value: 20 })).rejects.toMatchObject({ code: "setting_note_required" });
    await expect(updateSettingFromScreen(admin.actor, { key: "retention.audit_years", value: 20, note: "kısa" })).rejects.toBeInstanceOf(ValidationError);
    await expect(updateSettingFromScreen(admin.actor, { key: "org.timezone", value: "UTC" })).rejects.toMatchObject({ code: "setting_readonly" });
    await expect(updateSettingFromScreen(admin.actor, { key: "exam.theory.pass_score", value: 101 })).rejects.toMatchObject({ code: "invalid_setting" });
    await expect(updateSettingFromScreen(admin.actor, { key: "yok.boyle", value: 1 })).rejects.toBeInstanceOf(NotFoundError);
    await expect(updateSettingFromScreen(admin.actor, { key: "certificate.signatories", value: [] })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("başkasının parametresi değiştirilemez; varsayılana dönülebilir", async () => {
    const admin = await createTestUser({ roles: ["sysadmin"] });
    const ohs = await createTestUser({ roles: ["ohs_specialist"] });
    await expect(updateSettingFromScreen(ohs.actor, { key: "exam.theory.pass_score", value: 60 })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(updateSettingFromScreen(admin.actor, { key: "ohs.hazard_class", value: "low" })).rejects.toBeInstanceOf(ForbiddenError);
    await updateSettingFromScreen(admin.actor, { key: "exam.theory.pass_score", value: 60 });
    expect(await getSetting("exam.theory.pass_score")).toBe(60);
    await updateSettingFromScreen(admin.actor, { key: "exam.theory.pass_score", reset: true });
    expect(await getSetting("exam.theory.pass_score")).toBe(70);
  });
});
