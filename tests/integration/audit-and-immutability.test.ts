import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { systemActor } from "@/server/authz/actor";
import { db } from "@/server/db/client";
import { accounts, auditLog, corrections, loginAttempts } from "@/server/db/schema";
import { withActor } from "@/server/db/with-actor";
import { isImmutableViolation, pgErrorCode } from "@/server/errors";
import { setSetting } from "@/server/services/settings";
import { createTestUser } from "../support/factories";

describe("Denetim kaydı (SPEC 7)", () => {
  it("değişiklikler aktör ve istek kimliğiyle audit_log'a yazılır", async () => {
    const { actor } = await createTestUser({ roles: ["sysadmin"] });
    await setSetting(actor, "session.shared_idle_min", 7);

    const rows = await db()
      .select()
      .from(auditLog)
      .where(eq(auditLog.tableName, "settings"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: "INSERT",
      actorId: actor.userId,
      recordId: "session.shared_idle_min",
    });
    expect(rows[0]?.requestId).toBeTruthy();
    expect(rows[0]?.newData).toMatchObject({ key: "session.shared_idle_min", value: 7 });
  });

  it("sistem işlemleri aktörsüz, 'system:<ad>' istek kimliğiyle kaydedilir", async () => {
    await createTestUser();
    const [row] = await db()
      .select()
      .from(auditLog)
      .where(eq(auditLog.tableName, "personnel"));
    expect(row?.actorId).toBeNull();
    expect(row?.requestId).toBe("system:test");
  });

  it("şifre özeti denetim kaydına maskeli yazılır", async () => {
    await createTestUser();
    const [row] = await db()
      .select({ newData: auditLog.newData })
      .from(auditLog)
      .where(eq(auditLog.tableName, "accounts"));
    expect((row?.newData as Record<string, unknown>).password).toBe("***");
  });

  it("uygulama kullanıcısı audit_log'a yazamaz, güncelleyemez, silemez", async () => {
    await createTestUser();
    for (const attempt of [
      () => db().execute(sql`insert into audit_log (table_name, action) values ('x', 'INSERT')`),
      () => db().execute(sql`update audit_log set action = 'X'`),
      () => db().execute(sql`delete from audit_log`),
    ]) {
      const err = await attempt().catch((e: unknown) => e);
      expect(pgErrorCode(err)).toBe("42501"); // insufficient_privilege
    }
  });
});

describe("Değiştirilemez kayıtlar (SPEC 7)", () => {
  async function createCorrection() {
    const { actor } = await createTestUser({ roles: ["hr"] });
    const [row] = await withActor(actor, (tx) =>
      tx
        .insert(corrections)
        .values({ targetTable: "exam_attempts", targetId: "x", field: "score", reason: "Yanlış okundu", createdBy: actor.userId })
        .returning(),
    );
    return row!;
  }

  it("düzeltme kaydı güncellenemez", async () => {
    const row = await createCorrection();
    const err = await withActor(systemActor("test"), (tx) =>
      tx.update(corrections).set({ reason: "değişti" }).where(eq(corrections.id, row.id)),
    ).catch((e: unknown) => e);
    expect(isImmutableViolation(err)).toBe(true);
  });

  it("düzeltme kaydı silinemez", async () => {
    const row = await createCorrection();
    const err = await withActor(systemActor("test"), (tx) =>
      tx.delete(corrections).where(eq(corrections.id, row.id)),
    ).catch((e: unknown) => e);
    expect(isImmutableViolation(err)).toBe(true);
  });

  it("giriş denemesi kaydı değiştirilemez", async () => {
    await withActor(systemActor("test"), (tx) =>
      tx.insert(loginAttempts).values({ sicilInput: "1", result: "unknown_user" }),
    );
    const err = await withActor(systemActor("test"), (tx) =>
      tx.update(loginAttempts).set({ result: "success" }),
    ).catch((e: unknown) => e);
    expect(isImmutableViolation(err)).toBe(true);
  });

  it("değişiklik içermeyen güncelleme engellenmez", async () => {
    const row = await createCorrection();
    await expect(
      withActor(systemActor("test"), (tx) =>
        tx.update(corrections).set({ reason: row.reason }).where(eq(corrections.id, row.id)),
      ),
    ).resolves.not.toThrow();
  });
});

describe("Kilit sütunlu değiştirilemezlik (prevent_mutation argümanları)", () => {
  it("kilit sütunu boşken izinli sütun değişir; kilit dolunca kayıt donar", async () => {
    // Sınav denemesi tablosu 1.5'te gelecek; trigger davranışı geçici bir tabloyla doğrulanır.
    await db().execute(sql`select 1`);
    const { owner } = await import("../support/db");
    const o = owner();
    await o.unsafe(`
      create table if not exists _immut_test (id int primary key, answer text, submitted_at timestamptz, note text);
      grant select, insert, update, delete on _immut_test to akademi_app;
      select app_attach_immutable('_immut_test', '{answer}', 'submitted_at');
    `);
    try {
      await db().execute(sql`insert into _immut_test (id, answer) values (1, 'A')`);
      await db().execute(sql`update _immut_test set answer = 'B' where id = 1`);

      const notAllowed = await db().execute(sql`update _immut_test set note = 'x' where id = 1`).catch((e: unknown) => e);
      expect(isImmutableViolation(notAllowed)).toBe(true);

      await db().execute(sql`update _immut_test set submitted_at = now() where id = 1`);
      const afterLock = await db().execute(sql`update _immut_test set answer = 'C' where id = 1`).catch((e: unknown) => e);
      expect(isImmutableViolation(afterLock)).toBe(true);
    } finally {
      await o.unsafe(`drop table if exists _immut_test`);
    }
  });
});

describe("Hesap tabloları", () => {
  it("şifre özeti düz metin değildir", async () => {
    const { userId } = await createTestUser();
    const [acc] = await db().select({ password: accounts.password }).from(accounts).where(eq(accounts.userId, userId));
    expect(acc?.password).toBeTruthy();
    expect(acc?.password).not.toContain("Kl8#mxPq2");
  });
});
