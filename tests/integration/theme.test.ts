import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { auditLog, sessions } from "@/server/db/schema";
import { loadSessionUser, setPreferredTheme, signIn } from "@/server/services/auth";
import { owner } from "../support/db";
import { createTestUser, meta, TEST_PASSWORD } from "../support/factories";

describe("Koyu/açık mod (iş paketi 3.12, karar #272)", () => {
  it("karar #272 görünüm tercihi: hesapta saklanır, oturumda döner, denetime kişi adına yazılır; geçersiz değer reddedilir", async () => {
    const u = await createTestUser();
    expect(await signIn({ sicilNo: u.sicilNo, password: TEST_PASSWORD, sharedDevice: false }, meta())).toMatchObject({ ok: true });
    const [s] = await db().select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, u.userId));
    const session = await loadSessionUser(s!.id);
    expect(session?.theme).toBe("system");

    await setPreferredTheme(session!, "dark");
    expect((await loadSessionUser(s!.id))?.theme).toBe("dark");
    const audits = await db()
      .select({ actorId: auditLog.actorId, newData: auditLog.newData })
      .from(auditLog)
      .where(and(eq(auditLog.tableName, "personnel"), eq(auditLog.recordId, u.userId)));
    expect(audits.some((a) => a.actorId === u.userId && (a.newData as { theme?: string } | null)?.theme === "dark")).toBe(true);

    await setPreferredTheme(session!, "light");
    expect((await loadSessionUser(s!.id))?.theme).toBe("light");
    await setPreferredTheme(session!, "system");
    expect((await loadSessionUser(s!.id))?.theme).toBe("system");
    await expect(owner()`update personnel set theme = 'blue' where user_id = ${u.userId}`).rejects.toThrow();
  });
});
