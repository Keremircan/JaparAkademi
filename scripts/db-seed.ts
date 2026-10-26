/**
 * Başlangıç verisi (tekrar çalıştırılabilir; var olan kayıtlar atlanır).
 *  - İlk sistem yöneticisi: SEED_ADMIN_SICIL / SEED_ADMIN_PASSWORD (ilk girişte şifre değiştirmek zorunda)
 *  - Yalnızca geliştirme: her rol için bir demo kullanıcı (SEED_DEMO_PASSWORD, şifre değiştirme zorunlu değil)
 *
 * Parametreler veritabanına yazılmaz; kayıt yoksa kodda tanımlı varsayılan kullanılır (SPEC Bölüm 14).
 * Kullanım: npm run db:seed
 */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { systemActor } from "../src/server/authz/actor";
import type { Role } from "../src/server/authz/roles";
import { closeDb, db } from "../src/server/db/client";
import { users } from "../src/server/db/schema";
import { parseEnv } from "../src/server/env";
import { ValidationError } from "../src/server/errors";
import { createAccount } from "../src/server/services/accounts";

const cfg = parseEnv(
  z.object({
    NODE_ENV: z.string().default("development"),
    SEED_ADMIN_SICIL: z.string().min(1),
    SEED_ADMIN_PASSWORD: z.string().min(8, "en az 8 karakter olmalı"),
    SEED_DEMO_PASSWORD: z.string().optional(),
  }),
);

const actor = systemActor("seed");

const DEMO_USERS: { sicilNo: string; fullName: string; roles: Role[] }[] = [
  { sicilNo: "1001", fullName: "Ayşe Yılmaz", roles: [] },
  { sicilNo: "1002", fullName: "Mehmet Usta", roles: ["trainer"] },
  { sicilNo: "1003", fullName: "Fatma Demir", roles: ["section_manager"] },
  { sicilNo: "1004", fullName: "Can Öztürk", roles: ["ohs_specialist"] },
  { sicilNo: "1005", fullName: "Elif Şahin", roles: ["hr"] },
  { sicilNo: "1006", fullName: "Murat Kaya", roles: ["security"] },
  { sicilNo: "1007", fullName: "Zeynep Çelik", roles: ["trainer", "section_manager", "ohs_specialist", "hr"] },
];

async function exists(sicilNo: string) {
  const rows = await db().select({ id: users.id }).from(users).where(eq(users.username, sicilNo)).limit(1);
  return rows.length > 0;
}

async function ensure(input: Parameters<typeof createAccount>[1]) {
  if (await exists(input.sicilNo)) {
    console.log(`• ${input.sicilNo} mevcut, atlandı`);
    return;
  }
  try {
    await createAccount(actor, input);
    console.log(`✓ ${input.sicilNo} ${input.fullName} (${["personnel", ...(input.roles ?? [])].join(", ")})`);
  } catch (err) {
    if (err instanceof ValidationError) {
      throw new Error(`${input.sicilNo}: ${err.code} ${JSON.stringify(err.details ?? "")}`);
    }
    throw err;
  }
}

async function main() {
  await ensure({
    sicilNo: cfg.SEED_ADMIN_SICIL,
    fullName: "Sistem Yöneticisi",
    password: cfg.SEED_ADMIN_PASSWORD,
    roles: ["sysadmin"],
    mustChangePassword: true,
  });

  if (cfg.NODE_ENV !== "production" && cfg.SEED_DEMO_PASSWORD) {
    for (const u of DEMO_USERS) {
      await ensure({ ...u, password: cfg.SEED_DEMO_PASSWORD, mustChangePassword: false });
    }
  }
}

main()
  .catch((err) => {
    console.error("✗ Seed başarısız:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
