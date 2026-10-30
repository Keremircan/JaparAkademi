import { and, desc, eq, isNotNull, isNull, max } from "drizzle-orm";
import type { Actor, UserActor } from "@/server/authz/actor";
import { assertCan, can, type Permission } from "@/server/authz/policy";
import { db } from "@/server/db/client";
import { consents, legalTexts } from "@/server/db/schema";
import { withActor } from "@/server/db/with-actor";
import { NotFoundError, ValidationError } from "@/server/errors";
import type { RequestMeta } from "@/server/services/auth";

/**
 * KVKK aydınlatma metni ve onayı (SPEC 13.3). Metni İK yönetir (karar #5).
 * Kullanıcı en son yayınlanmış personel metnini onaylamadan uygulamaya giremez.
 * Ziyaretçi metinleri (iş paketi 2.2, karar #128): KVKK metnini İK, kuralları İSG uzmanı yönetir;
 * ikisi de TR + EN birlikte yayınlanır (FG-8.2).
 */
const PERSONNEL_KIND = "kvkk_personnel" as const;

export const LEGAL_KINDS = {
  // Personel metni de TR + EN birlikte yayınlanır (karar #207); bağlayıcı metin Türkçedir
  kvkk_personnel: { permission: "legal.manage", locales: ["tr", "en"] },
  kvkk_visitor: { permission: "legal.manage", locales: ["tr", "en"] },
  visitor_rules: { permission: "legal.visitor_rules", locales: ["tr", "en"] },
} as const satisfies Record<string, { permission: Permission; locales: readonly string[] }>;
export type LegalKind = keyof typeof LEGAL_KINDS;

export function isLegalKind(value: string): value is LegalKind {
  return Object.hasOwn(LEGAL_KINDS, value);
}

/** Kişinin yönetebildiği metin türleri. */
export function manageableKinds(actor: Actor): LegalKind[] {
  return (Object.keys(LEGAL_KINDS) as LegalKind[]).filter((k) => can(actor, LEGAL_KINDS[k].permission));
}

function assertKind(actor: Actor, kind: LegalKind) {
  assertCan(actor, LEGAL_KINDS[kind].permission);
}

/** Bir türün en son yayınlanmış metni (ziyaretçi ekranları 2.3'te kullanır). */
export async function currentText(kind: LegalKind, locale: string): Promise<LegalText | null> {
  const [row] = await db()
    .select()
    .from(legalTexts)
    .where(and(eq(legalTexts.kind, kind), eq(legalTexts.locale, locale), isNotNull(legalTexts.publishedAt)))
    .orderBy(desc(legalTexts.version))
    .limit(1);
  return row ?? null;
}

export type LegalText = typeof legalTexts.$inferSelect;

/** En son yayınlanmış personel aydınlatma metni (yoksa null: onay istenmez). */
export async function currentPersonnelText(locale = "tr"): Promise<LegalText | null> {
  const [row] = await db()
    .select()
    .from(legalTexts)
    .where(and(eq(legalTexts.kind, PERSONNEL_KIND), eq(legalTexts.locale, locale), isNotNull(legalTexts.publishedAt)))
    .orderBy(desc(legalTexts.version))
    .limit(1);
  return row ?? null;
}

/** Güncel sürümün kişinin dilindeki metni; o dilde yoksa Türkçesi (karar #207). */
async function personnelTextIn(current: LegalText, locale: string): Promise<LegalText> {
  if (locale === current.locale) return current;
  const [row] = await db()
    .select()
    .from(legalTexts)
    .where(
      and(eq(legalTexts.kind, PERSONNEL_KIND), eq(legalTexts.version, current.version), eq(legalTexts.locale, locale), isNotNull(legalTexts.publishedAt)),
    )
    .limit(1);
  return row ?? current;
}

/**
 * Kullanıcının onaylaması gereken metin (zaten onayladıysa null). Güncel sürüm Türkçe metnin sürümüdür;
 * aynı sürümün herhangi bir dildeki metnine verilmiş onay geçerlidir. Metin kişinin dilinde döner.
 */
export async function pendingConsent(userId: string, locale = "tr"): Promise<LegalText | null> {
  const current = await currentPersonnelText();
  if (!current) return null;
  const [done] = await db()
    .select({ id: consents.id })
    .from(consents)
    .innerJoin(legalTexts, eq(legalTexts.id, consents.legalTextId))
    .where(and(eq(consents.userId, userId), eq(legalTexts.kind, PERSONNEL_KIND), eq(legalTexts.version, current.version)))
    .limit(1);
  return done ? null : personnelTextIn(current, locale);
}

/**
 * Onayı kaydeder. Yalnızca güncel sürümün (herhangi bir dildeki) metni onaylanabilir; onay okunan dildeki metne
 * bağlanır, böylece hangi dilde onaylandığı kayıtlıdır. Tekrar onay sessizce yok sayılır.
 */
export async function acceptConsent(actor: UserActor, legalTextId: string, meta: Pick<RequestMeta, "ip" | "userAgent">) {
  const current = await currentPersonnelText();
  const [text] = await db().select().from(legalTexts).where(eq(legalTexts.id, legalTextId)).limit(1);
  if (!current || !text || text.kind !== PERSONNEL_KIND || text.version !== current.version || !text.publishedAt) {
    throw new ValidationError("legal_text_outdated");
  }
  if (!(await pendingConsent(actor.userId))) return;
  await withActor(actor, (tx) =>
    tx
      .insert(consents)
      .values({ userId: actor.userId, legalTextId, ip: meta.ip, userAgent: meta.userAgent?.slice(0, 512) ?? null })
      .onConflictDoNothing(),
  );
}

export async function listTexts(actor: Actor, kind: LegalKind): Promise<LegalText[]> {
  assertKind(actor, kind);
  return db().select().from(legalTexts).where(eq(legalTexts.kind, kind)).orderBy(desc(legalTexts.version), legalTexts.locale);
}

export async function listPersonnelTexts(actor: Actor): Promise<LegalText[]> {
  return listTexts(actor, PERSONNEL_KIND);
}

export async function getLegalText(actor: Actor, id: string): Promise<LegalText> {
  const [row] = await db().select().from(legalTexts).where(eq(legalTexts.id, id)).limit(1);
  if (!row) throw new NotFoundError("legal_text");
  assertKind(actor, row.kind);
  return row;
}

function validateText(input: { title: string; body: string }) {
  const title = input.title.trim();
  const body = input.body.trim();
  if (title.length < 3) throw new ValidationError("invalid_title");
  if (body.length < 20) throw new ValidationError("invalid_body");
  return { title, body };
}

/**
 * Yeni taslak (dil başına bir satır). Aynı tür ve dilde yayınlanmamış taslak varsa önce o düzenlenmeli.
 * Çok dilli türde diğer dilin taslağı varsa aynı sürüm numarasını alır.
 */
export async function createDraft(
  actor: Actor,
  input: { title: string; body: string },
  kind: LegalKind = PERSONNEL_KIND,
  locale = "tr",
): Promise<{ id: string }> {
  assertKind(actor, kind);
  if (!(LEGAL_KINDS[kind].locales as readonly string[]).includes(locale)) throw new ValidationError("invalid_input");
  const values = validateText(input);
  const drafts = await db()
    .select({ locale: legalTexts.locale, version: legalTexts.version })
    .from(legalTexts)
    .where(and(eq(legalTexts.kind, kind), isNull(legalTexts.publishedAt)));
  if (drafts.some((d) => d.locale === locale)) throw new ValidationError("draft_exists");
  let version = drafts[0]?.version;
  if (version === undefined) {
    const [{ v } = { v: 0 }] = await db().select({ v: max(legalTexts.version) }).from(legalTexts).where(eq(legalTexts.kind, kind));
    version = (v ?? 0) + 1;
  }
  const [row] = await withActor(actor, (tx) =>
    tx
      .insert(legalTexts)
      .values({ kind, locale, version, ...values, createdBy: actor.kind === "user" ? actor.userId : null })
      .returning({ id: legalTexts.id }),
  );
  return { id: row!.id };
}

export async function updateDraft(actor: Actor, id: string, input: { title: string; body: string }): Promise<void> {
  const values = validateText(input);
  const existing = await getLegalText(actor, id);
  if (existing.publishedAt) throw new ValidationError("already_published");
  await withActor(actor, (tx) => tx.update(legalTexts).set(values).where(eq(legalTexts.id, id)));
}

/**
 * Yayınlar; bu andan sonra metin değiştirilemez ve herkes bir sonraki girişte yeniden onaylar.
 * Çok dilli türde aynı sürümün bütün dilleri birlikte yayınlanır; eksik dil varsa yayınlanmaz.
 */
export async function publishText(actor: Actor, id: string): Promise<void> {
  const existing = await getLegalText(actor, id);
  if (existing.publishedAt) throw new ValidationError("already_published");
  const siblings = await db()
    .select({ id: legalTexts.id, locale: legalTexts.locale })
    .from(legalTexts)
    .where(and(eq(legalTexts.kind, existing.kind), eq(legalTexts.version, existing.version), isNull(legalTexts.publishedAt)));
  const locales = new Set(siblings.map((s) => s.locale));
  if (LEGAL_KINDS[existing.kind].locales.some((l) => !locales.has(l))) throw new ValidationError("legal_locale_missing");
  const now = new Date();
  await withActor(actor, async (tx) => {
    for (const s of siblings) await tx.update(legalTexts).set({ publishedAt: now }).where(eq(legalTexts.id, s.id));
  });
}
