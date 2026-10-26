import { systemActor } from "@/server/authz/actor";
import { setSectionManagerScopes } from "@/server/services/roles";
import { owner } from "./db";
import { createTestUser } from "./factories";
import { seedTestOrg } from "./org";

const sys = systemActor("test");

/**
 * İçerik testleri için kişiler:
 *  - smUretim: Üretim departmanı (Pres, Montaj dahil) bölüm sorumlusu
 *  - smKalite: Kalite bölüm sorumlusu
 *  - trainerPres: Pres Hattı'nda pozisyonu olan eğitmen (Pres + Üretim)
 *  - trainerKalite: Kalite'de eğitmen
 *  - hr, ohs, sysadmin, personnel
 */
export async function seedContentPeople() {
  const org = await seedTestOrg();
  const hr = await createTestUser({ roles: ["hr"] });
  const ohs = await createTestUser({ roles: ["ohs_specialist"] });
  const ohs2 = await createTestUser({ roles: ["ohs_specialist"] });
  const sysadmin = await createTestUser({ roles: ["sysadmin"] });
  const smUretim = await createTestUser({ roles: ["section_manager"] });
  const smKalite = await createTestUser({ roles: ["section_manager"] });
  const trainerPres = await createTestUser({ roles: ["trainer"] });
  const trainerKalite = await createTestUser({ roles: ["trainer"] });
  const personnel = await createTestUser();
  await setSectionManagerScopes(sys, smUretim.userId, [org.units.uretim]);
  await setSectionManagerScopes(sys, smKalite.userId, [org.units.kalite]);
  await owner()`update personnel set position_id = ${org.positions.presOp} where user_id = ${trainerPres.userId}`;
  await owner()`update personnel set position_id = ${org.positions.kkTek} where user_id = ${trainerKalite.userId}`;
  return { org, hr, ohs, ohs2, sysadmin, smUretim, smKalite, trainerPres, trainerKalite, personnel };
}

export const textBody = (s: string) => ({
  doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: s }] }] },
});

/** Zorunlu bölümleri dolu bir pozisyon kartı. */
export function fullCardSections(ohsRisk = "Sıkışma") {
  return {
    purpose: "Pres hattında güvenli ve kaliteli üretim yapmak.",
    duties: [{ text: "Presi çalıştırmak", frequency: "continuous" }],
    workflow: { steps: [{ input: "Sac", process: "Basma", output: "Parça" }] },
    routines: [{ time: "08:00", days: ["mon", "tue"], text: "Vardiya başı kontrol" }],
    reporting: [{ report: "Vardiya raporu", recipient: "Vardiya şefi", frequency: "Vardiya sonu", format: "Kağıt form" }],
    equipment: [{ name: "Hidrolik pres", kind: "machine" }],
    critical: [{ kind: "forbidden", text: "Işık perdesini köprüleme" }],
    ohs: { risks: [{ text: ohsRisk }], ppe: [{ text: "Eldiven" }], instructions: [], loto: "", emergency: "Acil stop butonuna basın.", contentIds: [] },
    competencies: [],
    kpis: [],
    contacts: [{ situation: "Arıza", contact: "Bakım" }],
  };
}
