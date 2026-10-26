/**
 * Başlangıç verisi (tekrar çalıştırılabilir; var olan kayıtlar atlanır).
 *  - İlk sistem yöneticisi: SEED_ADMIN_SICIL / SEED_ADMIN_PASSWORD (ilk girişte şifre değiştirmek zorunda)
 *  - Yalnızca geliştirme:
 *      · örnek organizasyon ağacı ve pozisyonlar (Üretim → Pres Hattı → Pres Operatörü vb.)
 *      · her rol için bir demo kullanıcı (SEED_DEMO_PASSWORD, şifre değiştirme zorunlu değil) ve pozisyonları
 *      · "TASLAK" işaretli KVKK aydınlatma metni (gerçek metin hukuktan gelene kadar)
 *      · örnek etiketler ve içerikler (yayında, onay bekleyen; demo kullanıcılar adına)
 *      · modüller (ortak İSG + Pres Operatörü modülleri) ve yayında Pres Operatörü kartı/planı
 *
 * Parametreler veritabanına yazılmaz; kayıt yoksa kodda tanımlı varsayılan kullanılır (SPEC Bölüm 14).
 * Kullanım: npm run db:seed
 */
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { systemActor } from "../src/server/authz/actor";
import type { UserActor } from "../src/server/authz/actor";
import type { Role } from "../src/server/authz/roles";
import { closeDb, db } from "../src/server/db/client";
import { contents, legalTexts, modules, orgUnits, personnel, positions, roleScopes, tagTypes, users } from "../src/server/db/schema";
import { withActor } from "../src/server/db/with-actor";
import { parseEnv } from "../src/server/env";
import { ValidationError } from "../src/server/errors";
import { createAccount } from "../src/server/services/accounts";
import { createContent, createTag, saveDraft, submitForApproval } from "../src/server/services/content";
import { createDraft, publishText } from "../src/server/services/legal";
import { createModule, saveTasks, setModuleContents } from "../src/server/services/modules";
import { approveCard, cardApprovalQueue, createCard, getEditableCard, saveCardSections, savePlan, submitCard } from "../src/server/services/positions";
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

// ---- İçerik kütüphanesi örnekleri ----

const p = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });
const bullets = (items: string[]) => ({
  type: "bulletList",
  content: items.map((text) => ({ type: "listItem", content: [p(text)] })),
});

async function demoActor(sicilNo: string, roles: Role[]): Promise<UserActor | null> {
  const id = await userIdBySicil(sicilNo);
  return id ? { kind: "user", userId: id, roles: ["personnel", ...roles] } : null;
}

async function seedContent() {
  const [any] = await db().select({ id: contents.id }).from(contents).limit(1);
  if (any) return;
  const manager = await demoActor("1003", ["section_manager"]);
  const trainer = await demoActor("1002", ["trainer"]);
  const ohs = await demoActor("1004", ["ohs_specialist"]);
  const pres = await unitId("PRES");
  if (!manager || !trainer || !ohs || !pres) return;

  const types = Object.fromEntries((await db().select().from(tagTypes)).map((t) => [t.key, t.id]));
  const tag = async (type: string, name: string) => (await createTag(manager, { tagTypeId: types[type]!, name })).id;
  const hidrolik = await tag("machine", "Hidrolik pres");
  const sikisma = await tag("risk", "Sıkışma");
  const gurultu = await tag("risk", "Gürültü");
  const gece = await tag("shift", "Gece vardiyası");
  const presTag = await tag("section", "Pres Hattı");

  const make = async (
    who: UserActor,
    input: Parameters<typeof createContent>[1],
    body: Record<string, unknown>,
    tagIds: string[],
  ) => {
    const { id } = await createContent(who, input);
    await saveDraft(who, id, { title: input.title, body, tagIds });
    const { status } = await submitForApproval(who, id, { changeNote: null, requireReread: false });
    console.log(`✓ İçerik: ${input.title} (${status})`);
  };

  await make(
    manager,
    { type: "text", title: "Pres hattında güvenli çalışma", ownerOrgUnitId: pres, commonTarget: null, isOhs: false },
    {
      doc: {
        type: "doc",
        content: [
          { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Temel kurallar" }] },
          p("Pres hattında çalışırken iki el kumandası her zaman kullanılır; kumanda köprülenmez veya bağlanmaz."),
          bullets(["Işık perdesi devre dışıyken pres çalıştırılmaz.", "Kalıp alanına el sokulmadan önce makine durdurulur.", "Kulaklık ve iş eldiveni takılır."]),
        ],
      },
    },
    [hidrolik, sikisma, presTag],
  );
  await make(
    manager,
    { type: "checklist", title: "Vardiya başı pres kontrolü", ownerOrgUnitId: pres, commonTarget: null, isOhs: false },
    {
      items: [
        { text: "Acil durdurma butonu çalışıyor", critical: true },
        { text: "Işık perdesi test edildi", critical: true },
        { text: "Hidrolik yağ seviyesi uygun", critical: false },
        { text: "Çalışma alanı temiz ve düzenli", critical: false },
      ],
    },
    [hidrolik, gece, presTag],
  );
  await make(
    trainer,
    { type: "instruction", title: "Kalıp değişimi", ownerOrgUnitId: pres, commonTarget: null, isOhs: false },
    {
      steps: [
        { title: "Presi durdurun ve kilitleyin", text: "Ana şalteri kapatıp kendi kilidinizi takın." },
        { title: "Eski kalıbı sökün", text: "Bağlantı cıvatalarını sırayla gevşetin." },
        { title: "Yeni kalıbı yerleştirin", text: "Merkezleme pimlerinin oturduğunu kontrol edin." },
        { title: "Deneme baskısı yapın", text: "İlk parçayı vardiya şefine onaylatın." },
      ],
    },
    [hidrolik, sikisma, presTag],
  );
  await make(
    ohs,
    { type: "text", title: "Genel İSG kuralları", ownerOrgUnitId: null, commonTarget: "all", isOhs: true },
    {
      doc: {
        type: "doc",
        content: [
          p("JAPAR tesislerinde herkes kişisel koruyucu donanım kurallarına uyar."),
          bullets(["Acil durumda en yakın toplanma alanına gidin.", "Yangın söndürücülerin önü kapatılmaz.", "Kaza ve ramak kala olaylarını hemen bildirin."]),
        ],
      },
    },
    [gurultu],
  );
}

// ---- Modüller ve pozisyon kartı örneği ----

async function contentId(title: string) {
  const [row] = await db().select({ id: contents.id }).from(contents).where(eq(contents.title, title)).limit(1);
  return row?.id;
}

async function seedTraining() {
  const [any] = await db().select({ id: modules.id }).from(modules).limit(1);
  if (any) return;
  const manager = await demoActor("1003", ["section_manager"]);
  const ohs = await demoActor("1004", ["ohs_specialist"]);
  const pres = await unitId("PRES");
  const presOp = await positionId("PRES-OP");
  const genelIsg = await contentId("Genel İSG kuralları");
  const presSafe = await contentId("Pres hattında güvenli çalışma");
  const presCheck = await contentId("Vardiya başı pres kontrolü");
  if (!manager || !ohs || !pres || !presOp || !genelIsg || !presSafe || !presCheck) return;

  const base = { description: null, isOhs: false, remoteAllowed: true, validityMonths: null, commonTarget: null, commonSortOrder: null };
  const common = await createModule(ohs, { ...base, kind: "theory", title: "Genel İSG eğitimi", durationMin: 120, isOhs: true, validityMonths: 12, ownerOrgUnitId: null, commonTarget: "all", commonSortOrder: 1 });
  await setModuleContents(ohs, common.id, [genelIsg]);
  const theory = await createModule(manager, { ...base, kind: "theory", title: "Pres hattı temel eğitimi", durationMin: 90, ownerOrgUnitId: pres });
  await setModuleContents(manager, theory.id, [presSafe, presCheck]);
  const exam = await createModule(manager, { ...base, kind: "theory_exam", title: "Pres operatörü teorik sınavı", durationMin: 30, ownerOrgUnitId: pres });
  const practice = await createModule(manager, { ...base, kind: "practice", title: "Pres operatörü pratik eğitimi", durationMin: 2400, ownerOrgUnitId: pres });
  await saveTasks(manager, practice.id, [
    { title: "Vardiya başı kontrol listesini uygulama", description: null, isCritical: true },
    { title: "Kalıp bağlama ve ayar", description: "Usta gözetiminde merkezleme kontrolü", isCritical: true },
    { title: "İlk parça onayı alma", description: null, isCritical: false },
    { title: "Hurda ve fire kaydı", description: null, isCritical: false },
  ]);
  const practiceExam = await createModule(manager, { ...base, kind: "practice_exam", title: "Pres operatörü pratik sınavı", durationMin: 120, ownerOrgUnitId: pres });
  console.log("✓ Modüller: ortak İSG + Pres Operatörü (4)");

  await createCard(manager, presOp);
  await saveCardSections(manager, presOp, {
    purpose: "Pres hattında iş güvenliği ve kalite kurallarına uyarak sac parçaların üretimini yapmak.",
    duties: [
      { text: "Presi vardiya planına göre çalıştırmak", frequency: "continuous" },
      { text: "Vardiya başı kontrol listesini uygulamak", frequency: "daily" },
      { text: "Kalıp değişiminde kalıpçıya yardım etmek", frequency: "weekly" },
    ],
    workflow: {
      steps: [
        { input: "İş emri ve sac rulo", process: "Malzemeyi beslemeye yerleştir", output: "Beslenen sac" },
        { input: "Beslenen sac", process: "Presi iki el kumandasıyla çalıştır", output: "Parça" },
        { input: "Parça", process: "Göz kontrolü yap, kasaya diz", output: "Sevke hazır parça" },
      ],
    },
    routines: [
      { time: "08:00", days: ["mon", "tue", "wed", "thu", "fri"], text: "Vardiya başı kontrol" },
      { time: "16:45", days: ["mon", "tue", "wed", "thu", "fri"], text: "Vardiya raporunu doldur" },
    ],
    reporting: [{ report: "Vardiya üretim raporu", recipient: "Vardiya şefi", frequency: "Her vardiya sonu", format: "Kağıt form" }],
    equipment: [
      { name: "400 t hidrolik pres", kind: "machine" },
      { name: "Kalıp anahtar takımı", kind: "tool" },
    ],
    critical: [
      { kind: "forbidden", text: "Işık perdesini veya iki el kumandasını asla köprüleme" },
      { kind: "quality", text: "İlk parça onayı alınmadan seri üretime geçme" },
      { kind: "error", text: "Sac yağlamasını unutmak kalıpta çapak oluşturur" },
    ],
    ohs: {
      risks: [{ text: "Uzuv sıkışması" }, { text: "Gürültü" }],
      ppe: [{ text: "Kesilmeye dayanıklı eldiven" }, { text: "Kulak koruyucu" }, { text: "Çelik burunlu ayakkabı" }],
      instructions: [{ text: "Pres güvenli çalışma talimatı" }],
      loto: "Kalıp değişimi ve bakımda ana şalter kapatılır, kişisel kilit takılır.",
      emergency: "Acil stop butonuna basın, vardiya şefine haber verin, toplanma alanına gidin.",
      contentIds: [genelIsg],
    },
    competencies: [{ text: "Forklift ehliyeti (tercihen)" }],
    kpis: [{ text: "Vardiya başına hurda oranı < %2" }],
    contacts: [
      { situation: "Makine arızası", contact: "Bakım teknisyeni" },
      { situation: "Kalite sorunu", contact: "Kalite kontrol teknisyeni" },
    ],
  });
  const card = await getEditableCard(manager, presOp);
  const cardModule = card.plan.items.find((i) => i.isCardModule)!.moduleId;
  const item = (moduleId: string, prev: string | null, settings = {}) => ({ moduleId, isRequired: true, prerequisiteModuleIds: prev ? [prev] : [], settings });
  await savePlan(manager, presOp, {
    overrides: {},
    items: [
      item(cardModule, null),
      item(theory.id, cardModule),
      item(exam.id, theory.id, { questionCount: 20 }),
      item(practice.id, exam.id),
      item(practiceExam.id, practice.id),
    ],
  });
  await submitCard(manager, presOp, { changeNote: null });
  const [pending] = await cardApprovalQueue(ohs);
  if (pending) await approveCard(ohs, pending.versionId);
  console.log("✓ Pozisyon kartı: Pres Operatörü (yayında)");
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
  if (cfg.SEED_DEMO_PASSWORD) {
    await seedContent();
    await seedTraining();
  }
}

main()
  .catch((err) => {
    console.error("✗ Seed başarısız:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
