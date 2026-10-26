import { eq } from "drizzle-orm";
import { getAuth, SICIL_PATTERN, syntheticEmail } from "@/server/auth/auth";
import { checkPassword } from "@/server/auth/password-policy";
import type { Actor } from "@/server/authz/actor";
import { assertCan } from "@/server/authz/policy";
import type { Role } from "@/server/authz/roles";
import { db, type Tx } from "@/server/db/client";
import { accounts, personnel, userRoles, users } from "@/server/db/schema";
import { withActor } from "@/server/db/with-actor";
import { ValidationError } from "@/server/errors";
import { getSetting } from "@/server/services/settings";

/** Hesapla birlikte yazılan personel alanları (TC zaten korunmuş hâlde gelir). */
export type PersonnelFields = {
  positionId?: string | null;
  nationalId?: { enc: string; hmac: string; masked: string } | null;
  phone?: string | null;
  email?: string | null;
  employmentType?: "employee" | "intern";
  hireDate?: string | null;
  source?: "excel" | "manual" | "hr_sync";
  trainingRequired?: boolean;
};

export type CreateAccountInput = PersonnelFields & {
  sicilNo: string;
  fullName: string;
  password: string;
  roles?: readonly Role[];
  mustChangePassword?: boolean;
};

export type PreparedAccount = Omit<CreateAccountInput, "password"> & { passwordHash: string };

/** Girdiyi doğrular ve şifreyi özetler (yavaş işlem; toplu aktarımda transaction dışında yapılır). */
export async function prepareAccount(input: CreateAccountInput, minPasswordLength?: number): Promise<PreparedAccount> {
  const sicilNo = input.sicilNo.trim();
  const fullName = input.fullName.trim();
  if (!SICIL_PATTERN.test(sicilNo)) throw new ValidationError("invalid_sicil");
  if (fullName.length < 2) throw new ValidationError("invalid_full_name");

  const minLength = minPasswordLength ?? (await getSetting("auth.password_min_length"));
  const issues = checkPassword(input.password, { minLength, sicilNo });
  if (issues.length > 0) throw new ValidationError("weak_password", issues);

  const ctx = await getAuth().$context;
  const passwordHash = await ctx.password.hash(input.password);
  const rest: Partial<CreateAccountInput> = { ...input };
  delete rest.password;
  return { ...(rest as Omit<CreateAccountInput, "password">), sicilNo, fullName, passwordHash };
}

/** Hazırlanmış hesabı verilen transaction içinde yazar (users + credential account + personnel + roller). */
export async function insertAccount(tx: Tx, prepared: PreparedAccount, grantedBy: string | null): Promise<string> {
  const [user] = await tx
    .insert(users)
    .values({ name: prepared.fullName, email: syntheticEmail(prepared.sicilNo), username: prepared.sicilNo })
    .returning({ id: users.id });
  if (!user) throw new Error("Kullanıcı oluşturulamadı");

  await tx.insert(accounts).values({
    accountId: user.id,
    providerId: "credential",
    userId: user.id,
    password: prepared.passwordHash,
  });
  await tx.insert(personnel).values({
    userId: user.id,
    sicilNo: prepared.sicilNo,
    fullName: prepared.fullName,
    mustChangePassword: prepared.mustChangePassword ?? true,
    positionId: prepared.positionId ?? null,
    nationalIdEnc: prepared.nationalId?.enc ?? null,
    nationalIdHmac: prepared.nationalId?.hmac ?? null,
    nationalIdMasked: prepared.nationalId?.masked ?? null,
    phone: prepared.phone ?? null,
    email: prepared.email ?? null,
    employmentType: prepared.employmentType ?? "employee",
    hireDate: prepared.hireDate ?? null,
    source: prepared.source ?? "manual",
    trainingRequired: prepared.trainingRequired ?? false,
  });
  const roles = Array.from(new Set<Role>(["personnel", ...(prepared.roles ?? [])]));
  await tx.insert(userRoles).values(roles.map((role) => ({ userId: user.id, role, grantedBy })));
  return user.id;
}

/**
 * Personel hesabı açar (tek transaction). "personnel" rolü her zaman eklenir.
 * Açık kayıt yoktur; yalnızca yetkili aktör çağırabilir.
 */
export async function createAccount(actor: Actor, input: CreateAccountInput): Promise<{ userId: string }> {
  assertCan(actor, "people.manage");
  const prepared = await prepareAccount(input);

  const existing = await db()
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, prepared.sicilNo))
    .limit(1);
  if (existing.length > 0) throw new ValidationError("sicil_taken");

  const grantedBy = actor.kind === "user" ? actor.userId : null;
  const userId = await withActor(actor, (tx) => insertAccount(tx, prepared, grantedBy));
  return { userId };
}
