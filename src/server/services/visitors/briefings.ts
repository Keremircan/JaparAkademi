import { and, asc, desc, eq, inArray, isNotNull, isNull, max } from "drizzle-orm";
import { z } from "zod";
import type { Actor } from "@/server/authz/actor";
import { assertCan, assertUser, can } from "@/server/authz/policy";
import { db, type DbOrTx } from "@/server/db/client";
import { visitorBriefingCards, visitorBriefingQuestions, visitorBriefings, VISITOR_TYPES } from "@/server/db/schema";
import { withActor } from "@/server/db/with-actor";
import { NotFoundError, ValidationError } from "@/server/errors";
import { briefingProblems } from "@/server/state/visits";
import { assetsInfo, type AssetInfo } from "../media";
import { getSetting } from "../settings";

/**
 * Ziyaretçi bilgilendirme paketleri (SPEC 8.1–8.3, FG-8.2, karar #127): tip başına sürümlü,
 * kartlar + kontrol soruları, her metin TR ve EN. İSG uzmanı hazırlar ve tek adımda yayınlar.
 * Yayınlanan sürüm değiştirilemez (trigger); ziyaret gördüğü sürümü saklar (2.3).
 */
export type VisitorType = (typeof VISITOR_TYPES)[number];

export const briefingDraftSchema = z.object({
  cards: z
    .array(
      z.object({
        titleTr: z.string().max(200),
        bodyTr: z.string().max(5000),
        titleEn: z.string().max(200),
        bodyEn: z.string().max(5000),
        mediaAssetId: z.uuid().nullable(),
      }),
    )
    .max(30),
  questions: z
    .array(
      z.object({
        stemTr: z.string().max(500),
        stemEn: z.string().max(500),
        optionsTr: z.array(z.string().max(200)).min(2).max(6),
        optionsEn: z.array(z.string().max(200)).min(2).max(6),
        correctIndex: z.number().int().min(0).max(5),
      }),
    )
    .max(50),
});
export type BriefingDraft = z.infer<typeof briefingDraftSchema>;

/** Her tipin güncel yayını ve açık taslağı. */
export async function listBriefings(actor: Actor) {
  assertCan(actor, "visitor_briefings.manage");
  const rows = await db().select().from(visitorBriefings).orderBy(desc(visitorBriefings.version));
  return VISITOR_TYPES.map((type) => {
    const mine = rows.filter((r) => r.visitorType === type);
    return {
      type,
      current: mine.find((r) => r.publishedAt) ?? null,
      draft: mine.find((r) => !r.publishedAt) ?? null,
    };
  });
}

async function loadBriefing(id: string, conn: DbOrTx = db()) {
  const [briefing] = await conn.select().from(visitorBriefings).where(eq(visitorBriefings.id, id)).limit(1);
  if (!briefing) throw new NotFoundError("visitor_briefing");
  const [cards, questions] = await Promise.all([
    conn.select().from(visitorBriefingCards).where(eq(visitorBriefingCards.briefingId, id)).orderBy(asc(visitorBriefingCards.sortOrder)),
    conn.select().from(visitorBriefingQuestions).where(eq(visitorBriefingQuestions.briefingId, id)).orderBy(asc(visitorBriefingQuestions.sortOrder)),
  ]);
  return { briefing, cards, questions };
}

export async function getBriefing(actor: Actor, id: string) {
  assertCan(actor, "visitor_briefings.manage");
  const data = await loadBriefing(id);
  const ids = data.cards.map((c) => c.mediaAssetId).filter((x): x is string => !!x);
  const assets: Map<string, AssetInfo> = ids.length ? await assetsInfo(ids) : new Map();
  return { ...data, cards: data.cards.map((c) => ({ ...c, asset: c.mediaAssetId ? (assets.get(c.mediaAssetId) ?? null) : null })) };
}

/** Yayınlanmış güncel paket (2.3'te ziyaretçi ekranı kullanır). */
export async function currentBriefing(type: VisitorType, conn: DbOrTx = db()) {
  const [row] = await conn
    .select({ id: visitorBriefings.id })
    .from(visitorBriefings)
    .where(and(eq(visitorBriefings.visitorType, type), isNotNull(visitorBriefings.publishedAt)))
    .orderBy(desc(visitorBriefings.version))
    .limit(1);
  return row ? loadBriefing(row.id, conn) : null;
}

/** Yeni taslak: güncel yayının kopyasıyla başlar. Tip başına tek taslak. */
export async function createBriefingDraft(actor: Actor, type: VisitorType): Promise<{ id: string }> {
  assertCan(actor, "visitor_briefings.manage");
  assertUser(actor);
  if (!VISITOR_TYPES.includes(type)) throw new ValidationError("invalid_input");
  const [draft] = await db()
    .select({ id: visitorBriefings.id })
    .from(visitorBriefings)
    .where(and(eq(visitorBriefings.visitorType, type), isNull(visitorBriefings.publishedAt)))
    .limit(1);
  if (draft) throw new ValidationError("draft_exists");
  const [{ v } = { v: 0 }] = await db().select({ v: max(visitorBriefings.version) }).from(visitorBriefings).where(eq(visitorBriefings.visitorType, type));
  const current = await currentBriefing(type);
  return withActor(actor, async (tx) => {
    const [row] = await tx
      .insert(visitorBriefings)
      .values({ visitorType: type, version: (v ?? 0) + 1, createdBy: actor.userId })
      .returning({ id: visitorBriefings.id });
    if (current) await writeChildren(tx, row!.id, current);
    return { id: row!.id };
  });
}

async function writeChildren(tx: DbOrTx, briefingId: string, data: { cards: BriefingDraft["cards"]; questions: BriefingDraft["questions"] }) {
  if (data.cards.length) {
    await tx.insert(visitorBriefingCards).values(
      data.cards.map((c, i) => ({ briefingId, sortOrder: i + 1, titleTr: c.titleTr, bodyTr: c.bodyTr, titleEn: c.titleEn, bodyEn: c.bodyEn, mediaAssetId: c.mediaAssetId })),
    );
  }
  if (data.questions.length) {
    await tx.insert(visitorBriefingQuestions).values(
      data.questions.map((q, i) => ({
        briefingId,
        sortOrder: i + 1,
        stemTr: q.stemTr,
        stemEn: q.stemEn,
        optionsTr: q.optionsTr,
        optionsEn: q.optionsEn,
        correctIndex: q.correctIndex,
      })),
    );
  }
}

async function assertDraft(id: string) {
  const [row] = await db().select().from(visitorBriefings).where(eq(visitorBriefings.id, id)).limit(1);
  if (!row) throw new NotFoundError("visitor_briefing");
  if (row.publishedAt) throw new ValidationError("already_published");
  return row;
}

/** Taslak kaydı: kartlar ve sorular baştan yazılır (sıra listedeki sıradır). */
export async function saveBriefingDraft(actor: Actor, id: string, input: BriefingDraft): Promise<void> {
  assertCan(actor, "visitor_briefings.manage");
  const data = briefingDraftSchema.parse(input);
  for (const q of data.questions) {
    if (q.optionsTr.length !== q.optionsEn.length || q.correctIndex >= q.optionsTr.length) throw new ValidationError("briefing_question_invalid");
  }
  await assertDraft(id);
  await withActor(actor, async (tx) => {
    await tx.delete(visitorBriefingCards).where(eq(visitorBriefingCards.briefingId, id));
    await tx.delete(visitorBriefingQuestions).where(eq(visitorBriefingQuestions.briefingId, id));
    await writeChildren(tx, id, data);
    await tx.update(visitorBriefings).set({ updatedAt: new Date() }).where(eq(visitorBriefings.id, id));
  });
}

export async function publishBriefing(actor: Actor, id: string): Promise<void> {
  assertCan(actor, "visitor_briefings.manage");
  assertUser(actor);
  const row = await assertDraft(id);
  const data = await loadBriefing(id);
  const types = await getSetting("visitor.types");
  const problems = briefingProblems(data, types[row.visitorType].questionCount);
  if (problems.length) throw new ValidationError(problems[0]!, problems);
  // Görsel/video hazır olmalı
  const assetIds = data.cards.map((c) => c.mediaAssetId).filter((x): x is string => !!x);
  if (assetIds.length) {
    const info = await assetsInfo(assetIds);
    if (assetIds.some((a) => info.get(a)?.status !== "ready")) throw new ValidationError("briefing_media_not_ready");
  }
  await withActor(actor, (tx) => tx.update(visitorBriefings).set({ publishedAt: new Date(), publishedBy: actor.userId }).where(eq(visitorBriefings.id, id)));
}

export async function discardBriefingDraft(actor: Actor, id: string): Promise<void> {
  assertCan(actor, "visitor_briefings.manage");
  await assertDraft(id);
  await withActor(actor, async (tx) => {
    await tx.delete(visitorBriefingCards).where(eq(visitorBriefingCards.briefingId, id));
    await tx.delete(visitorBriefingQuestions).where(eq(visitorBriefingQuestions.briefingId, id));
    await tx.delete(visitorBriefings).where(eq(visitorBriefings.id, id));
  });
}

/** Paket kartındaki görsel/video: İSG uzmanı ve güvenlik görebilir (ziyaretçi erişimi 2.3). */
export async function canViewBriefingAsset(actor: Actor, assetId: string): Promise<boolean> {
  if (!can(actor, "visitor_briefings.manage") && !can(actor, "visits.view_all")) return false;
  const [row] = await db()
    .select({ id: visitorBriefingCards.id })
    .from(visitorBriefingCards)
    .where(inArray(visitorBriefingCards.mediaAssetId, [assetId]))
    .limit(1);
  return !!row;
}
