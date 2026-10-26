/**
 * Başlangıç verisi (tekrar çalıştırılabilir; var olan kayıtlar atlanır).
 *  - İlk sistem yöneticisi: SEED_ADMIN_SICIL / SEED_ADMIN_PASSWORD (ilk girişte şifre değiştirmek zorunda)
 *  - Yalnızca geliştirme:
 *      · örnek organizasyon ağacı ve pozisyonlar (Üretim → Pres Hattı → Pres Operatörü vb.)
 *      · her rol için bir demo kullanıcı (SEED_DEMO_PASSWORD, şifre değiştirme zorunlu değil) ve pozisyonları
 *      · "TASLAK" işaretli KVKK aydınlatma metni (gerçek metin hukuktan gelene kadar)
 *
 * Parametreler veritabanına yazılmaz; kayıt yoksa kodda tanımlı varsayılan kullanılır (SPEC Bölüm 14).
 * Kullanım: npm run db:seed
 */
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { systemActor } from "../src/server/authz/actor";
import type { Role } from "../src/server/authz/roles";
import { closeDb, db } from "../src/server/db/client";
import { legalTexts, orgUnits, personnel, positions, roleScopes, users } from "../src/server/db/schema";
import { withActor } from "../src/server/db/with-actor";
import { parseEnv } from "../src/server/env";
import { ValidationError } from "../src/server/errors";
import { createAccount } from "../src/server/services/accounts";
import { createDraft, publishText } from "../src/server/services/legal";
import { createOrgUnit, createPosition } from "../src/server/services/org";

const cfg = parseEnv(
  z.object({
    NODE_ENV: z.string().default("development"),
    SEED_ADMIN_SICIL: z.string().min(1),
    SEED_ADMIN_PASSWORD: z.string().min(8, "en az 8 karakter olmalı"),
    SEED_DEMO_PASSWORD: z.string().optional(),
  }),
);

const actor = systemActor("seed");
const isDev = cfg.NODE_ENV !== "production";

// ---- Organizasyon (yalnızca geliştirme) ----

type UnitSeed = { code: string; name: string; sections?: { code: string; name: string }[] };
const UNITS: UnitSeed[] = [
  {
    code: "URETIM",
    name: "Üretim",
    sections: [
      { code: "PRES", name: "Pres Hattı" },
      { code: "MONTAJ", name: "Montaj" },
    ],
  },
  { code: "KALITE", name: "Kalite" },
  { code: "IK", name: "İnsan Kaynakları" },
  { code: "ISG", name: "İş Sağlığı ve Güvenliği" },
  { code: "GUVENLIK", name: "Güvenlik" },
  { code: "BT", name: "Bilgi Teknolojileri" },
];

type PositionSeed = { code: string; name: string; unit: string; collar: "blue" | "white"; shift?: string; supervisor?: string };
const POSITIONS: PositionSeed[] = [
  { code: "URETIM-MUDUR", name: "Üretim Müdürü", unit: "URETIM", collar: "white" },
  { code: "VARDIYA-SEFI", name: "Vardiya Şefi", unit: "PRES", collar: "blue", shift: "3 vardiya", supervisor: "URETIM-MUDUR" },
  { code: "PRES-OP", name: "Pres Operatörü", unit: "PRES", collar: "blue", shift: "3 vardiya", supervisor: "VARDIYA-SEFI" },
  { code: "KALIPCI", name: "Kalıpçı", unit: "PRES", collar: "blue", shift: "3 vardiya", supervisor: "VARDIYA-SEFI" },
  { code: "MONTAJ-OP", name: "Montaj Operatörü", unit: "MONTAJ", collar: "blue", shift: "2 vardiya", supervisor: "URETIM-MUDUR" },
  { code: "KK-TEKNISYEN", name: "Kalite Kontrol Teknisyeni", unit: "KALITE", collar: "blue", shift: "3 vardiya" },
  { code: "IK-UZMAN", name: "İK Uzmanı", unit: "IK", collar: "white" },
  { code: "ISG-UZMAN", name: "İSG Uzmanı", unit: "ISG", collar: "white" },
  { code: "GUVENLIK-GOREVLI", name: "Güvenlik Görevlisi", unit: "GUVENLIK", collar: "blue", shift: "3 vardiya" },
  { code: "BT-UZMAN", name: "Bilgi Teknolojileri Uzmanı", unit: "BT", collar: "white" },
];

async function unitId(code: string): Promise<string | undefined> {
  const [row] = await db().select({ id: orgUnits.id }).from(orgUnits).where(eq(orgUnits.code, code)).limit(1);
  return row?.id;
}

async function positionId(code: string): Promise<string | undefined> {
  const [row] = await db().select({ id: positions.id }).from(positions).where(eq(positions.code, code)).limit(1);
  return row?.id;
}

async function seedOrg() {
  for (const dept of UNITS) {
    let deptId = await unitId(dept.code);
    if (!deptId) {
      deptId = (await createOrgUnit(actor, { kind: "department", name: dept.name, code: dept.code })).id;
      console.log(`✓ Departman: ${dept.name}`);
    }
    for (const s of dept.sections ?? []) {
      if (!(await unitId(s.code))) {
        await createOrgUnit(actor, { kind: "section", parentId: deptId, name: s.name, code: s.code });
        console.log(`✓ Bölüm: ${dept.name} / ${s.name}`);
      }
    }
  }
  for (const p of POSITIONS) {
    if (await positionId(p.code)) continue;
    await createPosition(actor, {
      orgUnitId: (await unitId(p.unit))!,
      name: p.name,
      code: p.code,
      collarType: p.collar,
      shiftPattern: p.shift ?? null,
      supervisorPositionId: p.supervisor ? ((await positionId(p.supervisor)) ?? null) : null,
    });
    console.log(`✓ Pozisyon: ${p.name}`);
  }
}

// ---- Kullanıcılar ----

const DEMO_USERS: { sicilNo: string; fullName: string; roles: Role[]; position: string; trainingRequired?: boolean; scope?: string }[] = [
  { sicilNo: "1001", fullName: "Ayşe Yılmaz", roles: [], position: "PRES-OP", trainingRequired: true },
  { sicilNo: "1002", fullName: "Mehmet Usta", roles: ["trainer"], position: "VARDIYA-SEFI" },
  { sicilNo: "1003", fullName: "Fatma Demir", roles: ["section_manager"], position: "URETIM-MUDUR", scope: "URETIM" },
  { sicilNo: "1004", fullName: "Can Öztürk", roles: ["ohs_specialist"], position: "ISG-UZMAN" },
  { sicilNo: "1005", fullName: "Elif Şahin", roles: ["hr"], position: "IK-UZMAN" },
  { sicilNo: "1006", fullName: "Murat Kaya", roles: ["security"], position: "GUVENLIK-GOREVLI" },
  {
    sicilNo: "1007",
    fullName: "Zeynep Çelik",
    roles: ["trainer", "section_manager", "ohs_specialist", "hr"],
    position: "IK-UZMAN",
    scope: "URETIM",
  },
];

async function userIdBySicil(sicilNo: string) {
  const [row] = await db().select({ id: users.id }).from(users).where(eq(users.username, sicilNo)).limit(1);
  return row?.id;
}

async function ensure(input: Parameters<typeof createAccount>[1]): Promise<string> {
  const existing = await userIdBySicil(input.sicilNo);
  if (existing) {
    console.log(`• ${input.sicilNo} mevcut, atlandı`);
    return existing;
  }
  try {
    const { userId } = await createAccount(actor, input);
    console.log(`✓ ${input.sicilNo} ${input.fullName} (${["personnel", ...(input.roles ?? [])].join(", ")})`);
    return userId;
  } catch (err) {
    if (err instanceof ValidationError) {
      throw new Error(`${input.sicilNo}: ${err.code} ${JSON.stringify(err.details ?? "")}`);
    }
    throw err;
  }
}

/** Var olan demo kullanıcının pozisyonu boşsa atar; kapsamı yoksa ekler. */
async function placeDemoUser(userId: string, demo: (typeof DEMO_USERS)[number]) {
  const posId = await positionId(demo.position);
  await withActor(actor, async (tx) => {
    await tx
      .update(personnel)
      .set({ positionId: posId, hireDate: "2026-01-05", trainingRequired: demo.trainingRequired ?? false })
      .where(and(eq(personnel.userId, userId), isNull(personnel.positionId)));
    if (demo.scope) {
      const scopeUnit = await unitId(demo.scope);
      if (scopeUnit) {
        await tx
          .insert(roleScopes)
          .values({ userId, role: "section_manager", orgUnitId: scopeUnit })
          .onConflictDoNothing();
      }
    }
  });
}

// ---- KVKK (yalnızca geliştirme) ----

const DRAFT_KVKK = `[TASLAK — Bu metin yer tutucudur. Hukuk/KVKK sorumlusunun onayladığı metinle değiştirilmelidir.]

JAPAR olarak, 6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamında veri sorumlusu sıfatıyla, JAPAR Akademi platformunda eğitim, sınav ve yetkinlik süreçlerinizin yürütülmesi amacıyla kimlik, iletişim ve eğitim verilerinizi işlemekteyiz.

Verileriniz yalnızca yetkili personel tarafından, görevleriyle sınırlı olarak görüntülenir ve yasal saklama süreleri sonunda anonimleştirilir.

Kanun'un 11. maddesi kapsamındaki haklarınız için İnsan Kaynakları birimine başvurabilirsiniz.`;

async function seedLegal() {
  const [any] = await db().select({ id: legalTexts.id }).from(legalTexts).limit(1);
  if (any) return;
  const { id } = await createDraft(actor, { title: "Çalışan Aydınlatma Metni (TASLAK)", body: DRAFT_KVKK });
  await publishText(actor, id);
  console.log("✓ KVKK aydınlatma metni (TASLAK) yayınlandı");
}

async function main() {
  await ensure({
    sicilNo: cfg.SEED_ADMIN_SICIL,
    fullName: "Sistem Yöneticisi",
    password: cfg.SEED_ADMIN_PASSWORD,
    roles: ["sysadmin"],
    mustChangePassword: true,
  });

  if (!isDev) return;
  await seedOrg();

  const adminId = await userIdBySicil(cfg.SEED_ADMIN_SICIL);
  if (adminId) await placeDemoUser(adminId, { sicilNo: cfg.SEED_ADMIN_SICIL, fullName: "", roles: [], position: "BT-UZMAN" });

  if (cfg.SEED_DEMO_PASSWORD) {
    for (const demo of DEMO_USERS) {
      const userId = await ensure({
        sicilNo: demo.sicilNo,
        fullName: demo.fullName,
        roles: demo.roles,
        password: cfg.SEED_DEMO_PASSWORD,
        mustChangePassword: false,
      });
      await placeDemoUser(userId, demo);
    }
  }
  await seedLegal();
}

main()
  .catch((err) => {
    console.error("✗ Seed başarısız:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
