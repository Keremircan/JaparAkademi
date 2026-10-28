import { systemActor } from "@/server/authz/actor";
import { createDraft, publishText } from "@/server/services/legal";
import { setSetting } from "@/server/services/settings";
import { createBriefingDraft, publishBriefing, saveBriefingDraft } from "@/server/services/visitors";
import { createTestUser } from "./factories";

const sys = systemActor("test:visitors");

/** Ziyaretçi bilgilendirmesi için hazır ortam: yayında saha paketi (3 soru, doğru şık 0), TR/EN kurallar ve KVKK metni. */
export async function visitorBriefingSetup(opts: { cardMinSeconds?: number } = {}) {
  const ohs = await createTestUser({ roles: ["ohs_specialist"] });
  const hr = await createTestUser({ roles: ["hr"] });
  await setSetting(sys, "visitor.types", {
    office: { enabled: true, questionCount: 0, passScore: 100, cardMinSeconds: opts.cardMinSeconds ?? 0, validityYears: 0 },
    site: { enabled: true, questionCount: 3, passScore: 100, cardMinSeconds: opts.cardMinSeconds ?? 0, validityYears: 0 },
    contractor: { enabled: true, questionCount: 3, passScore: 80, cardMinSeconds: opts.cardMinSeconds ?? 0, validityYears: 1 },
  });
  const card = { titleTr: "Acil durum", bodyTr: "Alarmda toplanma alanına gidin.", titleEn: "Emergency", bodyEn: "Go to the assembly point.", mediaAssetId: null };
  const q = (n: number) => ({
    stemTr: `Soru ${n}`,
    stemEn: `Question ${n}`,
    optionsTr: ["Doğru", "Yanlış A", "Yanlış B"],
    optionsEn: ["Right", "Wrong A", "Wrong B"],
    correctIndex: 0,
  });
  for (const type of ["office", "site", "contractor"] as const) {
    const { id } = await createBriefingDraft(ohs.actor, type);
    await saveBriefingDraft(ohs.actor, id, { cards: [card, { ...card, titleTr: "KKD", titleEn: "PPE" }], questions: [q(1), q(2), q(3), q(4)] });
    await publishBriefing(ohs.actor, id);
  }
  const body = (s: string) => `${s} `.repeat(6);
  const legal: Record<string, string> = {};
  for (const [kind, who] of [
    ["visitor_rules", ohs],
    ["kvkk_visitor", hr],
  ] as const) {
    const tr = await createDraft(who.actor, { title: `${kind} tr`, body: body("Türkçe metin satırı") }, kind, "tr");
    const en = await createDraft(who.actor, { title: `${kind} en`, body: body("English text line") }, kind, "en");
    await publishText(who.actor, tr.id);
    legal[`${kind}:tr`] = tr.id;
    legal[`${kind}:en`] = en.id;
  }
  return { ohs, hr, legal };
}
