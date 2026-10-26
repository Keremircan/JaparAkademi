import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { isNotNull } from "drizzle-orm";
import { systemActor } from "../../src/server/authz/actor";
import { closeDb, db } from "../../src/server/db/client";
import { legalTexts } from "../../src/server/db/schema";
import { createAccount } from "../../src/server/services/accounts";
import { createDraft, publishText } from "../../src/server/services/legal";
import { createOrgUnit, createPosition } from "../../src/server/services/org";
import { setSectionManagerScopes } from "../../src/server/services/roles";
import { buildPeopleXlsx } from "../support/xlsx";

/**
 * Her çalıştırmada benzersiz sicil numaralı test kullanıcıları ve küçük bir org ağacı oluşturur.
 * Yayınlanmış KVKK metni yoksa bir tane yayınlar (onay adımı her ortamda aynı olsun).
 */
export const E2E_PASSWORD = "E2e.Test-Sifre9";
export const E2E_NEW_PASSWORD = "Yeni.E2e-Sifre7";
export const E2E_IMPORT_FILE = path.join(process.cwd(), "test-results", "e2e-import.xlsx");

export default async function globalSetup() {
  const suffix = Date.now().toString(36).toUpperCase();
  process.env.E2E_SUFFIX = suffix;
  const sys = systemActor("e2e");

  const [published] = await db().select({ id: legalTexts.id }).from(legalTexts).where(isNotNull(legalTexts.publishedAt)).limit(1);
  if (!published) {
    const draft = await db().select({ id: legalTexts.id }).from(legalTexts).limit(1);
    const id = draft[0]?.id ?? (await createDraft(sys, { title: "E2E Aydınlatma Metni", body: "Uçtan uca test için aydınlatma metni. ".repeat(3) })).id;
    await publishText(sys, id);
  }

  const dept = await createOrgUnit(sys, { kind: "department", name: `E2E Departman ${suffix}`, code: `E2E-${suffix}` });
  await createPosition(sys, { orgUnitId: dept.id, name: "E2E Operatör", code: `E2E-OP-${suffix}`, collarType: "blue" });
  process.env.E2E_DEPARTMENT = `E2E Departman ${suffix}`;

  // İçerik akışı (1.2): bölüm, bu bölümde pozisyonu olan eğitmen, kapsamı bu departman olan bölüm sorumlusu, İSG uzmanı
  const section = await createOrgUnit(sys, { kind: "section", parentId: dept.id, name: "E2E Hat", code: `E2E-HAT-${suffix}` });
  const sectionPos = await createPosition(sys, { orgUnitId: section.id, name: "E2E Hat Ustası", code: `E2E-USTA-${suffix}`, collarType: "blue" });

  for (const project of ["mobile", "desktop"]) {
    const p = project[0];
    // İlk giriş akışı kullanıcısı (şifre değiştirme zorunlu)
    await createAccount(sys, {
      sicilNo: `E2E-${suffix}-${p}`,
      fullName: "Deneme Kullanıcı",
      password: E2E_PASSWORD,
      roles: ["trainer", "hr"],
      mustChangePassword: true,
    });
    // İK akışı kullanıcısı
    await createAccount(sys, {
      sicilNo: `E2E-${suffix}-HR${p}`,
      fullName: "Deneme İK",
      password: E2E_PASSWORD,
      roles: ["hr"],
      mustChangePassword: false,
    });
  }

  for (const project of ["mobile", "desktop"]) {
    const p = project[0];
    await createAccount(sys, { sicilNo: `E2E-${suffix}-TR${p}`, fullName: "Deneme Eğitmen", password: E2E_PASSWORD, roles: ["trainer"], positionId: sectionPos.id, mustChangePassword: false });
    const sm = await createAccount(sys, { sicilNo: `E2E-${suffix}-SM${p}`, fullName: "Deneme Bölüm Sorumlusu", password: E2E_PASSWORD, roles: ["section_manager"], mustChangePassword: false });
    await setSectionManagerScopes(sys, sm.userId, [dept.id]);
    await createAccount(sys, { sicilNo: `E2E-${suffix}-OHS${p}`, fullName: "Deneme İSG Uzmanı", password: E2E_PASSWORD, roles: ["ohs_specialist"], mustChangePassword: false });
  }

  await mkdir(path.dirname(E2E_IMPORT_FILE), { recursive: true });
  await writeFile(
    E2E_IMPORT_FILE,
    await buildPeopleXlsx([
      [`E2E-${suffix}-X1`, "Aktarılan Bir", `E2E Departman ${suffix}`, "E2E Operatör", "05.01.2026", "Mavi"],
      [`E2E-${suffix}-X2`, "Aktarılan İki", `e2e departman ${suffix.toLowerCase()}`, `E2E-OP-${suffix}`, "06.01.2026", "Mavi"],
      [`E2E-${suffix}-X3`, "Hatalı Satır", "Olmayan Departman", "Yok", "05.01.2026", "Mavi"],
    ]),
  );
  await closeDb();
}
