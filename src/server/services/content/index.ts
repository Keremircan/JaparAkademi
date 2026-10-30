import { and, asc, count, desc, eq, exists, inArray, isNotNull, isNull, max, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Actor } from "@/server/authz/actor";
import { assertNotSelf, assertUser, can, hasOwnRole, hasRole } from "@/server/authz/policy";
import { assertDifferentApprover, recordOwnerAction } from "@/server/services/owner-actions";
import { db, type DbOrTx, type Tx } from "@/server/db/client";
import {
  approvals,
  contents,
  contentTags,
  contentVersionAssets,
  contentVersionLocales,
  contentVersions,
  mediaAssets,
  orgUnits,
  tags,
  tagTypes,
  users,
} from "@/server/db/schema";
import { withActor } from "@/server/db/with-actor";
import { ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { isEditable, onApprove, onReject, onSubmit, pendingStep, type VersionStatus } from "@/server/state/content";
import { createRereadTasks } from "../assignments/engine";
import {
  canApproveOhs,
  canApproveSection,
  canArchiveContent,
  canDraftContent,
  canUseLibrary,
  canViewContent,
  contentAccessFor,
  type ContentAccess,
  type ContentRef,
} from "./access";
import { ASSET_KIND_FOR_TYPE, bodyAssetIds, bodyText, parseBody, type ContentBody, type ContentType } from "./body";
import { notifyApprovalPending, resolveNotifications } from "../notifications";

/**
 * İçerik kütüphanesi (SPEC 4.2, FG-2.1–2.5).
 * Türkçe ("tr" dil satırı) zorunludur; İngilizce ("en") isteğe bağlıdır ve aynı sürümle onaylanır (karar #207).
 * Kursiyer kendi dilini görür; İngilizcesi olmayan sürüm Türkçe gösterilir.
 */

export const CONTENT_LOCALE = "tr";
/** İsteğe bağlı ikinci dil. */
export const CONTENT_EXTRA_LOCALE = "en";
const PAGE_SIZE = 30;

function assertLibrary(actor: Actor) {
  if (actor.kind === "user" && !canUseLibrary(actor)) throw new ForbiddenError("content.view");
}

// ---------------------------------------------------------------------------
// Görünürlük filtresi (SQL) — access.ts'deki canViewContent ile aynı kural
// ---------------------------------------------------------------------------

function visibilityFilter(a: ContentAccess): SQL | undefined | false {
  const actor = a.actor;
  if (actor.kind === "system" || hasRole(actor, "hr") || hasRole(actor, "ohs_specialist")) return undefined;
  const parts: SQL[] = [];
  if (hasRole(actor, "section_manager") || hasRole(actor, "trainer")) parts.push(isNull(contents.ownerOrgUnitId));
  if (hasRole(actor, "section_manager") && !a.scope.all && a.scope.orgUnitIds.size > 0) {
    parts.push(inArray(contents.ownerOrgUnitId, [...a.scope.orgUnitIds]));
  }
  if (a.trainerUnits.size > 0) parts.push(inArray(contents.ownerOrgUnitId, [...a.trainerUnits]));
  if (parts.length === 0) return false;
  return or(...parts);
}

/**
 * Arama ifadesi: her kelime için aksansız önek eşleşmesi ("simple" + unaccent) veya Türkçe kök eşleşmesi.
 * Türkçe kök bulucu aksanlı metinde çalışmalı (güvenliği → güvenlik); aksansız eşleşmeyi "simple" sağlar.
 */
function searchQuery(q: string): SQL | null {
  const words = q
    .normalize("NFC")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 0)
    .slice(0, 8);
  if (words.length === 0) return null;
  const prefix = words.map((w) => `${w}:*`).join(" & ");
  const plain = words.join(" & ");
  return sql`(to_tsquery('simple', unaccent(lower(${prefix}))) || to_tsquery('turkish', lower(${plain})))`;
}

async function refreshSearchVector(tx: Tx, contentId: string, title: string, text: string) {
  const tagRows = await tx
    .select({ name: tags.name })
    .from(contentTags)
    .innerJoin(tags, eq(tags.id, contentTags.tagId))
    .where(eq(contentTags.contentId, contentId));
  const doc = [title, text, ...tagRows.map((t) => t.name)].join(" ").slice(0, 500_000);
  await tx
    .update(contents)
    .set({
      title,
      searchVector: sql`to_tsvector('turkish', lower(${doc})) || to_tsvector('simple', unaccent(lower(${doc})))`,
    })
    .where(eq(contents.id, contentId));
}

// ---------------------------------------------------------------------------
// Liste
// ---------------------------------------------------------------------------

export type ContentStatusFilter = "published" | "pending" | "draft" | "archived";

export type ContentListFilters = {
  q?: string;
  type?: ContentType;
  /** "common" = ortak içerik, aksi halde org birimi kimliği */
  owner?: string;
  status?: ContentStatusFilter;
  tagId?: string;
  page?: number;
};

export type ContentListItem = {
  id: string;
  title: string;
  type: ContentType;
  ownerOrgUnitId: string | null;
  ownerName: string | null;
  isOhs: boolean;
  commonTarget: "all" | "blue" | "white" | null;
  archived: boolean;
  publishedVersion: number | null;
  latestVersion: number;
  latestStatus: VersionStatus;
  updatedAt: Date;
};

export async function listContents(
  actor: Actor,
  filters: ContentListFilters,
): Promise<{ items: ContentListItem[]; total: number; page: number; pageSize: number }> {
  assertLibrary(actor);
  const access = await contentAccessFor(actor);
  const visible = visibilityFilter(access);
  const page = Math.max(1, Math.floor(filters.page ?? 1));
  if (visible === false) return { items: [], total: 0, page, pageSize: PAGE_SIZE };

  const conds: (SQL | undefined)[] = [visible];
  if (filters.type) conds.push(eq(contents.type, filters.type));
  if (filters.owner === "common") conds.push(isNull(contents.ownerOrgUnitId));
  else if (filters.owner) {
    // Departman seçilirse altındaki bölümler de dahil
    const children = db().select({ id: orgUnits.id }).from(orgUnits).where(eq(orgUnits.parentId, filters.owner));
    conds.push(or(eq(contents.ownerOrgUnitId, filters.owner), inArray(contents.ownerOrgUnitId, children)));
  }
  const versionWith = (statuses: VersionStatus[]) =>
    exists(
      db()
        .select({ one: sql`1` })
        .from(contentVersions)
        .where(and(eq(contentVersions.contentId, contents.id), inArray(contentVersions.status, statuses))),
    );
  switch (filters.status) {
    case "archived":
      conds.push(isNotNull(contents.archivedAt));
      break;
    case "published":
      conds.push(isNull(contents.archivedAt), isNotNull(contents.currentPublishedVersionId));
      break;
    case "pending":
      conds.push(isNull(contents.archivedAt), versionWith(["section_review", "ohs_review"]));
      break;
    case "draft":
      conds.push(isNull(contents.archivedAt), versionWith(["draft", "rejected"]));
      break;
    default:
      conds.push(isNull(contents.archivedAt));
  }
  if (filters.tagId) {
    conds.push(
      exists(
        db()
          .select({ one: sql`1` })
          .from(contentTags)
          .where(and(eq(contentTags.contentId, contents.id), eq(contentTags.tagId, filters.tagId))),
      ),
    );
  }
  const tsq = filters.q ? searchQuery(filters.q) : null;
  if (tsq) conds.push(sql`${contents.searchVector} @@ ${tsq}`);
  const where = and(...conds);

  const publishedVersion = alias(contentVersions, "published_version");
  const [rows, [totalRow]] = await Promise.all([
    db()
      .select({
        id: contents.id,
        title: contents.title,
        type: contents.type,
        ownerOrgUnitId: contents.ownerOrgUnitId,
        ownerName: orgUnits.name,
        isOhs: contents.isOhs,
        commonTarget: contents.commonTarget,
        archivedAt: contents.archivedAt,
        publishedVersion: publishedVersion.version,
        updatedAt: contents.updatedAt,
      })
      .from(contents)
      .leftJoin(orgUnits, eq(orgUnits.id, contents.ownerOrgUnitId))
      .leftJoin(publishedVersion, eq(publishedVersion.id, contents.currentPublishedVersionId))
      .where(where)
      .orderBy(
        ...(tsq ? [desc(sql`ts_rank(${contents.searchVector}, ${tsq})`)] : []),
        desc(contents.updatedAt),
        asc(contents.id),
      )
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db().select({ n: count() }).from(contents).where(where),
  ]);

  const latest = await latestVersions(rows.map((r) => r.id));
  return {
    items: rows.map((r) => {
      const l = latest.get(r.id)!;
      return {
        id: r.id,
        title: r.title,
        type: r.type,
        ownerOrgUnitId: r.ownerOrgUnitId,
        ownerName: r.ownerName,
        isOhs: r.isOhs,
        commonTarget: r.commonTarget,
        archived: r.archivedAt !== null,
        publishedVersion: r.publishedVersion,
        latestVersion: l.version,
        latestStatus: l.status,
        updatedAt: r.updatedAt,
      };
    }),
    total: Number(totalRow?.n ?? 0),
    page,
    pageSize: PAGE_SIZE,
  };
}

async function latestVersions(contentIds: string[]) {
  const map = new Map<string, { id: string; version: number; status: VersionStatus }>();
  if (contentIds.length === 0) return map;
  const maxes = db()
    .select({ contentId: contentVersions.contentId, v: max(contentVersions.version).as("v") })
    .from(contentVersions)
    .where(inArray(contentVersions.contentId, contentIds))
    .groupBy(contentVersions.contentId)
    .as("maxes");
  const rows = await db()
    .select({ id: contentVersions.id, contentId: contentVersions.contentId, version: contentVersions.version, status: contentVersions.status })
    .from(contentVersions)
    .innerJoin(maxes, and(eq(maxes.contentId, contentVersions.contentId), eq(maxes.v, contentVersions.version)));
  for (const r of rows) map.set(r.contentId, r);
  return map;
}

// ---------------------------------------------------------------------------
// Ayrıntı
// ---------------------------------------------------------------------------

async function loadContent(actor: Actor, contentId: string, conn: DbOrTx = db()) {
  assertLibrary(actor);
  const [content] = await conn.select().from(contents).where(eq(contents.id, contentId)).limit(1);
  if (!content) throw new NotFoundError("content");
  const access = await contentAccessFor(actor, conn);
  if (!canViewContent(access, content)) throw new NotFoundError("content");
  return { content, access };
}

export type ContentVersionSummary = {
  id: string;
  version: number;
  status: VersionStatus;
  changeNote: string | null;
  requireReread: boolean;
  createdByName: string;
  createdAt: Date;
  submittedAt: Date | null;
  publishedAt: Date | null;
  isCurrent: boolean;
};

export type ApprovalEntry = {
  versionId: string;
  step: "section" | "ohs";
  decision: "approved" | "rejected" | "auto_self";
  comment: string | null;
  decidedByName: string;
  decidedAt: Date;
};

export type ContentDetail = {
  id: string;
  type: ContentType;
  title: string;
  ownerOrgUnitId: string | null;
  ownerName: string | null;
  isOhs: boolean;
  commonTarget: "all" | "blue" | "white" | null;
  archivedAt: Date | null;
  currentPublishedVersionId: string | null;
  tags: { id: string; name: string; typeKey: TagTypeKey }[];
  versions: ContentVersionSummary[];
  approvals: ApprovalEntry[];
  can: {
    edit: boolean;
    newVersion: boolean;
    discard: boolean;
    approve: boolean;
    archive: boolean;
  };
};

export async function getContent(actor: Actor, contentId: string): Promise<ContentDetail> {
  const { content, access } = await loadContent(actor, contentId);
  const [owner] = content.ownerOrgUnitId
    ? await db().select({ name: orgUnits.name }).from(orgUnits).where(eq(orgUnits.id, content.ownerOrgUnitId)).limit(1)
    : [];

  const versions = await db()
    .select({
      id: contentVersions.id,
      version: contentVersions.version,
      status: contentVersions.status,
      changeNote: contentVersions.changeNote,
      requireReread: contentVersions.requireReread,
      createdByName: users.name,
      createdAt: contentVersions.createdAt,
      submittedAt: contentVersions.submittedAt,
      submittedBy: contentVersions.submittedBy,
      publishedAt: contentVersions.publishedAt,
    })
    .from(contentVersions)
    .innerJoin(users, eq(users.id, contentVersions.createdBy))
    .where(eq(contentVersions.contentId, contentId))
    .orderBy(desc(contentVersions.version));

  const approvalRows = versions.length
    ? await db()
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
        .where(and(eq(approvals.subjectType, "content_version"), inArray(approvals.subjectId, versions.map((v) => v.id))))
        .orderBy(asc(approvals.decidedAt))
    : [];

  const tagRows = await db()
    .select({ id: tags.id, name: tags.name, typeKey: tagTypes.key })
    .from(contentTags)
    .innerJoin(tags, eq(tags.id, contentTags.tagId))
    .innerJoin(tagTypes, eq(tagTypes.id, tags.tagTypeId))
    .where(eq(contentTags.contentId, contentId))
    .orderBy(asc(tagTypes.sortOrder), asc(tags.name));

  const latest = versions[0]!;
  const active = content.archivedAt === null;
  const drafter = active && canDraftContent(access, content);
  const step = pendingStep(latest.status);
  const selfSubmitted = actor.kind === "user" && latest.submittedBy === actor.userId;
  const approve =
    active &&
    !selfSubmitted &&
    ((step === "section" && canApproveSection(access, content)) || (step === "ohs" && canApproveOhs(access)));

  return {
    id: content.id,
    type: content.type,
    title: content.title,
    ownerOrgUnitId: content.ownerOrgUnitId,
    ownerName: owner?.name ?? null,
    isOhs: content.isOhs,
    commonTarget: content.commonTarget,
    archivedAt: content.archivedAt,
    currentPublishedVersionId: content.currentPublishedVersionId,
    tags: tagRows.map((r) => ({ ...r, typeKey: r.typeKey as TagTypeKey })),
    versions: versions.map((v) => ({
      id: v.id,
      version: v.version,
      status: v.status,
      changeNote: v.changeNote,
      requireReread: v.requireReread,
      createdByName: v.createdByName,
      createdAt: v.createdAt,
      submittedAt: v.submittedAt,
      publishedAt: v.publishedAt,
      isCurrent: v.id === content.currentPublishedVersionId,
    })),
    approvals: approvalRows,
    can: {
      edit: drafter && isEditable(latest.status),
      newVersion: drafter && latest.status === "published",
      discard: drafter && isEditable(latest.status) && latest.version > 1,
      approve,
      archive: active && canArchiveContent(access, content),
    },
  };
}

export type VersionView = {
  id: string;
  contentId: string;
  version: number;
  status: VersionStatus;
  type: ContentType;
  title: string;
  body: ContentBody;
  /** İngilizce başlık ve gövde (yoksa null). */
  en: { title: string; body: ContentBody } | null;
};

/** Bir sürümün başlık ve gövdesi (görüntüleyici ve düzenleyici için). */
export async function getVersion(actor: Actor, versionId: string): Promise<VersionView> {
  const [v] = await db()
    .select({ id: contentVersions.id, contentId: contentVersions.contentId, version: contentVersions.version, status: contentVersions.status })
    .from(contentVersions)
    .where(eq(contentVersions.id, versionId))
    .limit(1);
  if (!v) throw new NotFoundError("content_version");
  const { content } = await loadContent(actor, v.contentId);
  const rows = await db()
    .select({ locale: contentVersionLocales.locale, title: contentVersionLocales.title, body: contentVersionLocales.body })
    .from(contentVersionLocales)
    .where(eq(contentVersionLocales.contentVersionId, v.id));
  const loc = rows.find((r) => r.locale === CONTENT_LOCALE);
  const en = rows.find((r) => r.locale === CONTENT_EXTRA_LOCALE);
  return {
    ...v,
    type: content.type,
    title: loc?.title ?? content.title,
    body: (loc?.body ?? {}) as ContentBody,
    en: en ? { title: en.title, body: en.body as ContentBody } : null,
  };
}

/** Düzenlenebilir (son, taslak/reddedilmiş) sürüm; yoksa hata. */
export async function getEditableVersion(
  actor: Actor,
  contentId: string,
): Promise<VersionView & { tagIds: string[]; isOhs: boolean; ownerOrgUnitId: string | null; submitOutcome: VersionStatus }> {
  const { content, access } = await loadContent(actor, contentId);
  if (content.archivedAt || !canDraftContent(access, content)) throw new ForbiddenError("content.draft");
  const latest = (await latestVersions([contentId])).get(contentId)!;
  if (!isEditable(latest.status)) throw new ValidationError("version_not_editable");
  const view = await getVersion(actor, latest.id);
  const tagRows = await db().select({ id: contentTags.tagId }).from(contentTags).where(eq(contentTags.contentId, contentId));
  // Gönderince ne olacağı (arayüzde açıklama için)
  const outcome = onSubmit({
    isOhs: content.isOhs,
    submitterCanApproveSection: canApproveSection(access, content),
    submitterIsOhsSpecialist: hasRole(actor, "ohs_specialist"),
  });
  return {
    ...view,
    tagIds: tagRows.map((t) => t.id),
    isOhs: content.isOhs,
    ownerOrgUnitId: content.ownerOrgUnitId,
    submitOutcome: outcome.status,
  };
}

// ---------------------------------------------------------------------------
// Oluşturma ve taslak
// ---------------------------------------------------------------------------

export type CreateContentInput = {
  type: ContentType;
  title: string;
  ownerOrgUnitId: string | null;
  commonTarget: "all" | "blue" | "white" | null;
  isOhs: boolean;
};

export async function createContent(actor: Actor, input: CreateContentInput): Promise<{ id: string }> {
  assertUser(actor);
  assertLibrary(actor);
  const title = input.title.trim().replace(/\s+/g, " ");
  if (title.length < 3 || title.length > 200) throw new ValidationError("invalid_title");
  const ref: ContentRef = { ownerOrgUnitId: input.ownerOrgUnitId, isOhs: input.isOhs };
  const commonTarget = input.ownerOrgUnitId === null ? (input.commonTarget ?? "all") : null;

  return withActor(actor, async (tx) => {
    const access = await contentAccessFor(actor, tx);
    if (!canDraftContent(access, ref)) throw new ForbiddenError("content.draft");
    if (input.ownerOrgUnitId) {
      const [unit] = await tx.select({ isActive: orgUnits.isActive }).from(orgUnits).where(eq(orgUnits.id, input.ownerOrgUnitId)).limit(1);
      if (!unit?.isActive) throw new ValidationError("org_unit_invalid");
    }
    const [content] = await tx
      .insert(contents)
      .values({ type: input.type, title, ownerOrgUnitId: input.ownerOrgUnitId, commonTarget, isOhs: input.isOhs, createdBy: actor.userId })
      .returning({ id: contents.id });
    const [version] = await tx
      .insert(contentVersions)
      .values({ contentId: content!.id, version: 1, createdBy: actor.userId })
      .returning({ id: contentVersions.id });
    await tx.insert(contentVersionLocales).values({ contentVersionId: version!.id, locale: CONTENT_LOCALE, title, body: {} });
    await refreshSearchVector(tx, content!.id, title, "");
    return { id: content!.id };
  });
}

export type SaveDraftInput = {
  title: string;
  body: unknown;
  tagIds: string[];
  /** İngilizce: nesne = kaydet, null = kaldır, verilmezse dokunulmaz (karar #207). */
  en?: { title: string; body: unknown } | null;
};

function cleanTitle(raw: string): string {
  const title = raw.trim().replace(/\s+/g, " ");
  if (title.length < 3 || title.length > 200) throw new ValidationError("invalid_title");
  return title;
}

/** Taslağı kaydeder (eksik gövdeye izin verilir). Reddedilmiş sürüm kaydedilince yeniden taslak olur. */
export async function saveDraft(actor: Actor, contentId: string, input: SaveDraftInput): Promise<void> {
  assertUser(actor);
  const title = cleanTitle(input.title);
  const enTitle = input.en ? cleanTitle(input.en.title) : null;

  await withActor(actor, async (tx) => {
    const { content, access } = await loadContent(actor, contentId, tx);
    if (content.archivedAt || !canDraftContent(access, content)) throw new ForbiddenError("content.draft");
    const [latest] = await tx
      .select()
      .from(contentVersions)
      .where(eq(contentVersions.contentId, contentId))
      .orderBy(desc(contentVersions.version))
      .limit(1)
      .for("update");
    if (!latest || !isEditable(latest.status)) throw new ValidationError("version_not_editable");

    const parsed = parseBody(content.type, input.body, "draft");
    if (!parsed.success) throw new ValidationError("body_invalid", parsed.error.issues.slice(0, 5));
    const body = parsed.data as ContentBody;
    let enBody: ContentBody | null = null;
    if (input.en) {
      const parsedEn = parseBody(content.type, input.en.body, "draft");
      if (!parsedEn.success) throw new ValidationError("body_invalid", parsedEn.error.issues.slice(0, 5));
      enBody = parsedEn.data as ContentBody;
    }
    // Sürümün medyası iki dilin birleşimidir; İngilizce satır değişmiyorsa mevcut gövdesi sayılır
    let keptEn: ContentBody | null = null;
    if (input.en === undefined) {
      const [row] = await tx
        .select({ body: contentVersionLocales.body })
        .from(contentVersionLocales)
        .where(and(eq(contentVersionLocales.contentVersionId, latest.id), eq(contentVersionLocales.locale, CONTENT_EXTRA_LOCALE)))
        .limit(1);
      keptEn = (row?.body as ContentBody | undefined) ?? null;
    }
    const assetIds = [
      ...new Set([...bodyAssetIds(content.type, body), ...bodyAssetIds(content.type, enBody ?? keptEn ?? {})]),
    ];
    await assertAssetsUsable(tx, actor.userId, contentId, content.type, assetIds);

    const tagIds = [...new Set(input.tagIds)].slice(0, 30);
    if (tagIds.length) {
      const found = await tx.select({ id: tags.id }).from(tags).where(inArray(tags.id, tagIds));
      if (found.length !== tagIds.length) throw new ValidationError("tag_invalid");
    }

    await tx
      .update(contentVersionLocales)
      .set({ title, body })
      .where(and(eq(contentVersionLocales.contentVersionId, latest.id), eq(contentVersionLocales.locale, CONTENT_LOCALE)));
    if (input.en === null) {
      await tx
        .delete(contentVersionLocales)
        .where(and(eq(contentVersionLocales.contentVersionId, latest.id), eq(contentVersionLocales.locale, CONTENT_EXTRA_LOCALE)));
    } else if (input.en && enTitle && enBody) {
      await tx
        .insert(contentVersionLocales)
        .values({ contentVersionId: latest.id, locale: CONTENT_EXTRA_LOCALE, title: enTitle, body: enBody })
        .onConflictDoUpdate({
          target: [contentVersionLocales.contentVersionId, contentVersionLocales.locale],
          set: { title: enTitle, body: enBody },
        });
    }
    await tx.delete(contentVersionAssets).where(eq(contentVersionAssets.contentVersionId, latest.id));
    if (assetIds.length) await tx.insert(contentVersionAssets).values(assetIds.map((assetId) => ({ contentVersionId: latest.id, assetId })));
    if (latest.status === "rejected") await tx.update(contentVersions).set({ status: "draft" }).where(eq(contentVersions.id, latest.id));
    else await tx.update(contentVersions).set({ updatedAt: new Date() }).where(eq(contentVersions.id, latest.id));

    await tx.delete(contentTags).where(eq(contentTags.contentId, contentId));
    if (tagIds.length) await tx.insert(contentTags).values(tagIds.map((tagId) => ({ contentId, tagId })));
    await refreshSearchVector(tx, contentId, title, bodyText(content.type, body));
  });
}

/** Medya bu içerikte kullanılabilir mi: türü uygun ve kişinin kendi yüklemesi ya da içeriğin önceki sürümlerinden. */
async function assertAssetsUsable(tx: Tx, userId: string, contentId: string, type: ContentType, assetIds: string[]) {
  if (assetIds.length === 0) return;
  const rows = await tx
    .select({ id: mediaAssets.id, kind: mediaAssets.kind, createdBy: mediaAssets.createdBy })
    .from(mediaAssets)
    .where(inArray(mediaAssets.id, assetIds));
  if (rows.length !== assetIds.length) throw new ValidationError("asset_invalid");
  const allowedKinds = ASSET_KIND_FOR_TYPE[type];
  if (rows.some((r) => !allowedKinds.includes(r.kind))) throw new ValidationError("asset_kind_invalid");
  const foreign = rows.filter((r) => r.createdBy !== userId).map((r) => r.id);
  if (foreign.length === 0) return;
  const linked = await tx
    .selectDistinct({ id: contentVersionAssets.assetId })
    .from(contentVersionAssets)
    .innerJoin(contentVersions, eq(contentVersions.id, contentVersionAssets.contentVersionId))
    .where(and(eq(contentVersions.contentId, contentId), inArray(contentVersionAssets.assetId, foreign)));
  if (linked.length !== foreign.length) throw new ValidationError("asset_invalid");
}

// ---------------------------------------------------------------------------
// Onay akışı (FG-2.3)
// ---------------------------------------------------------------------------

async function publishVersion(tx: Tx, contentId: string, versionId: string) {
  const [v] = await tx
    .update(contentVersions)
    .set({ status: "published", publishedAt: new Date() })
    .where(eq(contentVersions.id, versionId))
    .returning({ requireReread: contentVersions.requireReread });
  await tx.update(contents).set({ currentPublishedVersionId: versionId }).where(eq(contents.id, contentId));
  // "Tekrar oku ve onayla": önceki sürümü onaylamış herkese okuma görevi (FG-2.2)
  if (v?.requireReread) await createRereadTasks(tx, contentId, versionId);
}

export type SubmitInput = { changeNote: string | null; requireReread: boolean };

export async function submitForApproval(actor: Actor, contentId: string, input: SubmitInput): Promise<{ status: VersionStatus }> {
  assertUser(actor);
  return withActor(actor, async (tx) => {
    const { content, access } = await loadContent(actor, contentId, tx);
    if (content.archivedAt || !canDraftContent(access, content)) throw new ForbiddenError("content.draft");
    const [latest] = await tx
      .select()
      .from(contentVersions)
      .where(eq(contentVersions.contentId, contentId))
      .orderBy(desc(contentVersions.version))
      .limit(1)
      .for("update");
    if (!latest || !isEditable(latest.status)) throw new ValidationError("version_not_editable");

    const changeNote = input.changeNote?.trim() || null;
    if (latest.version > 1 && (!changeNote || changeNote.length < 3)) throw new ValidationError("change_note_required");
    if (changeNote && changeNote.length > 2000) throw new ValidationError("change_note_too_long");

    const locs = await tx
      .select({ locale: contentVersionLocales.locale, body: contentVersionLocales.body })
      .from(contentVersionLocales)
      .where(eq(contentVersionLocales.contentVersionId, latest.id));
    const parsed = parseBody(content.type, locs.find((l) => l.locale === CONTENT_LOCALE)?.body, "strict");
    if (!parsed.success) throw new ValidationError("body_incomplete", parsed.error.issues.slice(0, 5));
    // İngilizce varsa o da eksiksiz olmalı; iki dil aynı sürümle onaylanır (karar #207)
    const enLoc = locs.find((l) => l.locale === CONTENT_EXTRA_LOCALE);
    if (enLoc && !parseBody(content.type, enLoc.body, "strict").success) throw new ValidationError("body_incomplete_en");

    const assetRows = await tx
      .select({ status: mediaAssets.status })
      .from(contentVersionAssets)
      .innerJoin(mediaAssets, eq(mediaAssets.id, contentVersionAssets.assetId))
      .where(eq(contentVersionAssets.contentVersionId, latest.id));
    if (assetRows.some((a) => a.status !== "ready")) throw new ValidationError("assets_not_ready");

    const result = onSubmit({
      isOhs: content.isOhs,
      submitterCanApproveSection: canApproveSection(access, content),
      // Üst yönetici İSG kısayolundan yararlanmaz (karar #196): İSG adımı ayrıca onaylanır
      submitterIsOhsSpecialist: hasOwnRole(actor, "ohs_specialist"),
    });

    const now = new Date();
    await tx
      .update(contentVersions)
      .set({
        status: result.status === "published" ? latest.status : result.status,
        changeNote,
        requireReread: latest.version > 1 && input.requireReread,
        submittedBy: actor.userId,
        submittedAt: now,
      })
      .where(eq(contentVersions.id, latest.id));
    for (const step of result.autoSteps) {
      await tx.insert(approvals).values({
        subjectType: "content_version",
        subjectId: latest.id,
        step,
        decision: "auto_self",
        decidedBy: actor.userId,
        decidedAt: now,
      });
    }
    if (result.status === "published") await publishVersion(tx, contentId, latest.id);
    else {
      await notifyApprovalPending(tx, {
        type: "content",
        step: result.status === "ohs_review" ? "ohs" : "section",
        ownerOrgUnitId: content.ownerOrgUnitId,
        subjectKey: `content:${latest.id}`,
        title: content.title,
        submittedBy: actor.userId,
      });
    }
    return { status: result.status };
  });
}

async function loadPendingVersion(tx: Tx, actor: Actor, versionId: string) {
  const [version] = await tx.select().from(contentVersions).where(eq(contentVersions.id, versionId)).limit(1).for("update");
  if (!version) throw new NotFoundError("content_version");
  const { content, access } = await loadContent(actor, version.contentId, tx);
  if (content.archivedAt) throw new ValidationError("content_archived");
  const step = pendingStep(version.status);
  if (!step) throw new ValidationError("version_not_pending");
  const allowed = step === "section" ? canApproveSection(access, content) : canApproveOhs(access);
  if (!allowed) throw new ForbiddenError(step === "section" ? "content.approve_section" : "content.approve_ohs");
  if (version.submittedBy) assertNotSelf(actor, version.submittedBy);
  if (step === "ohs") await assertDifferentApprover(tx, actor, { type: "content_version", id: version.id, since: version.submittedAt });
  return { version, content, step };
}

export async function approveVersion(actor: Actor, versionId: string, comment?: string | null): Promise<{ status: VersionStatus }> {
  assertUser(actor);
  return withActor(actor, async (tx) => {
    const { version, content, step } = await loadPendingVersion(tx, actor, versionId);
    if (step === "ohs") await recordOwnerAction(tx, actor, "content.approve_ohs", { type: "content_version", id: version.id });
    await tx.insert(approvals).values({
      subjectType: "content_version",
      subjectId: version.id,
      step,
      decision: "approved",
      comment: comment?.trim() || null,
      decidedBy: actor.userId,
    });
    const next = onApprove(version.status, content.isOhs);
    await resolveNotifications(tx, `content:${version.id}`);
    if (next === "published") await publishVersion(tx, content.id, version.id);
    else {
      await tx.update(contentVersions).set({ status: next }).where(eq(contentVersions.id, version.id));
      await notifyApprovalPending(tx, { type: "content", step: "ohs", ownerOrgUnitId: content.ownerOrgUnitId, subjectKey: `content:${version.id}`, title: content.title, submittedBy: version.submittedBy });
    }
    return { status: next };
  });
}

export async function rejectVersion(actor: Actor, versionId: string, comment: string): Promise<void> {
  assertUser(actor);
  const reason = comment.trim();
  if (reason.length < 3) throw new ValidationError("reject_comment_required");
  if (reason.length > 2000) throw new ValidationError("comment_too_long");
  await withActor(actor, async (tx) => {
    const { version, step } = await loadPendingVersion(tx, actor, versionId);
    if (step === "ohs") await recordOwnerAction(tx, actor, "content.approve_ohs", { type: "content_version", id: version.id });
    await resolveNotifications(tx, `content:${version.id}`);
    await tx.insert(approvals).values({
      subjectType: "content_version",
      subjectId: version.id,
      step,
      decision: "rejected",
      comment: reason,
      decidedBy: actor.userId,
    });
    await tx.update(contentVersions).set({ status: onReject(version.status) }).where(eq(contentVersions.id, version.id));
  });
}

// ---------------------------------------------------------------------------
// Yeni sürüm, taslağı silme, arşiv
// ---------------------------------------------------------------------------

/** Yayınlanmış son sürümden yeni taslak sürüm açar (gövde ve medya kopyalanır). */
export async function startNewVersion(actor: Actor, contentId: string): Promise<{ versionId: string }> {
  assertUser(actor);
  return withActor(actor, async (tx) => {
    const { content, access } = await loadContent(actor, contentId, tx);
    if (content.archivedAt || !canDraftContent(access, content)) throw new ForbiddenError("content.draft");
    const [latest] = await tx
      .select()
      .from(contentVersions)
      .where(eq(contentVersions.contentId, contentId))
      .orderBy(desc(contentVersions.version))
      .limit(1)
      .for("update");
    if (!latest || latest.status !== "published") throw new ValidationError("draft_exists");

    const [created] = await tx
      .insert(contentVersions)
      .values({ contentId, version: latest.version + 1, createdBy: actor.userId })
      .returning({ id: contentVersions.id });
    const locales = await tx.select().from(contentVersionLocales).where(eq(contentVersionLocales.contentVersionId, latest.id));
    if (locales.length) {
      await tx.insert(contentVersionLocales).values(locales.map((l) => ({ ...l, contentVersionId: created!.id })));
    }
    const assets = await tx.select().from(contentVersionAssets).where(eq(contentVersionAssets.contentVersionId, latest.id));
    if (assets.length) {
      await tx.insert(contentVersionAssets).values(assets.map((a) => ({ contentVersionId: created!.id, assetId: a.assetId })));
    }
    return { versionId: created!.id };
  });
}

/** Henüz değerlendirilmemiş taslak sürümü siler (ilk sürüm silinemez; içerik arşivlenir). */
export async function discardDraft(actor: Actor, contentId: string): Promise<void> {
  assertUser(actor);
  await withActor(actor, async (tx) => {
    const { content, access } = await loadContent(actor, contentId, tx);
    if (content.archivedAt || !canDraftContent(access, content)) throw new ForbiddenError("content.draft");
    const [latest] = await tx
      .select()
      .from(contentVersions)
      .where(eq(contentVersions.contentId, contentId))
      .orderBy(desc(contentVersions.version))
      .limit(1)
      .for("update");
    if (!latest || !isEditable(latest.status) || latest.version === 1) throw new ValidationError("cannot_discard");
    const [history] = await tx
      .select({ n: count() })
      .from(approvals)
      .where(and(eq(approvals.subjectType, "content_version"), eq(approvals.subjectId, latest.id)));
    if (Number(history?.n ?? 0) > 0) throw new ValidationError("cannot_discard");
    await tx.delete(contentVersions).where(eq(contentVersions.id, latest.id));

    // Başlık ve arama, yayınlanmış sürüme geri döner
    const [published] = await tx
      .select({ title: contentVersionLocales.title, body: contentVersionLocales.body })
      .from(contentVersionLocales)
      .where(and(eq(contentVersionLocales.contentVersionId, content.currentPublishedVersionId!), eq(contentVersionLocales.locale, CONTENT_LOCALE)))
      .limit(1);
    if (published) await refreshSearchVector(tx, contentId, published.title, bodyText(content.type, published.body as ContentBody));
  });
}

/** Arşivleme (silme yok, geri alma yok — karar #40). */
export async function archiveContent(actor: Actor, contentId: string): Promise<void> {
  assertUser(actor);
  await withActor(actor, async (tx) => {
    const { content, access } = await loadContent(actor, contentId, tx);
    if (content.archivedAt) throw new ValidationError("content_archived");
    if (!canArchiveContent(access, content)) throw new ForbiddenError("content.archive");
    await tx.update(contents).set({ archivedAt: new Date(), archivedBy: actor.userId }).where(eq(contents.id, contentId));
  });
}

// ---------------------------------------------------------------------------
// Onay kuyruğu
// ---------------------------------------------------------------------------

export type ApprovalQueueItem = {
  versionId: string;
  contentId: string;
  title: string;
  type: ContentType;
  version: number;
  step: "section" | "ohs";
  isOhs: boolean;
  ownerName: string | null;
  submittedByName: string | null;
  submittedAt: Date | null;
  changeNote: string | null;
};

export async function approvalQueue(actor: Actor): Promise<ApprovalQueueItem[]> {
  assertUser(actor);
  if (!can(actor, "content.approve_section") && !can(actor, "content.approve_ohs")) return [];
  const access = await contentAccessFor(actor);
  const submitter = alias(users, "submitter");
  const rows = await db()
    .select({
      versionId: contentVersions.id,
      contentId: contents.id,
      title: contents.title,
      type: contents.type,
      version: contentVersions.version,
      status: contentVersions.status,
      isOhs: contents.isOhs,
      ownerOrgUnitId: contents.ownerOrgUnitId,
      ownerName: orgUnits.name,
      submittedBy: contentVersions.submittedBy,
      submittedByName: submitter.name,
      submittedAt: contentVersions.submittedAt,
      changeNote: contentVersions.changeNote,
    })
    .from(contentVersions)
    .innerJoin(contents, eq(contents.id, contentVersions.contentId))
    .leftJoin(orgUnits, eq(orgUnits.id, contents.ownerOrgUnitId))
    .leftJoin(submitter, eq(submitter.id, contentVersions.submittedBy))
    .where(and(inArray(contentVersions.status, ["section_review", "ohs_review"]), isNull(contents.archivedAt)))
    .orderBy(asc(contentVersions.submittedAt));

  return rows
    .filter((r) => {
      if (r.submittedBy === actor.userId) return false;
      const step = pendingStep(r.status);
      return step === "section" ? canApproveSection(access, r) : canApproveOhs(access);
    })
    .map((r) => ({
      versionId: r.versionId,
      contentId: r.contentId,
      title: r.title,
      type: r.type,
      version: r.version,
      step: pendingStep(r.status)!,
      isOhs: r.isOhs,
      ownerName: r.ownerName,
      submittedByName: r.submittedByName,
      submittedAt: r.submittedAt,
      changeNote: r.changeNote,
    }));
}

// ---------------------------------------------------------------------------
// Etiketler (FG-2.4)
// ---------------------------------------------------------------------------

export type TagTypeKey = "machine" | "section" | "risk" | "shift";
export type TagGroup = { typeId: string; key: TagTypeKey; tags: { id: string; name: string }[] };

export async function listTags(actor: Actor): Promise<TagGroup[]> {
  assertLibrary(actor);
  const types = await db().select().from(tagTypes).orderBy(asc(tagTypes.sortOrder));
  const rows = await db().select({ id: tags.id, name: tags.name, tagTypeId: tags.tagTypeId }).from(tags).orderBy(asc(tags.name));
  return types.map((t) => ({
    typeId: t.id,
    key: t.key as TagTypeKey,
    tags: rows.filter((r) => r.tagTypeId === t.id).map((r) => ({ id: r.id, name: r.name })),
  }));
}

/** Etiket ekler; aynı adda varsa onu döner. */
export async function createTag(actor: Actor, input: { tagTypeId: string; name: string }): Promise<{ id: string; name: string }> {
  assertUser(actor);
  if (!can(actor, "content.draft")) throw new ForbiddenError("content.draft");
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 60) throw new ValidationError("tag_name_invalid");
  return withActor(actor, async (tx) => {
    const [type] = await tx.select({ id: tagTypes.id }).from(tagTypes).where(eq(tagTypes.id, input.tagTypeId)).limit(1);
    if (!type) throw new ValidationError("tag_type_invalid");
    const [existing] = await tx
      .select({ id: tags.id, name: tags.name })
      .from(tags)
      .where(and(eq(tags.tagTypeId, type.id), sql`lower(${tags.name}) = lower(${name})`))
      .limit(1);
    if (existing) return existing;
    const [created] = await tx
      .insert(tags)
      .values({ tagTypeId: type.id, name, createdBy: actor.userId })
      .returning({ id: tags.id, name: tags.name });
    return created!;
  });
}

/** İçerik oluştururken seçilebilecek birimler (taslak yetkisine göre). */
export async function draftableOwners(actor: Actor): Promise<{ common: boolean; units: { id: string; name: string; parentName: string | null }[] }> {
  assertUser(actor);
  assertLibrary(actor);
  const access = await contentAccessFor(actor);
  const parent = alias(orgUnits, "parent");
  const all = await db()
    .select({ id: orgUnits.id, name: orgUnits.name, parentName: parent.name })
    .from(orgUnits)
    .leftJoin(parent, eq(parent.id, orgUnits.parentId))
    .where(eq(orgUnits.isActive, true))
    .orderBy(asc(sql`coalesce(${parent.name}, ${orgUnits.name})`), sql`${orgUnits.parentId} asc nulls first`, asc(orgUnits.name));
  // İSG uzmanı yalnızca İSG içeriği hazırlayabilir; o durumda her birim seçilebilir
  const ohs = hasRole(actor, "ohs_specialist");
  return {
    common: ohs || canDraftContent(access, { ownerOrgUnitId: null, isOhs: false }),
    units: all.filter((u) => ohs || canDraftContent(access, { ownerOrgUnitId: u.id, isOhs: false })),
  };
}
