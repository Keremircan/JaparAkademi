import { and, desc, eq, isNotNull, isNull, max } from "drizzle-orm";
import type { Actor, UserActor } from "@/server/authz/actor";
import { assertCan } from "@/server/authz/policy";
import { db } from "@/server/db/client";
import { consents, legalTexts } from "@/server/db/schema";
import { withActor } from "@/server/db/with-actor";
import { NotFoundError, ValidationError } from "@/server/errors";
import type { RequestMeta } from "@/server/services/auth";

/**
 * KVKK aydınlatma metni ve onayı (SPEC 13.3). Metni İK yönetir (karar #5).
 * Kullanıcı en son yayınlanmış personel metnini onaylamadan uygulamaya giremez.
 */
const PERSONNEL_KIND = "kvkk_personnel" as const;

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

/** Kullanıcının onaylaması gereken metin (zaten onayladıysa null). */
export async function pendingConsent(userId: string): Promise<LegalText | null> {
  const text = await currentPersonnelText();
  if (!text) return null;
  const [done] = await db()
    .select({ id: consents.id })
    .from(consents)
    .where(and(eq(consents.userId, userId), eq(consents.legalTextId, text.id)))
    .limit(1);
  return done ? null : text;
}

/** Onayı kaydeder. Yalnızca güncel metin onaylanabilir; tekrar onay sessizce yok sayılır. */
export async function acceptConsent(actor: UserActor, legalTextId: string, meta: Pick<RequestMeta, "ip" | "userAgent">) {
  const current = await currentPersonnelText();
  if (!current || current.id !== legalTextId) throw new ValidationError("legal_text_outdated");
  await withActor(actor, (tx) =>
    tx
      .insert(consents)
      .values({ userId: actor.userId, legalTextId, ip: meta.ip, userAgent: meta.userAgent?.slice(0, 512) ?? null })
      .onConflictDoNothing(),
  );
}

export async function listPersonnelTexts(actor: Actor): Promise<LegalText[]> {
  assertCan(actor, "legal.manage");
  return db().select().from(legalTexts).where(eq(legalTexts.kind, PERSONNEL_KIND)).orderBy(desc(legalTexts.version));
}

export async function getLegalText(actor: Actor, id: string): Promise<LegalText> {
  assertCan(actor, "legal.manage");
  const [row] = await db().select().from(legalTexts).where(eq(legalTexts.id, id)).limit(1);
  if (!row) throw new NotFoundError("legal_text");
  return row;
}

function validateText(input: { title: string; body: string }) {
  const title = input.title.trim();
  const body = input.body.trim();
  if (title.length < 3) throw new ValidationError("invalid_title");
  if (body.length < 20) throw new ValidationError("invalid_body");
  return { title, body };
}

/** Yeni taslak sürüm. Yayınlanmamış başka taslak varsa önce o düzenlenmeli. */
export async function createDraft(actor: Actor, input: { title: string; body: string }): Promise<{ id: string }> {
  assertCan(actor, "legal.manage");
  const values = validateText(input);
  const [draft] = await db()
    .select({ id: legalTexts.id })
    .from(legalTexts)
    .where(and(eq(legalTexts.kind, PERSONNEL_KIND), isNull(legalTexts.publishedAt)))
    .limit(1);
  if (draft) throw new ValidationError("draft_exists");
  const [{ v } = { v: 0 }] = await db()
    .select({ v: max(legalTexts.version) })
    .from(legalTexts)
    .where(eq(legalTexts.kind, PERSONNEL_KIND));
  const [row] = await withActor(actor, (tx) =>
    tx
      .insert(legalTexts)
      .values({
        kind: PERSONNEL_KIND,
        version: (v ?? 0) + 1,
        ...values,
        createdBy: actor.kind === "user" ? actor.userId : null,
      })
      .returning({ id: legalTexts.id }),
  );
  return { id: row!.id };
}

export async function updateDraft(actor: Actor, id: string, input: { title: string; body: string }): Promise<void> {
  assertCan(actor, "legal.manage");
  const values = validateText(input);
  const existing = await getLegalText(actor, id);
  if (existing.publishedAt) throw new ValidationError("already_published");
  await withActor(actor, (tx) => tx.update(legalTexts).set(values).where(eq(legalTexts.id, id)));
}

/** Yayınlar; bu andan sonra metin değiştirilemez ve herkes bir sonraki girişte yeniden onaylar. */
export async function publishText(actor: Actor, id: string): Promise<void> {
  assertCan(actor, "legal.manage");
  const existing = await getLegalText(actor, id);
  if (existing.publishedAt) throw new ValidationError("already_published");
  await withActor(actor, (tx) => tx.update(legalTexts).set({ publishedAt: new Date() }).where(eq(legalTexts.id, id)));
}
