import { systemActor } from "../../src/server/authz/actor";
import { closeDb } from "../../src/server/db/client";
import { createAccount } from "../../src/server/services/accounts";

/** Her çalıştırmada benzersiz sicil numaralı test kullanıcıları (proje başına ayrı) oluşturur. */
export const E2E_PASSWORD = "E2e.Test-Sifre9";
export const E2E_NEW_PASSWORD = "Yeni.E2e-Sifre7";

export default async function globalSetup() {
  const suffix = Date.now().toString(36).toUpperCase();
  process.env.E2E_SUFFIX = suffix;
  for (const project of ["mobile", "desktop"]) {
    await createAccount(systemActor("e2e"), {
      sicilNo: `E2E-${suffix}-${project[0]}`,
      fullName: "Deneme Kullanıcı",
      password: E2E_PASSWORD,
      roles: ["trainer", "hr"],
      mustChangePassword: true,
    });
  }
  await closeDb();
}
