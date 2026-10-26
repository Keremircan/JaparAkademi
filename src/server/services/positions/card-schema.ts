import { z } from "zod";

/**
 * Pozisyon kartı bölümleri (SPEC Bölüm 5). 1. bölüm (künye) pozisyondan okunur ve yayında
 * kopyalanır (karar #42); 13. bölüm eğitim planıdır (ayrı tablolar). Taslak eksik olabilir;
 * onaya gönderirken zorunlu bölümler dolu olmalıdır.
 */

export const CARD_SECTION_KEYS = [
  "purpose",
  "duties",
  "workflow",
  "routines",
  "reporting",
  "equipment",
  "critical",
  "ohs",
  "competencies",
  "kpis",
  "contacts",
] as const;
export type CardSectionKey = (typeof CARD_SECTION_KEYS)[number];

/** Bölüm numaraları (arayüz ve hata mesajları için). */
export const SECTION_NUMBER: Record<CardSectionKey | "identity" | "plan", number> = {
  identity: 1,
  purpose: 2,
  duties: 3,
  workflow: 4,
  routines: 5,
  reporting: 6,
  equipment: 7,
  critical: 8,
  ohs: 9,
  competencies: 10,
  kpis: 11,
  contacts: 12,
  plan: 13,
};

export const OPTIONAL_SECTIONS: readonly CardSectionKey[] = ["competencies", "kpis"];

export const FREQUENCIES = ["continuous", "daily", "weekly", "monthly"] as const;
export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export const EQUIPMENT_KINDS = ["machine", "tool", "software", "form"] as const;
export const CRITICAL_KINDS = ["error", "quality", "forbidden"] as const;

const str = (max: number) => z.string().trim().max(max).default("");
const uuid = z.uuid();
const list = <T extends z.ZodType>(item: T, max = 100) => z.array(item).max(max).default([]);
const textItem = z.object({ text: str(500) });

export const cardSectionsSchema = z.object({
  purpose: str(500),
  duties: list(z.object({ text: str(500), frequency: z.enum(FREQUENCIES).default("daily") })),
  workflow: z
    .object({
      steps: list(z.object({ input: str(300), process: str(1000), output: str(300) })),
      diagramAssetId: uuid.optional(),
    })
    .default({ steps: [] }),
  routines: list(
    z.object({
      time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).or(z.literal("")).default(""),
      days: z.array(z.enum(WEEKDAYS)).max(7).default([]),
      text: str(500),
    }),
  ),
  reporting: list(
    z.object({
      report: str(200),
      recipient: str(200),
      frequency: str(100),
      format: str(200),
      sampleContentId: uuid.optional(),
    }),
  ),
  equipment: list(z.object({ name: str(200), kind: z.enum(EQUIPMENT_KINDS).default("machine") })),
  critical: list(z.object({ kind: z.enum(CRITICAL_KINDS).default("error"), text: str(500) })),
  ohs: z
    .object({
      risks: list(textItem),
      ppe: list(textItem),
      instructions: list(textItem),
      loto: str(2000),
      emergency: str(2000),
      contentIds: z.array(uuid).max(50).default([]),
    })
    .default({ risks: [], ppe: [], instructions: [], loto: "", emergency: "", contentIds: [] }),
  competencies: list(textItem),
  kpis: list(textItem),
  contacts: list(z.object({ situation: str(300), contact: str(200) })),
});

export type CardSections = z.infer<typeof cardSectionsSchema>;

export function parseCardSections(input: unknown) {
  return cardSectionsSchema.safeParse(input ?? {});
}

export function emptySections(): CardSections {
  return cardSectionsSchema.parse({});
}

const filled = (s: string | undefined) => !!s && s.trim().length > 0;

/** Zorunlu bölümlerden boş olanlar (FG: boş zorunlu alan varken kart onaya gönderilemez). */
export function missingSections(s: CardSections): CardSectionKey[] {
  const missing: CardSectionKey[] = [];
  if (!filled(s.purpose)) missing.push("purpose");
  if (!s.duties.length || s.duties.some((d) => !filled(d.text))) missing.push("duties");
  if (!s.workflow.steps.length || s.workflow.steps.some((x) => !filled(x.process))) missing.push("workflow");
  if (!s.routines.length || s.routines.some((r) => !filled(r.text))) missing.push("routines");
  if (!s.reporting.length || s.reporting.some((r) => !filled(r.report) || !filled(r.recipient))) missing.push("reporting");
  if (!s.equipment.length || s.equipment.some((e) => !filled(e.name))) missing.push("equipment");
  if (!s.critical.length || s.critical.some((c) => !filled(c.text))) missing.push("critical");
  if (!s.ohs.risks.length || !s.ohs.ppe.length || !filled(s.ohs.emergency) || [...s.ohs.risks, ...s.ohs.ppe].some((x) => !filled(x.text))) {
    missing.push("ohs");
  }
  if (!s.contacts.length || s.contacts.some((c) => !filled(c.situation) || !filled(c.contact))) missing.push("contacts");
  return missing;
}

/** Kart içinde başvurulan içerik ve medya kimlikleri (erişim ve doğrulama için). */
export function cardContentIds(s: CardSections): string[] {
  return [...new Set([...s.ohs.contentIds, ...s.reporting.map((r) => r.sampleContentId).filter((x): x is string => !!x)])];
}

/** Künye: yayın anında pozisyondan kopyalanır. */
export type CardIdentity = {
  positionName: string;
  positionCode: string;
  unitName: string;
  departmentName: string | null;
  supervisorName: string | null;
  deputyName: string | null;
  collarType: "blue" | "white";
  shiftPattern: string | null;
};

/** Kayıtlı JSON: bölümler + yayında eklenen künye. */
export type StoredCard = CardSections & { identity?: CardIdentity };

/** İSG bölümünün karşılaştırma için kararlı gösterimi. */
export function ohsFingerprint(s: CardSections): string {
  return JSON.stringify(s.ohs);
}
