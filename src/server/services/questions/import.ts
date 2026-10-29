import { and, eq, inArray, isNull, or } from "drizzle-orm";
import type { Actor } from "@/server/authz/actor";
import { assertCan, assertUser, hasRole, isOwner } from "@/server/authz/policy";
import { inOrgScope, orgScopeFor } from "@/server/authz/scope";
import { db } from "@/server/db/client";
import { modules, orgUnits, questionModules, questions, questionVersions } from "@/server/db/schema";
import { withActor } from "@/server/db/with-actor";
import { ForbiddenError, ValidationError } from "@/server/errors";
import { matchKey } from "../imports/parse";
import { normalizeQuestion } from "./index";
import { buildQuestionTemplate, MAX_QUESTION_BYTES, parseQuestionWorkbook, type ParsedQuestionRow } from "./parse";

/**
 * Excel'den soru aktarma (iş paketi 1.5). Önce önizleme (satır hataları), sonra onayla: geçerli satırlar
 * tek transaction'da oluşturulur. Kişisel veri içermediği için dosya sunucuda saklanmaz; onayda yeniden okunur.
 */

export type QuestionImportTarget = { ownerOrgUnitId: string | null; isOhs: boolean };

async function assertTarget(actor: Actor & { kind: "user" }, target: QuestionImportTarget) {
  assertCan(actor, "questions.edit");
  if (target.ownerOrgUnitId === null) {
    if (!target.isOhs || !hasRole(actor, "ohs_specialist")) throw new ForbiddenError("questions.edit");
    return;
  }
  const [unit] = await db().select({ isActive: orgUnits.isActive }).from(orgUnits).where(eq(orgUnits.id, target.ownerOrgUnitId));
  if (!unit?.isActive) throw new ValidationError("org_unit_invalid");
  // Üst yönetici her birime soru aktarabilir (karar #192)
  if (isOwner(actor) || (target.isOhs && hasRole(actor, "ohs_specialist"))) return;
  const scope = await orgScopeFor(actor);
  if (!hasRole(actor, "section_manager") || scope.all || !inOrgScope(scope, target.ownerOrgUnitId)) throw new ForbiddenError("questions.edit");
}

/** Hedef birimin (ve departmanının/bölümlerinin) teorik modülleri; ortak İSG sorularında ortak modüller. */
async function targetModules(target: QuestionImportTarget): Promise<{ id: string; title: string }[]> {
  const base = and(eq(modules.kind, "theory"), isNull(modules.archivedAt));
  if (target.ownerOrgUnitId === null) {
    return db().select({ id: modules.id, title: modules.title }).from(modules).where(and(base, isNull(modules.ownerOrgUnitId)));
  }
  const [unit] = await db().select({ parentId: orgUnits.parentId }).from(orgUnits).where(eq(orgUnits.id, target.ownerOrgUnitId));
  const children = db().select({ id: orgUnits.id }).from(orgUnits).where(eq(orgUnits.parentId, target.ownerOrgUnitId));
  const units = [target.ownerOrgUnitId, ...(unit?.parentId ? [unit.parentId] : [])];
  return db()
    .select({ id: modules.id, title: modules.title })
    .from(modules)
    .where(and(base, or(inArray(modules.ownerOrgUnitId, units), inArray(modules.ownerOrgUnitId, children), isNull(modules.ownerOrgUnitId))));
}

async function parse(buffer: Buffer, target: QuestionImportTarget) {
  if (buffer.byteLength === 0) throw new ValidationError("file_empty");
  if (buffer.byteLength > MAX_QUESTION_BYTES) throw new ValidationError("file_too_large");
  const mods = await targetModules(target);
  const byKey = new Map<string, string>();
  for (const m of mods) if (!byKey.has(matchKey(m.title))) byKey.set(matchKey(m.title), m.id);
  let parsed;
  try {
    parsed = await parseQuestionWorkbook(buffer, byKey);
  } catch {
    throw new ValidationError("file_unreadable");
  }
  if (parsed.missingColumns.length) throw new ValidationError("missing_columns", parsed.missingColumns);
  if (parsed.tooManyRows) throw new ValidationError("too_many_rows");
  if (parsed.rows.length === 0) throw new ValidationError("no_rows");
  return parsed.rows;
}

export async function previewQuestionImport(actor: Actor, buffer: Buffer, target: QuestionImportTarget): Promise<ParsedQuestionRow[]> {
  assertUser(actor);
  await assertTarget(actor, target);
  return parse(buffer, target);
}

/** Geçerli satırları oluşturur. İSG sorusu/İSG kritik soru (İSG uzmanı değilse) onaya gider. */
export async function commitQuestionImport(actor: Actor, buffer: Buffer, target: QuestionImportTarget): Promise<{ created: number; pending: number; skipped: number }> {
  assertUser(actor);
  await assertTarget(actor, target);
  const rows = await parse(buffer, target);
  const valid = rows.filter((r) => r.input);
  if (valid.length === 0) throw new ValidationError("no_valid_rows");
  const ohs = hasRole(actor, "ohs_specialist");
  let pending = 0;
  await withActor(actor, async (tx) => {
    for (const r of valid) {
      const v = normalizeQuestion(r.input!);
      const [q] = await tx.insert(questions).values({ ownerOrgUnitId: target.ownerOrgUnitId, isOhs: target.isOhs, createdBy: actor.userId }).returning({ id: questions.id });
      const needs = (target.isOhs || v.isOhsCritical) && !ohs;
      if (needs) pending++;
      const [ver] = await tx
        .insert(questionVersions)
        .values({
          questionId: q!.id,
          version: 1,
          type: v.type,
          stem: v.stem,
          options: v.options,
          correctIndex: v.correctIndex,
          explanation: v.explanation,
          topic: v.topic,
          difficulty: v.difficulty,
          isOhsCritical: v.isOhsCritical,
          status: needs ? "ohs_review" : "active",
          createdBy: actor.userId,
        })
        .returning({ id: questionVersions.id });
      if (!needs) await tx.update(questions).set({ currentVersionId: ver!.id }).where(eq(questions.id, q!.id));
      await tx.insert(questionModules).values(v.moduleIds.map((moduleId) => ({ questionId: q!.id, moduleId })));
    }
  });
  return { created: valid.length - pending, pending, skipped: rows.length - valid.length };
}

export async function questionTemplate(actor: Actor, target: QuestionImportTarget): Promise<Buffer> {
  assertUser(actor);
  await assertTarget(actor, target);
  const mods = await targetModules(target);
  return buildQuestionTemplate(mods.map((m) => m.title).sort((a, b) => a.localeCompare(b, "tr")));
}
