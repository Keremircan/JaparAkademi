import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { auditLog, sessions } from "@/server/db/schema";
import { loadSessionUser, setPreferredTextSize, signIn } from "@/server/services/auth";
import { owner } from "../support/db";
import { createTestUser, meta, TEST_PASSWORD } from "../support/factories";

describe("Kompakt arayüz ve yazı boyutu (iş paketi 3.6, karar #244)", () => {
  it("SPEC 13.1 büyük yazı seçeneği: tercih hesapta saklanır, oturumda döner, denetime kişi adına yazılır; geçersiz değer reddedilir", async () => {
    const u = await createTestUser();
    expect(await signIn({ sicilNo: u.sicilNo, password: TEST_PASSWORD, sharedDevice: false }, meta())).toMatchObject({ ok: true });
    const [s] = await db().select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, u.userId));
    const session = await loadSessionUser(s!.id);
    expect(session?.textSize).toBe("normal");

    await setPreferredTextSize(session!, "large");
    expect((await loadSessionUser(s!.id))?.textSize).toBe("large");
    const audits = await db()
      .select({ actorId: auditLog.actorId, newData: auditLog.newData })
      .from(auditLog)
      .where(and(eq(auditLog.tableName, "personnel"), eq(auditLog.recordId, u.userId)));
    expect(audits.some((a) => a.actorId === u.userId && (a.newData as { text_size?: string } | null)?.text_size === "large")).toBe(true);

    await setPreferredTextSize(session!, "normal");
    expect((await loadSessionUser(s!.id))?.textSize).toBe("normal");
    await expect(owner()`update personnel set text_size = 'huge' where user_id = ${u.userId}`).rejects.toThrow();
  });
});
