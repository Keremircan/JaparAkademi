import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { auditLog, dataAccessLog, personnel, sessions } from "@/server/db/schema";
import { withActor } from "@/server/db/with-actor";
import { ForbiddenError, isImmutableViolation } from "@/server/errors";
import { signIn } from "@/server/services/auth";
import {
  createPerson,
  getPerson,
  listPeople,
  revealNationalId,
  setPersonStatus,
  updatePerson,
} from "@/server/services/people";
import { createTestUser, meta, TEST_PASSWORD } from "../support/factories";
import { seedTestOrg } from "../support/org";

const base = { employmentType: "employee" as const, trainingRequired: true, channel: "print" as const };

/** Davetle açılan kişi: davet bilgisi + kişi kimliği. */
async function invited(...args: Parameters<typeof createPerson>) {
  const r = await createPerson(...args);
  return { ...r.invite!, userId: r.userId };
}

describe("Personel kaydı (ekran 15)", () => {
  it("karar #185: İK yeni personel açar; hesap şifresiz açılır ve basılı davet kodu bir kez döner", async () => {
    const org = await seedTestOrg();
    const hr = await createTestUser({ roles: ["hr"] });
    const invite = await invited(hr.actor, {
      ...base,
      sicilNo: "5001",
      fullName: "Yeni Kişi",
      positionId: org.positions.presOp,
      hireDate: "2026-11-02",
    });
    const userId = invite.userId;
    expect(invite).toMatchObject({ channel: "print", sicilNo: "5001", whatsappUrl: null });
    expect(invite.code).toMatch(/^\d{4} \d{4}$/);
    // Etkinleştirmeden önce hiçbir şifreyle giriş yapılamaz
    expect((await signIn({ sicilNo: "5001", password: invite.code!.replace(" ", ""), sharedDevice: false }, meta())).ok).toBe(false);

    const person = await getPerson(hr.actor, userId);
    expect(person).toMatchObject({ positionId: org.positions.presOp, hireDate: "2026-11-02", source: "manual", trainingRequired: true });
  });

  it("TC şifreli saklanır, maskeli gösterilir; denetim kaydında şifreli değer maskelidir", async () => {
    const hr = await createTestUser({ roles: ["hr"] });
    const { userId } = await createPerson(hr.actor, { ...base, sicilNo: "5002", fullName: "TC Kişi", nationalId: "100 000 001 46" });
    const [row] = await db().select().from(personnel).where(eq(personnel.userId, userId));
    expect(row?.nationalIdMasked).toBe("100******46");
    expect(row?.nationalIdEnc).toMatch(/^v1:/);
    expect(row?.nationalIdEnc).not.toContain("10000000146");

    const [audit] = await db()
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.recordId, userId), eq(auditLog.tableName, "personnel")));
    const data = audit?.newData as Record<string, unknown>;
    expect(data.national_id_enc).toBe("***");
    expect(data.national_id_hmac).toBe("***");
  });

  it("geçersiz veya başkasına kayıtlı TC reddedilir", async () => {
    const hr = await createTestUser({ roles: ["hr"] });
    await expect(createPerson(hr.actor, { ...base, sicilNo: "5003", fullName: "A", nationalId: "10000000147" })).rejects.toMatchObject({
      code: "national_id_invalid",
    });
    await createPerson(hr.actor, { ...base, sicilNo: "5004", fullName: "B Kişi", nationalId: "10000000146" });
    await expect(createPerson(hr.actor, { ...base, sicilNo: "5005", fullName: "C Kişi", nationalId: "10000000146" })).rejects.toMatchObject({
      code: "national_id_taken",
    });
  });

  it("TC'nin tamamını yalnızca İK görür ve her görüntüleme kaydedilir (değiştirilemez)", async () => {
    const hr = await createTestUser({ roles: ["hr"] });
    const { userId } = await createPerson(hr.actor, { ...base, sicilNo: "5006", fullName: "D Kişi", nationalId: "10000000146" });

    for (const roles of [["sysadmin"], ["section_manager"], []] as const) {
      const other = await createTestUser({ roles: [...roles] });
      await expect(revealNationalId(other.actor, userId)).rejects.toBeInstanceOf(ForbiddenError);
    }
    expect(await revealNationalId(hr.actor, userId)).toBe("10000000146");

    const logs = await db().select().from(dataAccessLog).where(eq(dataAccessLog.subjectUserId, userId));
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ actorId: hr.userId, field: "national_id" });

    const err = await withActor(hr.actor, (tx) => tx.delete(dataAccessLog)).catch((e: unknown) => e);
    expect(isImmutableViolation(err)).toBe(true);
  });

  it("güncellemede TC boş bırakılırsa mevcut değer korunur", async () => {
    const hr = await createTestUser({ roles: ["hr"] });
    const { userId } = await createPerson(hr.actor, { ...base, sicilNo: "5007", fullName: "E Kişi", nationalId: "10000000146" });
    await updatePerson(hr.actor, userId, { ...base, fullName: "E. Kişi Güncel", nationalId: null, phone: "0532 111 22 33" });
    const person = await getPerson(hr.actor, userId);
    // Telefon +90 biçiminde saklanır (karar #188)
    expect(person).toMatchObject({ fullName: "E. Kişi Güncel", nationalIdMasked: "100******46", phone: "+905321112233" });
    await expect(updatePerson(hr.actor, userId, { ...base, fullName: "E. Kişi", phone: "12345" })).rejects.toMatchObject({ code: "phone_invalid" });
  });

  it("pasife alınan personelin oturumları kapanır ve giriş yapamaz", async () => {
    const hr = await createTestUser({ roles: ["hr"] });
    const worker = await createTestUser();
    await signIn({ sicilNo: worker.sicilNo, password: TEST_PASSWORD, sharedDevice: false }, meta());
    await setPersonStatus(hr.actor, worker.userId, { status: "passive" });
    expect(await db().select().from(sessions).where(eq(sessions.userId, worker.userId))).toHaveLength(0);
    expect(await signIn({ sicilNo: worker.sicilNo, password: TEST_PASSWORD, sharedDevice: false }, meta())).toMatchObject({
      reason: "inactive",
    });
  });

  it("işten ayrılış tarih ister; kişi kendini pasife alamaz", async () => {
    const hr = await createTestUser({ roles: ["hr"] });
    const worker = await createTestUser();
    await expect(setPersonStatus(hr.actor, worker.userId, { status: "terminated" })).rejects.toMatchObject({ code: "end_date_required" });
    await setPersonStatus(hr.actor, worker.userId, { status: "terminated", endDate: "2026-12-31" });
    expect((await getPerson(hr.actor, worker.userId)).endDate).toBe("2026-12-31");
    await expect(setPersonStatus(hr.actor, hr.userId, { status: "passive" })).rejects.toMatchObject({ code: "cannot_deactivate_self" });
  });

  it("personel listesi: arama, durum filtresi; yetkisi olmayan roller göremez", async () => {
    const hr = await createTestUser({ roles: ["hr"] });
    await createPerson(hr.actor, { ...base, sicilNo: "6001", fullName: "Şükrü Çağlar" });
    const gone = await createPerson(hr.actor, { ...base, sicilNo: "6002", fullName: "Ayrılan Kişi" });
    await setPersonStatus(hr.actor, gone.userId, { status: "terminated", endDate: "2026-10-01" });

    expect((await listPeople(hr.actor, { q: "şükrü" })).items.map((p) => p.sicilNo)).toEqual(["6001"]);
    expect((await listPeople(hr.actor, { q: "6002" })).total).toBe(0);
    expect((await listPeople(hr.actor, { q: "6002", status: "terminated" })).total).toBe(1);

    for (const roles of [[], ["trainer"], ["section_manager"], ["security"]] as const) {
      const u = await createTestUser({ roles: [...roles] });
      await expect(listPeople(u.actor)).rejects.toBeInstanceOf(ForbiddenError);
    }
  });

  it("sistem yöneticisi personeli görür ve düzenler ama TC'yi açamaz", async () => {
    const admin = await createTestUser({ roles: ["sysadmin"] });
    const { userId } = await createPerson(admin.actor, { ...base, sicilNo: "6003", fullName: "F Kişi", nationalId: "10000000146" });
    expect((await getPerson(admin.actor, userId)).nationalIdMasked).toBe("100******46");
    await expect(revealNationalId(admin.actor, userId)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
