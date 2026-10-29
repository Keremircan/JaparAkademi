import { and, asc, count, desc, eq, inArray, isNull, max, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Actor } from "@/server/authz/actor";
import { assertNotSelf, assertUser, hasAnyRole, hasOwnRole, hasRole } from "@/server/authz/policy";
import { assertDifferentApprover, recordOwnerAction } from "@/server/services/owner-actions";
import { db, type DbOrTx, type Tx } from "@/server/db/client";
import {
  approvals,
  contents,
  mediaAssets,
  moduleContents,
  modules,
  orgUnits,
  planModules,
  positionCardReviews,
  positionCardVersions,
  positions,
  practiceTasks,
  trainingPlans,
  users,
  type PlanModuleSettings,
  type PlanOverrides,
} from "@/server/db/schema";
import { withActor } from "@/server/db/with-actor";
import { ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { getSetting } from "@/server/services/settings";
import { cardOnSubmit, isEditable, onApprove, onReject, pendingStep } from "@/server/state/position-card";
import type { VersionStatus } from "@/server/state/content";
import { canApproveOhs, canApproveSection, canDraftContent, canUseLibrary, canViewContent, contentAccessFor, type ContentAccess } from "../content/access";
import { assignWaitingForPosition } from "../assignments/engine";
import { commonModulesFor, type ModuleKind } from "../modules";
import {
  cardContentIds,
  missingSections,
  ohsFingerprint,
  parseCardSections,
  type CardIdentity,
  type CardSectionKey,
  type CardSections,
  type StoredCard,
} from "./card-schema";
import { parseModuleSettings, parsePlanOverrides } from "./plan-settings";
import { notifyApprovalPending, resolveNotifications } from "../notifications";

/**
 * Pozisyon kartı ve eğitim planı (SPEC Bölüm 5, 4.3). Plan, kart sürümünün parçasıdır (karar #44):
 * plan değişikliği yeni kart sürümü açar ve aynı onaydan geçer.
 * Yetki (karar #43): taslak = kapsamdaki bölüm sorumlusu, kendi birimindeki eğitmen; İSG uzmanı yalnızca
 * 9. bölümü ve İSG modüllerini değiştirebilir. İK ve İSG uzmanı tüm kartları okur.
 */

function assertLibrary(actor: Actor) {
  if (actor.kind === "user" && !canUseLibrary(actor)) throw new ForbiddenError("positions.view");
}

type PositionRow = typeof positions.$inferSelect;
type CardRow = typeof positionCardVersions.$inferSelect;

const ref = (p: Pick<PositionRow, "orgUnitId">) => ({ ownerOrgUnitId: p.orgUnitId, isOhs: false });

/** Kart taslak yetkisi: "full" (tüm kart) veya "ohs" (yalnızca İSG bölümü ve İSG modülleri). */
function draftMode(access: ContentAccess, p: PositionRow): "full" | "ohs" | null {
  if (p.status !== "active") return null;
  // İK birime ait içerikte taslak hazırlamaz (canDraftContent false döner); İSG uzmanı sınırlı düzenler
  if (canDraftContent(access, ref(p))) return "full";
  return hasRole(access.actor, "ohs_specialist") ? "ohs" : null;
}

async function loadPosition(actor: Actor, positionId: string, conn: DbOrTx = db()) {
  assertLibrary(actor);
  const [position] = await conn.select().from(positions).where(eq(positions.id, positionId)).limit(1);
  if (!position) throw new NotFoundError("position");
  const access = await contentAccessFor(actor, conn);
  if (!canViewContent(access, ref(position))) throw new NotFoundError("position");
  return { position, access };
}

async function latestCard(conn: DbOrTx, positionId: string, lock = false) {
  const q = conn
    .select()
    .from(positionCardVersions)
    .where(eq(positionCardVersions.positionId, positionId))
    .orderBy(desc(positionCardVersions.version))
    .limit(1);
  const [row] = lock ? await q.for("update") : await q;
  return row ?? null;
}

async function currentPublished(conn: DbOrTx, positionId: string) {
  const [row] = await conn
    .select()
    .from(positionCardVersions)
    .where(and(eq(positionCardVersions.positionId, positionId), eq(positionCardVersions.status, "published")))
    .orderBy(desc(positionCardVersions.version))
    .limit(1);
  return row ?? null;
}

async function planOf(conn: DbOrTx, cardVersionId: string) {
  const [plan] = await conn.select().from(trainingPlans).where(eq(trainingPlans.cardVersionId, cardVersionId)).limit(1);
  if (!plan) throw new NotFoundError("plan");
  return plan;
}

// ---------------------------------------------------------------------------
// Künye
// ---------------------------------------------------------------------------

export async function identityOf(conn: DbOrTx, positionId: string): Promise<CardIdentity> {
  const parentUnit = alias(orgUnits, "parent_unit");
  const sup = alias(positions, "sup");
  const dep = alias(positions, "dep");
  const [row] = await conn
    .select({
      positionName: positions.name,
      positionCode: positions.code,
      unitName: orgUnits.name,
      unitKind: orgUnits.kind,
      parentName: parentUnit.name,
      supervisorName: sup.name,
      deputyName: dep.name,
      collarType: positions.collarType,
      shiftPattern: positions.shiftPattern,
    })
    .from(positions)
    .innerJoin(orgUnits, eq(orgUnits.id, positions.orgUnitId))
    .leftJoin(parentUnit, eq(parentUnit.id, orgUnits.parentId))
    .leftJoin(sup, eq(sup.id, positions.supervisorPositionId))
    .leftJoin(dep, eq(dep.id, positions.deputyPositionId))
    .where(eq(positions.id, positionId))
    .limit(1);
  if (!row) throw new NotFoundError("position");
  return {
    positionName: row.positionName,
    positionCode: row.positionCode,
    unitName: row.unitName,
    departmentName: row.unitKind === "section" ? row.parentName : row.unitName,
    supervisorName: row.supervisorName,
    deputyName: row.deputyName,
    collarType: row.collarType,
    shiftPattern: row.shiftPattern,
  };
}

// ---------------------------------------------------------------------------
// Pozisyon listesi (kart durumu ve güncellik)
// ---------------------------------------------------------------------------

export type PositionCardListItem = {
  positionId: string;
  name: string;
  code: string;
  unitName: string;
  parentName: string | null;
  publishedVersion: number | null;
  latestVersion: number | null;
  latestStatus: VersionStatus | null;
  lastReviewedAt: Date | null;
  stale: boolean;
};

export async function listPositionCards(actor: Actor): Promise<PositionCardListItem[]> {
  assertLibrary(actor);
  const access = await contentAccessFor(actor);
  const parentUnit = alias(orgUnits, "parent_unit");
  const rows = await db()
    .select({
      positionId: positions.id,
      name: positions.name,
      code: positions.code,
      orgUnitId: positions.orgUnitId,
      unitName: orgUnits.name,
      parentName: parentUnit.name,
    })
    .from(positions)
    .innerJoin(orgUnits, eq(orgUnits.id, positions.orgUnitId))
    .leftJoin(parentUnit, eq(parentUnit.id, orgUnits.parentId))
    .where(eq(positions.status, "active"))
    .orderBy(asc(sql`coalesce(${parentUnit.name}, ${orgUnits.name})`), asc(orgUnits.name), asc(positions.name));
  const visible = rows.filter((r) => canViewContent(access, { ownerOrgUnitId: r.orgUnitId, isOhs: false }));
  if (visible.length === 0) return [];

  const ids = visible.map((v) => v.positionId);
  const versions = await db()
    .select({
      id: positionCardVersions.id,
      positionId: positionCardVersions.positionId,
      version: positionCardVersions.version,
      status: positionCardVersions.status,
      publishedAt: positionCardVersions.publishedAt,
    })
    .from(positionCardVersions)
    .where(inArray(positionCardVersions.positionId, ids))
    .orderBy(desc(positionCardVersions.version));
  const reviews = await db()
    .select({ positionId: positionCardVersions.positionId, at: max(positionCardReviews.reviewedAt) })
    .from(positionCardReviews)
    .innerJoin(positionCardVersions, eq(positionCardVersions.id, positionCardReviews.cardVersionId))
    .where(inArray(positionCardVersions.positionId, ids))
    .groupBy(positionCardVersions.positionId);
  const reviewMap = new Map(reviews.map((r) => [r.positionId, r.at]));
  const maxAge = await getSetting("content.review_max_age_months");
  const staleBefore = new Date();
  staleBefore.setMonth(staleBefore.getMonth() - maxAge);

  return visible.map((p) => {
    const own = versions.filter((v) => v.positionId === p.positionId);
    const published = own.find((v) => v.status === "published");
    const reviewed = reviewMap.get(p.positionId) ?? null;
    const lastReviewedAt = [published?.publishedAt, reviewed].filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
    return {
      positionId: p.positionId,
      name: p.name,
      code: p.code,
      unitName: p.unitName,
      parentName: p.parentName,
      publishedVersion: published?.version ?? null,
      latestVersion: own[0]?.version ?? null,
      latestStatus: own[0]?.status ?? null,
      lastReviewedAt,
      stale: !!published && !!lastReviewedAt && lastReviewedAt < staleBefore,
    };
  });
}

// ---------------------------------------------------------------------------
// Kart ayrıntısı
// ---------------------------------------------------------------------------

export type CardVersionSummary = {
  id: string;
  version: number;
  status: VersionStatus;
  changeNote: string | null;
  ohsSectionChanged: boolean;
  createdByName: string;
  createdAt: Date;
  submittedAt: Date | null;
  publishedAt: Date | null;
  isCurrent: boolean;
};

export type CardOverview = {
  position: { id: string; name: string; code: string; orgUnitId: string; collarType: "blue" | "white"; active: boolean };
  identity: CardIdentity;
  versions: CardVersionSummary[];
  approvals: { versionId: string; step: "section" | "ohs"; decision: "approved" | "rejected" | "auto_self"; comment: string | null; decidedByName: string; decidedAt: Date }[];
  reviews: { versionId: string; note: string | null; reviewedByName: string; reviewedAt: Date }[];
  lastReviewedAt: Date | null;
  stale: boolean;
  can: { create: boolean; edit: boolean; editMode: "full" | "ohs" | null; newVersion: boolean; discard: boolean; approve: boolean; review: boolean };
};

export async function getCardOverview(actor: Actor, positionId: string): Promise<CardOverview> {
  const { position, access } = await loadPosition(actor, positionId);
  const [identity, versions] = await Promise.all([
    identityOf(db(), positionId),
    db()
      .select({
        id: positionCardVersions.id,
        version: positionCardVersions.version,
        status: positionCardVersions.status,
        changeNote: positionCardVersions.changeNote,
        ohsSectionChanged: positionCardVersions.ohsSectionChanged,
        createdByName: users.name,
        createdAt: positionCardVersions.createdAt,
        submittedAt: positionCardVersions.submittedAt,
        submittedBy: positionCardVersions.submittedBy,
        publishedAt: positionCardVersions.publishedAt,
      })
      .from(positionCardVersions)
      .innerJoin(users, eq(users.id, positionCardVersions.createdBy))
      .where(eq(positionCardVersions.positionId, positionId))
      .orderBy(desc(positionCardVersions.version)),
  ]);
  const versionIds = versions.map((v) => v.id);
  const [approvalRows, reviewRows] = versionIds.length
    ? await Promise.all([
        db()
          .select({
            versionId: approvals.subjectId,
            step: approvals.step,
            decision: approvals.decision,
            comment: approvals.comment,
            decidedByName: users.name,
            decidedAt: approvals.decidedAt,
          })
          .from(approvals)
          .innerJoin(users, eq(users.id, approvals.decidedBy))
          .where(and(eq(approvals.subjectType, "position_card_version"), inArray(approvals.subjectId, versionIds)))
          .orderBy(asc(approvals.decidedAt)),
        db()
          .select({ versionId: positionCardReviews.cardVersionId, note: positionCardReviews.note, reviewedByName: users.name, reviewedAt: positionCardReviews.reviewedAt })
          .from(positionCardReviews)
          .innerJoin(users, eq(users.id, positionCardReviews.reviewedBy))
          .where(inArray(positionCardReviews.cardVersionId, versionIds))
          .orderBy(desc(positionCardReviews.reviewedAt)),
      ])
    : [[], []];

  const published = versions.find((v) => v.status === "published");
  const lastReviewedAt =
    [published?.publishedAt, reviewRows[0]?.reviewedAt].filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  const maxAge = await getSetting("content.review_max_age_months");
  const staleBefore = new Date();
  staleBefore.setMonth(staleBefore.getMonth() - maxAge);

  const latest = versions[0];
  const mode = draftMode(access, position);
  const step = latest ? pendingStep(latest.status) : null;
  const selfSubmitted = actor.kind === "user" && latest?.submittedBy === actor.userId;
  return {
    position: { id: position.id, name: position.name, code: position.code, orgUnitId: position.orgUnitId, collarType: position.collarType, active: position.status === "active" },
    identity,
    versions: versions.map((v) => ({
      id: v.id,
      version: v.version,
      status: v.status,
      changeNote: v.changeNote,
      ohsSectionChanged: v.ohsSectionChanged,
      createdByName: v.createdByName,
      createdAt: v.createdAt,
      submittedAt: v.submittedAt,
      publishedAt: v.publishedAt,
      isCurrent: v.id === published?.id,
    })),
    approvals: approvalRows,
    reviews: reviewRows,
    lastReviewedAt,
    stale: !!lastReviewedAt && lastReviewedAt < staleBefore,
    can: {
      create: mode === "full" && !latest,
      edit: !!mode && !!latest && isEditable(latest.status),
      editMode: mode,
      newVersion: !!mode && latest?.status === "published",
      discard: !!mode && !!latest && isEditable(latest.status) && latest.version > 1,
      approve:
        !!latest &&
        !selfSubmitted &&
        ((step === "section" && canApproveSection(access, ref(position))) || (step === "ohs" && canApproveOhs(access))),
      review: !!published && canApproveSection(access, ref(position)),
    },
  };
}

// ---------------------------------------------------------------------------
// Kart sürümü + plan görünümü
// ---------------------------------------------------------------------------

export type PlanItemView = {
  moduleId: string;
  kind: ModuleKind;
  title: string;
  durationMin: number;
  isOhs: boolean;
  remoteAllowed: boolean;
  validityMonths: number | null;
  archived: boolean;
  isCardModule: boolean;
  itemCount: number;
  isRequired: boolean;
  prerequisiteModuleIds: string[];
  settings: PlanModuleSettings;
};

export type CardVersionView = {
  id: string;
  positionId: string;
  version: number;
  status: VersionStatus;
  sections: CardSections;
  identity: CardIdentity;
  plan: { id: string; overrides: PlanOverrides; items: PlanItemView[] };
  commonModules: { id: string; kind: ModuleKind; title: string; durationMin: number; isOhs: boolean }[];
  linkedContents: { id: string; title: string; type: string }[];
};

export async function getCardVersion(actor: Actor, versionId: string): Promise<CardVersionView> {
  const [card] = await db().select().from(positionCardVersions).where(eq(positionCardVersions.id, versionId)).limit(1);
  if (!card) throw new NotFoundError("card_version");
  const { position } = await loadPosition(actor, card.positionId);
  return buildCardView(card, position);
}

async function buildCardView(card: CardRow, position: PositionRow): Promise<CardVersionView> {
  const stored = card.sections as StoredCard;
  const parsed = parseCardSections(stored);
  const sections = parsed.success ? parsed.data : parseCardSections({}).data!;
  const identity = stored.identity ?? (await identityOf(db(), position.id));
  const plan = await planOf(db(), card.id);
  const items = await planItems(db(), plan.id);
  const linkIds = cardContentIds(sections);
  const linked = linkIds.length
    ? await db().select({ id: contents.id, title: contents.title, type: contents.type }).from(contents).where(inArray(contents.id, linkIds))
    : [];
  return {
    id: card.id,
    positionId: card.positionId,
    version: card.version,
    status: card.status,
    sections,
    identity,
    plan: { id: plan.id, overrides: plan.overrides, items },
    commonModules: await commonModulesFor(identity.collarType),
    linkedContents: linked,
  };
}

async function planItems(conn: DbOrTx, planId: string): Promise<PlanItemView[]> {
  const rows = await conn
    .select({ pm: planModules, m: modules })
    .from(planModules)
    .innerJoin(modules, eq(modules.id, planModules.moduleId))
    .where(eq(planModules.planId, planId))
    .orderBy(asc(planModules.sortOrder));
  const ids = rows.map((r) => r.m.id);
  const [contentCounts, taskCounts] = ids.length
    ? await Promise.all([
        conn.select({ id: moduleContents.moduleId, n: count() }).from(moduleContents).where(inArray(moduleContents.moduleId, ids)).groupBy(moduleContents.moduleId),
        conn
          .select({ id: practiceTasks.moduleId, n: count() })
          .from(practiceTasks)
          .where(and(inArray(practiceTasks.moduleId, ids), isNull(practiceTasks.archivedAt)))
          .groupBy(practiceTasks.moduleId),
      ])
    : [[], []];
  const counts = new Map([...contentCounts, ...taskCounts].map((r) => [r.id, Number(r.n)]));
  return rows.map(({ pm, m }) => ({
    moduleId: m.id,
    kind: m.kind,
    title: m.title,
    durationMin: m.durationMin,
    isOhs: m.isOhs,
    remoteAllowed: m.remoteAllowed,
    validityMonths: m.validityMonths,
    archived: m.archivedAt !== null,
    isCardModule: m.cardPositionId !== null,
    itemCount: counts.get(m.id) ?? 0,
    isRequired: pm.isRequired,
    prerequisiteModuleIds: pm.prerequisiteModuleIds,
    settings: pm.settings,
  }));
}

/** Düzenlenebilir (son taslak/reddedilen) kart sürümü. */
export async function getEditableCard(actor: Actor, positionId: string): Promise<CardVersionView & { mode: "full" | "ohs" }> {
  const { position, access } = await loadPosition(actor, positionId);
  const mode = draftMode(access, position);
  if (!mode) throw new ForbiddenError("positions.draft");
  const latest = await latestCard(db(), positionId);
  if (!latest || !isEditable(latest.status)) throw new ValidationError("version_not_editable");
  return { ...(await buildCardView(latest, position)), mode };
}

/** Plana eklenebilecek modüller: pozisyonun birimi ve departmanındaki (ortak ve başka kartların modülleri hariç). */
export async function planCandidates(actor: Actor, positionId: string) {
  const { position, access } = await loadPosition(actor, positionId);
  const [unit] = await db().select({ parentId: orgUnits.parentId }).from(orgUnits).where(eq(orgUnits.id, position.orgUnitId));
  const units = [position.orgUnitId, ...(unit?.parentId ? [unit.parentId] : [])];
  const rows = await db()
    .select()
    .from(modules)
    .where(and(inArray(modules.ownerOrgUnitId, units), isNull(modules.archivedAt), or(isNull(modules.cardPositionId), eq(modules.cardPositionId, positionId))))
    .orderBy(asc(modules.title));
  return rows
    .filter((m) => canViewContent(access, m))
    .map((m) => ({ id: m.id, kind: m.kind, title: m.title, durationMin: m.durationMin, isOhs: m.isOhs, isCardModule: m.cardPositionId !== null }));
}

// ---------------------------------------------------------------------------
// Kart oluşturma ve taslak
// ---------------------------------------------------------------------------

/** Pozisyonun "Pozisyon kartı" teorik modülü (yoksa oluşturulur — karar #47). */
async function ensureCardModule(tx: Tx, actor: Actor & { kind: "user" }, position: PositionRow): Promise<string> {
  const [existing] = await tx.select({ id: modules.id }).from(modules).where(eq(modules.cardPositionId, position.id)).limit(1);
  if (existing) return existing.id;
  const [row] = await tx
    .insert(modules)
    .values({
      kind: "theory",
      title: `Pozisyon kartı: ${position.name}`,
      durationMin: 60,
      ownerOrgUnitId: position.orgUnitId,
      cardPositionId: position.id,
      createdBy: actor.userId,
    })
    .returning({ id: modules.id });
  return row!.id;
}

export async function createCard(actor: Actor, positionId: string): Promise<{ versionId: string }> {
  assertUser(actor);
  return withActor(actor, async (tx) => {
    const { position, access } = await loadPosition(actor, positionId, tx);
    if (draftMode(access, position) !== "full") throw new ForbiddenError("positions.draft");
    if (await latestCard(tx, positionId, true)) throw new ValidationError("card_exists");
    const [card] = await tx
      .insert(positionCardVersions)
      .values({ positionId, version: 1, sections: {}, createdBy: actor.userId })
      .returning({ id: positionCardVersions.id });
    const [plan] = await tx.insert(trainingPlans).values({ cardVersionId: card!.id }).returning({ id: trainingPlans.id });
    const cardModuleId = await ensureCardModule(tx, actor, position);
    await tx.insert(planModules).values({ planId: plan!.id, moduleId: cardModuleId, sortOrder: 0 });
    return { versionId: card!.id };
  });
}

async function editableForWrite(tx: Tx, actor: Actor, positionId: string) {
  const { position, access } = await loadPosition(actor, positionId, tx);
  const mode = draftMode(access, position);
  if (!mode) throw new ForbiddenError("positions.draft");
  const latest = await latestCard(tx, positionId, true);
  if (!latest || !isEditable(latest.status)) throw new ValidationError("version_not_editable");
  return { position, access, mode, latest };
}

/** Kart bölümlerini kaydeder (eksik olabilir). Reddedilmiş sürüm kaydedilince yeniden taslak olur. */
export async function saveCardSections(actor: Actor, positionId: string, input: unknown): Promise<void> {
  assertUser(actor);
  const parsed = parseCardSections(input);
  if (!parsed.success) throw new ValidationError("sections_invalid", parsed.error.issues.slice(0, 5));
  const sections = parsed.data;
  await withActor(actor, async (tx) => {
    const { access, mode, latest } = await editableForWrite(tx, actor, positionId);
    const before = parseCardSections(latest.sections).data ?? parseCardSections({}).data!;
    if (mode === "ohs") {
      const strip = (s: CardSections) => JSON.stringify({ ...s, ohs: null });
      if (strip(before) !== strip(sections)) throw new ForbiddenError("positions.ohs_only");
    }
    // Bağlantılı içerikler görülebilir ve arşivsiz olmalı (önceden bağlı olanlar kalabilir)
    const prior = new Set(cardContentIds(before));
    const added = cardContentIds(sections).filter((id) => !prior.has(id));
    if (added.length) {
      const rows = await tx.select().from(contents).where(inArray(contents.id, added));
      if (rows.length !== added.length || rows.some((c) => c.archivedAt || !canViewContent(access, c))) throw new ValidationError("content_invalid");
      for (const s of sections.reporting) {
        if (s.sampleContentId && added.includes(s.sampleContentId) && rows.find((r) => r.id === s.sampleContentId)?.type !== "form_template") {
          throw new ValidationError("content_invalid");
        }
      }
    }
    const diagram = sections.workflow.diagramAssetId;
    if (diagram && diagram !== before.workflow.diagramAssetId) {
      const [asset] = await tx.select({ kind: mediaAssets.kind, createdBy: mediaAssets.createdBy }).from(mediaAssets).where(eq(mediaAssets.id, diagram));
      if (!asset || asset.kind !== "image" || asset.createdBy !== actor.userId) throw new ValidationError("asset_invalid");
    }
    await tx
      .update(positionCardVersions)
      .set({ sections, status: latest.status === "rejected" ? "draft" : latest.status })
      .where(eq(positionCardVersions.id, latest.id));
  });
}

export type PlanItemInput = { moduleId: string; isRequired: boolean; prerequisiteModuleIds: string[]; settings: unknown };

/** Plan taslağını kaydeder: sıra, zorunluluk, ön koşullar ve sınav ayarları. */
export async function savePlan(actor: Actor, positionId: string, input: { overrides: unknown; items: PlanItemInput[] }): Promise<void> {
  assertUser(actor);
  if (input.items.length > 100) throw new ValidationError("too_many_items");
  const overrides = parsePlanOverrides(input.overrides);
  if (!overrides) throw new ValidationError("plan_settings_invalid");

  await withActor(actor, async (tx) => {
    const { position, access, mode, latest } = await editableForWrite(tx, actor, positionId);
    const plan = await planOf(tx, latest.id);
    const before = await tx.select().from(planModules).where(eq(planModules.planId, plan.id)).orderBy(asc(planModules.sortOrder));

    const ids = input.items.map((i) => i.moduleId);
    if (new Set(ids).size !== ids.length) throw new ValidationError("plan_duplicate_module");
    const rows = ids.length ? await tx.select().from(modules).where(inArray(modules.id, ids)) : [];
    const byId = new Map(rows.map((m) => [m.id, m]));
    if (rows.length !== ids.length) throw new ValidationError("module_invalid");

    // Pozisyon kartı modülü planda kalır
    const cardModule = rows.find((m) => m.cardPositionId === position.id);
    const beforeCard = before.find((b) => b.moduleId === cardModule?.id) ?? (await tx.select().from(modules).where(eq(modules.cardPositionId, position.id)))[0];
    if (!cardModule && beforeCard) throw new ValidationError("plan_card_module_required");

    const [unit] = await tx.select({ parentId: orgUnits.parentId }).from(orgUnits).where(eq(orgUnits.id, position.orgUnitId));
    const allowedUnits = new Set([position.orgUnitId, ...(unit?.parentId ? [unit.parentId] : [])]);
    const previously = new Set(before.map((b) => b.moduleId));

    const values = input.items.map((item, i) => {
      const m = byId.get(item.moduleId)!;
      if (m.ownerOrgUnitId === null) throw new ValidationError("plan_common_module");
      if (m.cardPositionId && m.cardPositionId !== position.id) throw new ValidationError("module_invalid");
      if (!previously.has(m.id)) {
        if (m.archivedAt || !allowedUnits.has(m.ownerOrgUnitId) || !canViewContent(access, m)) throw new ValidationError("module_invalid");
      }
      const earlier = new Set(ids.slice(0, i));
      const prereqs = [...new Set(item.prerequisiteModuleIds)];
      if (prereqs.some((p) => !earlier.has(p))) throw new ValidationError("plan_prerequisite_invalid");
      const settings = parseModuleSettings(m.kind, item.settings);
      if (!settings) throw new ValidationError("plan_settings_invalid");
      return { planId: plan.id, moduleId: m.id, sortOrder: i, isRequired: m.cardPositionId ? true : item.isRequired, prerequisiteModuleIds: prereqs, settings };
    });

    if (mode === "ohs") {
      // İSG uzmanı yalnızca İSG modüllerini ekler/çıkarır/düzenler; diğerlerinin sırası ve ayarları aynı kalmalı
      const isOhsModule = async (moduleId: string) =>
        byId.get(moduleId)?.isOhs ?? (await tx.select({ isOhs: modules.isOhs }).from(modules).where(eq(modules.id, moduleId)))[0]?.isOhs ?? false;
      const nonOhs = async (list: { moduleId: string; isRequired: boolean; prerequisiteModuleIds: string[]; settings: unknown }[]) => {
        const out = [];
        for (const x of list) if (!(await isOhsModule(x.moduleId))) out.push(JSON.stringify([x.moduleId, x.isRequired, x.prerequisiteModuleIds, x.settings]));
        return out.join("|");
      };
      if ((await nonOhs(before)) !== (await nonOhs(values)) || JSON.stringify(plan.overrides) !== JSON.stringify(overrides)) {
        throw new ForbiddenError("positions.ohs_only");
      }
    }

    await tx.delete(planModules).where(eq(planModules.planId, plan.id));
    if (values.length) await tx.insert(planModules).values(values);
    await tx.update(trainingPlans).set({ overrides }).where(eq(trainingPlans.id, plan.id));
    await tx
      .update(positionCardVersions)
      .set({ status: latest.status === "rejected" ? "draft" : latest.status, updatedAt: new Date() })
      .where(eq(positionCardVersions.id, latest.id));
  });
}

/** Plan onaya gönderilmeden önceki kontroller. Hata kodlarını döner (boşsa geçerli). */
async function planProblems(conn: DbOrTx, planId: string): Promise<string[]> {
  const items = await planItems(conn, planId);
  const problems: string[] = [];
  if (!items.some((i) => !i.isCardModule)) problems.push("plan_empty");
  if (items.some((i) => i.archived)) problems.push("plan_archived_module");
  if (items.some((i) => (i.kind === "theory" && !i.isCardModule && i.itemCount === 0) || (i.kind === "practice" && i.itemCount === 0))) {
    problems.push("plan_module_empty");
  }
  const examIdx = items.findIndex((i) => i.kind === "practice_exam");
  if (examIdx >= 0 && !items.slice(0, examIdx).some((i) => i.kind === "practice")) problems.push("plan_practice_exam_order");
  return problems;
}

export async function submitCard(actor: Actor, positionId: string, input: { changeNote: string | null }): Promise<{ status: VersionStatus }> {
  assertUser(actor);
  return withActor(actor, async (tx) => {
    const { position, access, latest } = await editableForWrite(tx, actor, positionId);
    const changeNote = input.changeNote?.trim() || null;
    if (latest.version > 1 && (!changeNote || changeNote.length < 3)) throw new ValidationError("change_note_required");
    if (changeNote && changeNote.length > 2000) throw new ValidationError("change_note_too_long");

    const parsed = parseCardSections(latest.sections);
    if (!parsed.success) throw new ValidationError("sections_invalid");
    const missing = missingSections(parsed.data);
    if (missing.length) throw new ValidationError("card_incomplete", missing);
    const problems = await planProblems(tx, (await planOf(tx, latest.id)).id);
    if (problems.length) throw new ValidationError(problems[0]!, problems);

    // 9. bölüm değişti mi (ilk sürümde her zaman İSG onayı)
    const published = await currentPublished(tx, positionId);
    const prev = published ? parseCardSections(published.sections).data : null;
    const ohsRequired = !prev || ohsFingerprint(prev) !== ohsFingerprint(parsed.data);

    const result = cardOnSubmit({
      ohsRequired,
      submitterCanApproveSection: canApproveSection(access, ref(position)),
      // Üst yönetici İSG kısayolundan yararlanmaz (karar #196)
      submitterIsOhsSpecialist: hasOwnRole(actor, "ohs_specialist"),
    });
    const now = new Date();
    await tx
      .update(positionCardVersions)
      .set({
        status: result.status === "published" ? latest.status : result.status,
        ohsSectionChanged: ohsRequired,
        changeNote,
        submittedBy: actor.userId,
        submittedAt: now,
      })
      .where(eq(positionCardVersions.id, latest.id));
    for (const step of result.autoSteps) {
      await tx.insert(approvals).values({ subjectType: "position_card_version", subjectId: latest.id, step, decision: "auto_self", decidedBy: actor.userId, decidedAt: now });
    }
    if (result.status === "published") await publishCard(tx, latest);
    else {
      await notifyApprovalPending(tx, {
        type: "card",
        step: result.status === "ohs_review" ? "ohs" : "section",
        ownerOrgUnitId: position.orgUnitId,
        subjectKey: `card:${latest.id}`,
        title: position.name,
        submittedBy: actor.userId,
      });
    }
    return { status: result.status };
  });
}

/** Yayın: künye kopyalanır, sürüm kilitlenir. */
async function publishCard(tx: Tx, card: CardRow) {
  const identity = await identityOf(tx, card.positionId);
  const sections = { ...(card.sections as object), identity };
  await tx
    .update(positionCardVersions)
    .set({ status: "published", sections, publishedAt: new Date() })
    .where(eq(positionCardVersions.id, card.id));
  // Kartı yayınlanmayı bekleyen yeni girişlere plan atanır (karar #49)
  await assignWaitingForPosition(tx, card.positionId, card.submittedBy);
}

async function loadPendingCard(tx: Tx, actor: Actor, versionId: string) {
  const [card] = await tx.select().from(positionCardVersions).where(eq(positionCardVersions.id, versionId)).limit(1).for("update");
  if (!card) throw new NotFoundError("card_version");
  const { position, access } = await loadPosition(actor, card.positionId, tx);
  const step = pendingStep(card.status);
  if (!step) throw new ValidationError("version_not_pending");
  const allowed = step === "section" ? canApproveSection(access, ref(position)) : canApproveOhs(access);
  if (!allowed) throw new ForbiddenError(step === "section" ? "content.approve_section" : "content.approve_ohs");
  if (card.submittedBy) assertNotSelf(actor, card.submittedBy);
  if (step === "ohs") await assertDifferentApprover(tx, actor, { type: "position_card_version", id: card.id, since: card.submittedAt });
  if (step === "ohs") await recordOwnerAction(tx, actor, "content.approve_ohs", { type: "position_card_version", id: card.id });
  return { card, step };
}

export async function approveCard(actor: Actor, versionId: string, comment?: string | null): Promise<{ status: VersionStatus }> {
  assertUser(actor);
  return withActor(actor, async (tx) => {
    const { card, step } = await loadPendingCard(tx, actor, versionId);
    await tx.insert(approvals).values({
      subjectType: "position_card_version",
      subjectId: card.id,
      step,
      decision: "approved",
      comment: comment?.trim() || null,
      decidedBy: actor.userId,
    });
    const next = onApprove(card.status, card.ohsSectionChanged);
    await resolveNotifications(tx, `card:${card.id}`);
    if (next === "published") await publishCard(tx, card);
    else {
      await tx.update(positionCardVersions).set({ status: next }).where(eq(positionCardVersions.id, card.id));
      const [pos] = await tx.select({ name: positions.name, orgUnitId: positions.orgUnitId }).from(positions).where(eq(positions.id, card.positionId)).limit(1);
      await notifyApprovalPending(tx, { type: "card", step: "ohs", ownerOrgUnitId: pos?.orgUnitId ?? null, subjectKey: `card:${card.id}`, title: pos?.name ?? "", submittedBy: card.submittedBy });
    }
    return { status: next };
  });
}

export async function rejectCard(actor: Actor, versionId: string, comment: string): Promise<void> {
  assertUser(actor);
  const reason = comment.trim();
  if (reason.length < 3) throw new ValidationError("reject_comment_required");
  if (reason.length > 2000) throw new ValidationError("comment_too_long");
  await withActor(actor, async (tx) => {
    const { card, step } = await loadPendingCard(tx, actor, versionId);
    await tx.insert(approvals).values({ subjectType: "position_card_version", subjectId: card.id, step, decision: "rejected", comment: reason, decidedBy: actor.userId });
    await resolveNotifications(tx, `card:${card.id}`);
    await tx.update(positionCardVersions).set({ status: onReject(card.status) }).where(eq(positionCardVersions.id, card.id));
  });
}

/** Yeni sürüm: yayındaki kartın bölümleri ve planı kopyalanır. */
export async function startNewCardVersion(actor: Actor, positionId: string): Promise<{ versionId: string }> {
  assertUser(actor);
  return withActor(actor, async (tx) => {
    const { position, access } = await loadPosition(actor, positionId, tx);
    if (!draftMode(access, position)) throw new ForbiddenError("positions.draft");
    const latest = await latestCard(tx, positionId, true);
    if (!latest || latest.status !== "published") throw new ValidationError("draft_exists");
    const sections: StoredCard = { ...(latest.sections as StoredCard) };
    delete sections.identity;
    const [card] = await tx
      .insert(positionCardVersions)
      .values({ positionId, version: latest.version + 1, sections, createdBy: actor.userId })
      .returning({ id: positionCardVersions.id });
    const oldPlan = await planOf(tx, latest.id);
    const [plan] = await tx.insert(trainingPlans).values({ cardVersionId: card!.id, overrides: oldPlan.overrides }).returning({ id: trainingPlans.id });
    const items = await tx.select().from(planModules).where(eq(planModules.planId, oldPlan.id));
    if (items.length) await tx.insert(planModules).values(items.map((i) => ({ ...i, planId: plan!.id })));
    return { versionId: card!.id };
  });
}

export async function discardCardDraft(actor: Actor, positionId: string): Promise<void> {
  assertUser(actor);
  await withActor(actor, async (tx) => {
    const { latest } = await editableForWrite(tx, actor, positionId);
    if (latest.version === 1) throw new ValidationError("cannot_discard");
    const [history] = await tx
      .select({ n: count() })
      .from(approvals)
      .where(and(eq(approvals.subjectType, "position_card_version"), eq(approvals.subjectId, latest.id)));
    if (Number(history?.n ?? 0) > 0) throw new ValidationError("cannot_discard");
    await tx.delete(positionCardVersions).where(eq(positionCardVersions.id, latest.id));
  });
}

/** "Gözden geçirdim": değişiklik yapmadan güncelliği onaylar (SPEC Bölüm 5). */
export async function reviewCard(actor: Actor, positionId: string, note: string | null): Promise<void> {
  assertUser(actor);
  const clean = note?.trim() || null;
  if (clean && clean.length > 1000) throw new ValidationError("comment_too_long");
  await withActor(actor, async (tx) => {
    const { position, access } = await loadPosition(actor, positionId, tx);
    if (!canApproveSection(access, ref(position))) throw new ForbiddenError("positions.review");
    const published = await currentPublished(tx, positionId);
    if (!published) throw new ValidationError("card_not_published");
    await tx.insert(positionCardReviews).values({ cardVersionId: published.id, note: clean, reviewedBy: actor.userId });
  });
}

// ---------------------------------------------------------------------------
// Onay kuyruğu
// ---------------------------------------------------------------------------

export type CardQueueItem = {
  versionId: string;
  positionId: string;
  positionName: string;
  unitName: string;
  version: number;
  step: "section" | "ohs";
  submittedByName: string | null;
  submittedAt: Date | null;
  changeNote: string | null;
};

export async function cardApprovalQueue(actor: Actor): Promise<CardQueueItem[]> {
  assertUser(actor);
  if (!hasAnyRole(actor, ["section_manager", "ohs_specialist"])) return [];
  const access = await contentAccessFor(actor);
  const submitter = alias(users, "submitter");
  const rows = await db()
    .select({
      versionId: positionCardVersions.id,
      positionId: positions.id,
      positionName: positions.name,
      orgUnitId: positions.orgUnitId,
      unitName: orgUnits.name,
      version: positionCardVersions.version,
      status: positionCardVersions.status,
      submittedBy: positionCardVersions.submittedBy,
      submittedByName: submitter.name,
      submittedAt: positionCardVersions.submittedAt,
      changeNote: positionCardVersions.changeNote,
    })
    .from(positionCardVersions)
    .innerJoin(positions, eq(positions.id, positionCardVersions.positionId))
    .innerJoin(orgUnits, eq(orgUnits.id, positions.orgUnitId))
    .leftJoin(submitter, eq(submitter.id, positionCardVersions.submittedBy))
    .where(inArray(positionCardVersions.status, ["section_review", "ohs_review"]))
    .orderBy(asc(positionCardVersions.submittedAt));
  return rows
    .filter((r) => {
      if (r.submittedBy === actor.userId) return false;
      const step = pendingStep(r.status);
      return step === "section" ? canApproveSection(access, { ownerOrgUnitId: r.orgUnitId, isOhs: false }) : canApproveOhs(access);
    })
    .map((r) => ({
      versionId: r.versionId,
      positionId: r.positionId,
      positionName: r.positionName,
      unitName: r.unitName,
      version: r.version,
      step: pendingStep(r.status)!,
      submittedByName: r.submittedByName,
      submittedAt: r.submittedAt,
      changeNote: r.changeNote,
    }));
}

export type { CardSectionKey, PlanModuleSettings, PlanOverrides };
