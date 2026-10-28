import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import type { Actor } from "@/server/authz/actor";
import { assertCan, assertUser, hasRole } from "@/server/authz/policy";
import { isPersonInScope } from "@/server/authz/scope";
import { db, type DbOrTx, type Tx } from "@/server/db/client";
import {
  assignmentModules,
  assignments,
  certificates,
  examAttempts,
  orgUnits,
  positions,
  practicalExamResults,
  users,
  type CertificateSnapshot,
} from "@/server/db/schema";
import { withActor } from "@/server/db/with-actor";
import { ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { enqueue } from "@/server/jobs/send";
import { QUEUES } from "@/server/jobs/queues";
import { certificateState, createRateLimiter, documentNo, earliestExpiry, maskName, type CertificateState } from "@/server/state/certification";
import { canViewPerson } from "../assignments";
import { getSettings } from "../settings";

/**
 * Sertifika ve katılım belgesi (FG-7.2, karar #77–80).
 *  - Pozisyon yetkinlik sertifikası: işe başlama onayında otomatik.
 *  - Katılım belgesi: İSG modülü tamamlanınca otomatik; diğer modüllerde İK veya kapsamdaki bölüm sorumlusu düzenler.
 *  - İçerik düzenlendiği anda dondurulur (snapshot); PDF worker'da üretilir.
 *  - İptal: İK, gerekçe zorunlu; iptal kaydı değiştirilemez.
 */

export type { CertificateSnapshot };

type CertificateRow = typeof certificates.$inferSelect;

const newToken = () => randomBytes(16).toString("base64url");

async function personInfo(conn: DbOrTx, userId: string, positionId: string | null) {
  const [u] = await conn.select({ name: users.name, sicilNo: users.username }).from(users).where(eq(users.id, userId)).limit(1);
  const [p] = positionId
    ? await conn
        .select({ positionName: positions.name, unitName: orgUnits.name })
        .from(positions)
        .innerJoin(orgUnits, eq(orgUnits.id, positions.orgUnitId))
        .where(eq(positions.id, positionId))
        .limit(1)
    : [];
  return { fullName: u?.name ?? "—", sicilNo: u?.sicilNo ?? null, positionName: p?.positionName ?? null, unitName: p?.unitName ?? null };
}

async function nameOf(conn: DbOrTx, userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const [u] = await conn.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
  return u?.name ?? null;
}

async function signatories(): Promise<CertificateSnapshot["signatories"]> {
  return (await getSettings(["certificate.signatories"]))["certificate.signatories"];
}

type ModuleRow = typeof assignmentModules.$inferSelect;

function moduleEntry(m: ModuleRow, trainerName: string | null): CertificateSnapshot["modules"][number] {
  const practical = m.kind === "practice" || m.kind === "practice_exam";
  return {
    title: m.title,
    kind: m.kind,
    durationMin: m.durationMin,
    completedAt: m.completedAt?.toISOString() ?? null,
    via: m.completedVia,
    trainerName: practical ? trainerName : null,
    isOhs: m.isOhs,
  };
}

async function bestScores(conn: DbOrTx, moduleIds: string[]) {
  if (moduleIds.length === 0) return { theory: null, practical: null };
  const [theory] = await conn
    .select({ score: examAttempts.score })
    .from(examAttempts)
    .where(and(inArray(examAttempts.assignmentModuleId, moduleIds), eq(examAttempts.passed, true)))
    .orderBy(desc(examAttempts.submittedAt))
    .limit(1);
  const [practical] = await conn
    .select({ score: practicalExamResults.score })
    .from(practicalExamResults)
    .where(and(inArray(practicalExamResults.assignmentModuleId, moduleIds), eq(practicalExamResults.status, "final"), eq(practicalExamResults.passed, true)))
    .orderBy(desc(practicalExamResults.finalizedAt))
    .limit(1);
  return { theory: theory?.score ?? null, practical: practical?.score ?? null };
}

function queueRender(id: string) {
  // Kayıt aynı transaction'da düzenlenir; iş erken alınırsa yeniden denenir (QUEUE_OPTIONS)
  return enqueue(QUEUES.certificateRender, { certificateId: id }, { startAfter: new Date(Date.now() + 2000) });
}

/**
 * Tekrar eğitiminde yeni sertifika (karar #169): yenilenen modüllerle birlikte aynı pozisyonun önceki atamalarında
 * tamamlanmış ve hâlâ geçerli modüller (her modülün son tamamlanışı). Bitiş bunların en erkenidir.
 */
async function stillValidElsewhere(tx: Tx, a: typeof assignments.$inferSelect, exclude: string[]) {
  const rows = await tx
    .select({ am: assignmentModules })
    .from(assignmentModules)
    .innerJoin(assignments, eq(assignments.id, assignmentModules.assignmentId))
    .where(and(eq(assignments.userId, a.userId), eq(assignments.positionId, a.positionId), ne(assignments.id, a.id), eq(assignmentModules.status, "completed")))
    .orderBy(desc(assignmentModules.completedAt));
  const now = new Date();
  const seen = new Set(exclude);
  const out: (typeof assignmentModules.$inferSelect)[] = [];
  for (const { am } of rows) {
    if (seen.has(am.moduleId)) continue;
    seen.add(am.moduleId);
    if (!am.expiresAt || am.expiresAt > now) out.push(am);
  }
  return out.sort((x, y) => x.sortOrder - y.sortOrder);
}

/** Pozisyon yetkinlik sertifikası (işe başlama onayı transaction'ı içinde). */
export async function issuePositionCertificate(tx: Tx, input: { assignmentId: string; approvedBy: string }): Promise<string> {
  const [a] = await tx.select().from(assignments).where(eq(assignments.id, input.assignmentId)).limit(1);
  if (!a) throw new NotFoundError("assignment");
  const mods = await tx.select().from(assignmentModules).where(eq(assignmentModules.assignmentId, a.id)).orderBy(asc(assignmentModules.sortOrder));
  const done = mods.filter((m) => m.status === "completed");
  if (a.reason === "recertification") done.push(...(await stillValidElsewhere(tx, a, done.map((m) => m.moduleId))));
  const person = await personInfo(tx, a.userId, a.positionId);
  const trainerName = await nameOf(tx, a.trainerUserId);
  const scores = await bestScores(tx, mods.map((m) => m.id));
  const snapshot: CertificateSnapshot = {
    ...person,
    scope: person.positionName ?? "—",
    modules: done.map((m) => moduleEntry(m, trainerName)),
    theoryScore: scores.theory,
    practicalScore: scores.practical,
    approverName: await nameOf(tx, input.approvedBy),
    signatories: await signatories(),
  };
  const [row] = await tx
    .insert(certificates)
    .values({
      userId: a.userId,
      kind: "position_competency",
      assignmentId: a.id,
      positionId: a.positionId,
      title: snapshot.scope,
      snapshot,
      expiresAt: earliestExpiry(done.map((m) => m.expiresAt)),
      verifyToken: newToken(),
      approvedBy: input.approvedBy,
      issuedBy: input.approvedBy,
    })
    .returning({ id: certificates.id });
  await queueRender(row!.id);
  return row!.id;
}

/** Katılım belgesi: tamamlanmış modül için; aynı modüle geçerli belge varsa yenisi düzenlenmez. */
export async function issueAttendance(tx: Tx, input: { assignmentModuleId: string; issuedBy: string | null }): Promise<string | null> {
  const [row] = await tx
    .select({ am: assignmentModules, a: assignments })
    .from(assignmentModules)
    .innerJoin(assignments, eq(assignments.id, assignmentModules.assignmentId))
    .where(eq(assignmentModules.id, input.assignmentModuleId))
    .limit(1);
  if (!row || row.am.status !== "completed") return null;
  const [existing] = await tx
    .select({ id: certificates.id })
    .from(certificates)
    .where(and(eq(certificates.assignmentModuleId, row.am.id), eq(certificates.kind, "attendance"), eq(certificates.status, "valid")))
    .limit(1);
  if (existing) return existing.id;
  const person = await personInfo(tx, row.a.userId, row.a.positionId);
  const snapshot: CertificateSnapshot = {
    ...person,
    scope: row.am.title,
    modules: [moduleEntry(row.am, await nameOf(tx, row.a.trainerUserId))],
    theoryScore: null,
    practicalScore: null,
    approverName: await nameOf(tx, input.issuedBy),
    signatories: await signatories(),
  };
  const [cert] = await tx
    .insert(certificates)
    .values({
      userId: row.a.userId,
      kind: "attendance",
      assignmentId: row.a.id,
      assignmentModuleId: row.am.id,
      positionId: row.a.positionId,
      title: row.am.title,
      snapshot,
      expiresAt: row.am.expiresAt,
      verifyToken: newToken(),
      issuedBy: input.issuedBy,
    })
    .returning({ id: certificates.id });
  await queueRender(cert!.id);
  return cert!.id;
}

async function canIssueFor(actor: Actor & { kind: "user" }, userId: string, conn: DbOrTx = db()): Promise<boolean> {
  if (actor.userId === userId) return false;
  if (hasRole(actor, "hr")) return true;
  return hasRole(actor, "section_manager") && (await isPersonInScope(actor, userId, conn));
}

/** İsteğe bağlı katılım belgesi (İSG dışı modüller; karar #77). */
export async function issueAttendanceFor(actor: Actor, assignmentModuleId: string): Promise<{ id: string }> {
  assertUser(actor);
  assertCan(actor, "certificates.issue");
  return withActor(actor, async (tx) => {
    const [row] = await tx
      .select({ userId: assignments.userId, status: assignmentModules.status })
      .from(assignmentModules)
      .innerJoin(assignments, eq(assignments.id, assignmentModules.assignmentId))
      .where(eq(assignmentModules.id, assignmentModuleId))
      .limit(1);
    if (!row) throw new NotFoundError("module");
    if (!(await canIssueFor(actor, row.userId, tx))) throw new ForbiddenError("certificates.issue");
    if (row.status !== "completed") throw new ValidationError("module_not_completed");
    const id = await issueAttendance(tx, { assignmentModuleId, issuedBy: actor.userId });
    return { id: id! };
  });
}

export async function revokeCertificate(actor: Actor, id: string, reason: string): Promise<void> {
  assertUser(actor);
  assertCan(actor, "certificates.revoke");
  const text = reason.trim();
  if (text.length < 3) throw new ValidationError("reject_comment_required");
  if (text.length > 1000) throw new ValidationError("comment_too_long");
  await withActor(actor, async (tx) => {
    const [c] = await tx.select().from(certificates).where(eq(certificates.id, id)).limit(1).for("update");
    if (!c) throw new NotFoundError("certificate");
    if (c.userId === actor.userId) throw new ForbiddenError("self_action");
    if (c.status === "revoked") throw new ValidationError("certificate_revoked");
    await tx.update(certificates).set({ status: "revoked", revokedReason: text, revokedBy: actor.userId, revokedAt: new Date() }).where(eq(certificates.id, c.id));
  });
}

// ---------------------------------------------------------------------------
// Görünümler
// ---------------------------------------------------------------------------

export type CertificateSummary = {
  id: string;
  kind: "position_competency" | "attendance";
  title: string;
  documentNo: string;
  issuedAt: Date;
  expiresAt: Date | null;
  state: CertificateState;
  ready: boolean;
  revokedReason: string | null;
};

function summary(c: CertificateRow): CertificateSummary {
  return {
    id: c.id,
    kind: c.kind,
    title: c.title,
    documentNo: documentNo(c.serialNo, c.issuedAt.getFullYear()),
    issuedAt: c.issuedAt,
    expiresAt: c.expiresAt,
    state: certificateState(c.status, c.expiresAt),
    ready: !!c.pdfAssetId,
    revokedReason: c.revokedReason,
  };
}

export async function myCertificates(actor: Actor): Promise<CertificateSummary[]> {
  assertUser(actor);
  const rows = await db().select().from(certificates).where(eq(certificates.userId, actor.userId)).orderBy(desc(certificates.issuedAt));
  return rows.map(summary);
}

/** Kişinin belgeleri (kursiyer kendisi, eğitmeni, kapsamdaki bölüm sorumlusu, İK). */
export async function certificatesForUser(actor: Actor, userId: string): Promise<CertificateSummary[]> {
  assertUser(actor);
  if (!(await canViewPerson(actor, userId))) throw new NotFoundError("person");
  const rows = await db().select().from(certificates).where(eq(certificates.userId, userId)).orderBy(desc(certificates.issuedAt));
  return rows.map(summary);
}

/** İndirme: PDF varlığı ve dosya adı (yetki kontrollü). */
export async function certificateFile(actor: Actor, id: string): Promise<{ assetId: string; fileName: string } | null> {
  assertUser(actor);
  const [c] = await db().select().from(certificates).where(eq(certificates.id, id)).limit(1);
  if (!c || !c.pdfAssetId) return null;
  if (!(await canViewPerson(actor, c.userId))) return null;
  return { assetId: c.pdfAssetId, fileName: `${documentNo(c.serialNo, c.issuedAt.getFullYear())}.pdf` };
}

export type VerifyView = {
  maskedName: string;
  kind: "position_competency" | "attendance";
  scope: string;
  documentNo: string;
  issuedAt: Date;
  expiresAt: Date | null;
  state: CertificateState;
};

/** Herkese açık doğrulama (FG-7.2): maskeli ad, kapsam, tarihler, durum. TC ve sicil no dönmez. */
export async function verifyCertificate(token: string): Promise<VerifyView | null> {
  if (!/^[A-Za-z0-9_-]{22}$/.test(token)) return null;
  const [c] = await db().select().from(certificates).where(eq(certificates.verifyToken, token)).limit(1);
  if (!c) return null;
  return {
    maskedName: maskName(c.snapshot.fullName),
    kind: c.kind,
    scope: c.snapshot.scope,
    documentNo: documentNo(c.serialNo, c.issuedAt.getFullYear()),
    issuedAt: c.issuedAt,
    expiresAt: c.expiresAt,
    state: certificateState(c.status, c.expiresAt),
  };
}

/** PDF üretimi için tam kayıt (worker). */
export async function certificateForRender(id: string): Promise<CertificateRow | null> {
  const [c] = await db().select().from(certificates).where(eq(certificates.id, id)).limit(1);
  return c ?? null;
}

export async function canIssueAttendance(actor: Actor, userId: string): Promise<boolean> {
  return actor.kind === "user" && (hasRole(actor, "hr") || hasRole(actor, "section_manager")) && (await canIssueFor(actor, userId));
}

export async function canViewCertificateAsset(actor: Actor, assetId: string): Promise<boolean> {
  if (actor.kind === "system") return true;
  const [c] = await db().select({ userId: certificates.userId }).from(certificates).where(eq(certificates.pdfAssetId, assetId)).limit(1);
  return !!c && (await canViewPerson(actor, c.userId));
}

const verifyLimiter = createRateLimiter();

/** Doğrulama sayfası girişi: IP başına hız sınırı (karar #80; `verify.ip_*` parametreleri). */
export async function verifyFromRequest(token: string, ip: string | null): Promise<VerifyView | "rate_limited" | null> {
  const s = await getSettings(["verify.ip_max_requests", "verify.ip_window_min"]);
  if (!verifyLimiter(ip ?? "unknown", s["verify.ip_max_requests"], s["verify.ip_window_min"] * 60_000)) return "rate_limited";
  return verifyCertificate(token);
}
