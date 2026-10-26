import { eq } from "drizzle-orm";
import { getAuth, SICIL_PATTERN, syntheticEmail } from "@/server/auth/auth";
import { checkPassword } from "@/server/auth/password-policy";
import type { Actor } from "@/server/authz/actor";
import { assertCan } from "@/server/authz/policy";
import type { Role } from "@/server/authz/roles";
import { db } from "@/server/db/client";
import { accounts, personnel, userRoles, users } from "@/server/db/schema";
import { withActor } from "@/server/db/with-actor";
import { ValidationError } from "@/server/errors";
import { getSetting } from "@/server/services/settings";

export type CreateAccountInput = {
  sicilNo: string;
  fullName: string;
  password: string;
  roles?: readonly Role[];
  mustChangePassword?: boolean;
};

/**
 * Personel hesabı açar (users + credential account + personnel + roller) tek transaction'da.
 * "personnel" rolü her zaman eklenir. Açık kayıt yoktur; yalnızca yetkili aktör çağırabilir.
 * İş paketi 1.1'de Excel aktarımı ve İK ekranı bu fonksiyonu kullanır.
 */
export async function createAccount(actor: Actor, input: CreateAccountInput): Promise<{ userId: string }> {
  assertCan(actor, "people.manage");

  const sicilNo = input.sicilNo.trim();
  const fullName = input.fullName.trim();
  if (!SICIL_PATTERN.test(sicilNo)) throw new ValidationError("invalid_sicil");
  if (fullName.length < 2) throw new ValidationError("invalid_full_name");

  const minLength = await getSetting("auth.password_min_length");
  const issues = checkPassword(input.password, { minLength, sicilNo });
  if (issues.length > 0) throw new ValidationError("weak_password", issues);

  const existing = await db().select({ id: users.id }).from(users).where(eq(users.username, sicilNo)).limit(1);
  if (existing.length > 0) throw new ValidationError("sicil_taken");

  const ctx = await getAuth().$context;
  const passwordHash = await ctx.password.hash(input.password);
  const roles = Array.from(new Set<Role>(["personnel", ...(input.roles ?? [])]));
  const grantedBy = actor.kind === "user" ? actor.userId : null;

  return withActor(actor, async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({ name: fullName, email: syntheticEmail(sicilNo), username: sicilNo })
      .returning({ id: users.id });
    if (!user) throw new Error("Kullanıcı oluşturulamadı");

    await tx.insert(accounts).values({
      accountId: user.id,
      providerId: "credential",
      userId: user.id,
      password: passwordHash,
    });
    await tx.insert(personnel).values({
      userId: user.id,
      sicilNo,
      fullName,
      mustChangePassword: input.mustChangePassword ?? true,
    });
    await tx.insert(userRoles).values(roles.map((role) => ({ userId: user.id, role, grantedBy })));

    return { userId: user.id };
  });
}
