import { and, eq, gte, inArray, like, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { systemActor } from "@/server/authz/actor";
import { db } from "@/server/db/client";
import {
  assignments,
  certificates,
  competencyGrants,
  contents,
  contentVersions,
  devices,
  evacuationRollcalls,
  legalTexts,
  modules,
  moduleContents,
  notifications,
  personnel,
  positionCardVersions,
  questions,
  sampleRecords,
  visits,
} from "@/server/db/schema";
import { stopJobSender } from "@/server/jobs/send";
import { createDraft, publishText } from "@/server/services/legal";
import { createModule, setModuleContents } from "@/server/services/modules";
import { createOrgUnit, createPosition } from "@/server/services/org";
import { ffmpegAvailable } from "@/server/services/media/process";
import { getSetting, setSetting } from "@/server/services/settings";
import { loadSampleData } from "@/server/sample-data/load";
import { purgeSampleData } from "@/server/sample-data/purge";
import { deleteObjects, deletePrefix } from "@/server/storage/client";
import { owner } from "../support/db";
import { createTestUser } from "../support/factories";
import { moduleInput, publishedText } from "../support/training";

/**
 * Örnek veri yükleme ve temizleme (kararlar #296–297). Canlı sitedekine benzer bir ağaçta bütün yükleyici
 * çalıştırılır: her kayıt ekranların servisleriyle oluşur, gerçek kişilere bildirim gitmez, temizleme
 * gerçek kayıtlara dokunmadan örnekleri siler.
 */

const sys = systemActor("test:sample-data");
const hasFfmpeg = await ffmpegAvailable();
const body = (s: string) => `${s} `.repeat(8);

afterAll(async () => {
  await stopJobSender();
});

async function liveLikeSite() {
  const uretim = (await createOrgUnit(sys, { kind: "department", name: "Üretim", code: "URETIM" })).id;
  const makine = (await createOrgUnit(sys, { kind: "section", parentId: uretim, name: "Makine", code: "MAKINE" })).id;
  const position = (await createPosition(sys, { orgUnitId: makine, name: "Droplast/Pres İşçisi", code: "MAK-DROPLAST-PRES", collarType: "blue" })).id;
  const other = (await createPosition(sys, { orgUnitId: makine, name: "Makine Bakımcısı", code: "MAK-BAKIM", collarType: "blue" })).id;

  const ownerUser = await createTestUser({ roles: ["owner"], sicilNo: "000001" });
  const hr = await createTestUser({ roles: ["hr"] });
  const ohs = await createTestUser({ roles: ["ohs_specialist"] });
  const worker = await createTestUser({ positionId: other });

  // Yayında yasal metinler (canlıda olduğu gibi)
  for (const [kind, who] of [
    ["visitor_rules", ohs],
    ["kvkk_visitor", hr],
    ["explicit_consent_personnel", hr],
  ] as const) {
    const tr = await createDraft(who.actor, { title: `${kind} tr`, body: body("Türkçe metin satırı") }, kind, "tr");
    await createDraft(who.actor, { title: `${kind} en`, body: body("English text line") }, kind, "en");
    await publishText(who.actor, tr.id);
  }
  // Kart okuma süresi beklenmesin
  const types = await getSetting("visitor.types");
  await setSetting(sys, "visitor.types", { ...types, contractor: { ...types.contractor, cardMinSeconds: 0 } });

  // Gerçek ortak modül: örnek kursiyerin atamasına da girer, temizlemede yerinde kalır
  const commonContent = await publishedText(ohs.actor, null, "Genel İSG Bilgilendirmesi", "Herkes için temel kurallar", true);
  const commonModule = (await createModule(ohs.actor, moduleInput(null, "theory", "Genel İSG", { isOhs: true }))).id;
  await setModuleContents(ohs.actor, commonModule, [commonContent]);

  return { position, makine, ownerUser, hr, ohs, worker, commonModule, commonContent };
}

describe("Örnek veri (kararlar #296–297)", () => {
  it.skipIf(!hasFfmpeg)(
    "karar #296 örnek veri ekranların servisleriyle yüklenir ve tek komutla temizlenir; gerçek kayıtlar korunur",
    async () => {
      const site = await liveLikeSite();
      const signatoriesBefore = await getSetting("certificate.signatories");
      const ppeBefore = await getSetting("visitor.ppe_items");

      // Ön kontrol yazmaz
      const check = await loadSampleData({ ownerSicil: "000001", check: true });
      expect(check.problems).toEqual([]);
      expect(await db().select().from(sampleRecords)).toHaveLength(0);

      const started = new Date();
      const report = await loadSampleData({ ownerSicil: "000001", mediaWaitSec: 0 });
      expect(report.problems).toEqual([]);

      // Kursiyer bütün akışı tamamladı: sertifika + eğitimle yetkinlik
      const [learner] = await db().select().from(personnel).where(eq(personnel.sicilNo, "ORNEK-KUR"));
      const [assignment] = await db().select().from(assignments).where(eq(assignments.userId, learner!.userId));
      expect(assignment!.status).toBe("completed");
      const certs = await db().select().from(certificates).where(eq(certificates.userId, learner!.userId));
      expect(certs.map((c) => c.kind).sort()).toEqual(["attendance", "attendance", "attendance", "position_competency"]);
      const grants = await db().select().from(competencyGrants).where(eq(competencyGrants.userId, learner!.userId));
      expect(grants.length).toBeGreaterThan(0);

      // Kart iki sürüm, ikinci sürüm yayında; içerikler yayında
      const cards = await db().select().from(positionCardVersions).where(eq(positionCardVersions.positionId, site.position));
      expect(cards).toHaveLength(2);
      expect(cards.find((c) => c.version === 2)?.status).toBe("published");
      const sampleContents = await db().select({ id: contents.id }).from(contents).where(eq(contents.ownerOrgUnitId, site.makine));
      expect(sampleContents).toHaveLength(8);
      const qs = await db().select({ id: questions.id }).from(questions).where(eq(questions.ownerOrgUnitId, site.makine));
      expect(qs.length).toBeGreaterThanOrEqual(30);

      // Ziyaret: giriş + çıkış yapıldı, yoklama tatbikatı bitti
      const [visit] = await db().select().from(visits).where(eq(visits.hostUserId, (await db().select().from(personnel).where(eq(personnel.sicilNo, "ORNEK-BSR")))[0]!.userId));
      expect(visit!.checkedOutAt).not.toBeNull();
      expect(await db().select().from(evacuationRollcalls)).toHaveLength(1);
      // Ziyaretçi kuralları taslağı yayınlanmadı
      const rulesDrafts = await db().select().from(legalTexts).where(and(eq(legalTexts.kind, "visitor_rules"), sql`${legalTexts.publishedAt} is null`));
      expect(rulesDrafts).toHaveLength(2);
      expect(await db().select().from(devices)).toHaveLength(1);

      // Geçici imza yetkilisi geri alındı, KKD listesine öğe eklendi
      expect(await getSetting("certificate.signatories")).toEqual(signatoriesBefore);
      expect(await getSetting("visitor.ppe_items")).toEqual([...ppeBefore, "Toz maskesi (FFP2)"]);

      // Sessiz kip: gerçek kişilere bildirim yazılmadı (karar #297)
      const real = [site.ownerUser.userId, site.hr.userId, site.ohs.userId, site.worker.userId];
      const realNotes = await db().select().from(notifications).where(and(inArray(notifications.userId, real), gte(notifications.createdAt, started)));
      expect(realNotes).toEqual([]);

      // Gerçek bir modül örnek içeriği kullanıyor: o içerik temizlemede korunur
      const [fire] = await db().select({ id: contents.id }).from(contents).where(like(contents.title, "Yangın Güvenliği%"));
      await setModuleContents(site.ohs.actor, site.commonModule, [site.commonContent, fire!.id]);

      const ownerUrl = process.env.DATABASE_OWNER_URL!;
      const dry = await purgeSampleData({ ownerUrl, dryRun: true });
      expect(dry.dryRun).toBe(true);
      expect((await db().select().from(personnel).where(like(personnel.sicilNo, "ORNEK-%"))).length).toBe(8);

      const removeFiles = async (keys: string[], prefixes: string[]) => {
        if (keys.length) await deleteObjects(keys);
        for (const p of prefixes) await deletePrefix(p);
      };
      const purged = await purgeSampleData({ ownerUrl, deleteObjects: removeFiles });

      // Korunan: gerçek modülün kullandığı içerik + parçalarının bağlı olduğu örnek etiket ve onaylayan kişi
      const [ohsSample] = await db().select().from(personnel).where(eq(personnel.sicilNo, "ORNEK-ISG"));
      expect(purged.kept.map((k) => k.table).sort()).toEqual(["contents", "tags", "users"]);
      expect(purged.kept.find((k) => k.table === "contents")!.id).toBe(fire!.id);
      expect(purged.kept.find((k) => k.table === "users")!.id).toBe(ohsSample!.userId);

      // Örneklerin geri kalanı gitti
      expect((await db().select().from(personnel).where(like(personnel.sicilNo, "ORNEK-%"))).map((p) => p.sicilNo)).toEqual(["ORNEK-ISG"]);
      expect(await db().select().from(positionCardVersions).where(eq(positionCardVersions.positionId, site.position))).toEqual([]);
      expect(await db().select().from(questions)).toEqual([]);
      expect(await db().select().from(devices)).toEqual([]);
      expect(await db().select().from(visits)).toEqual([]);
      expect(await db().select().from(certificates)).toEqual([]);
      expect(await getSetting("visitor.ppe_items")).toEqual(ppeBefore);
      // Parametre dizi olarak geri yazıldı (okuma varsayılana düşmüyor)
      const [ppeRow] = await owner()<{ t: string; v: unknown }[]>`select jsonb_typeof(value) as t, value as v from settings where key = 'visitor.ppe_items'`;
      expect(ppeRow).toEqual({ t: "array", v: ppeBefore });
      expect(await db().select().from(sampleRecords)).toHaveLength(3);
      // Korunan içerik bütün: sürümü yerinde
      expect((await db().select().from(contentVersions).where(eq(contentVersions.contentId, fire!.id))).length).toBeGreaterThan(0);

      // Gerçek kayıtlar yerinde
      const survivors = await db().select({ id: personnel.userId }).from(personnel);
      expect(survivors.map((s) => s.id).sort()).toEqual([...real, ohsSample!.userId].sort());
      const commonLinks = await db().select().from(moduleContents).where(eq(moduleContents.moduleId, site.commonModule));
      expect(commonLinks.map((l) => l.contentId).sort()).toEqual([site.commonContent, fire!.id].sort());
      expect(await db().select().from(modules).where(eq(modules.id, site.commonModule))).toHaveLength(1);
      expect((await db().select().from(contentVersions).where(eq(contentVersions.contentId, site.commonContent))).length).toBe(1);
      expect(await db().select().from(legalTexts).where(sql`${legalTexts.publishedAt} is not null`)).toHaveLength(6);

      // Gerçek modül içeriği bırakınca ikinci temizleme kalanları da siler
      await setModuleContents(site.ohs.actor, site.commonModule, [site.commonContent]);
      const second = await purgeSampleData({ ownerUrl, deleteObjects: removeFiles });
      expect(second.kept).toEqual([]);
      expect(await db().select().from(sampleRecords)).toEqual([]);
      expect(await db().select().from(personnel).where(like(personnel.sicilNo, "ORNEK-%"))).toEqual([]);
      expect(await db().select().from(contents).where(eq(contents.id, fire!.id))).toEqual([]);
    },
    600_000,
  );
});
