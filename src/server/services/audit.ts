import { and, asc, desc, eq, sql, type SQL } from "drizzle-orm";
import type { Actor } from "@/server/authz/actor";
import { assertCan, assertUser } from "@/server/authz/policy";
import { db } from "@/server/db/client";
import { auditLog, users } from "@/server/db/schema";
import { getSettings } from "./settings";

/**
 * Denetim kaydı ekranı (SPEC Bölüm 7, karar #98): yalnızca sistem yöneticisi, salt okunur.
 * Maskeli alanlar (TC, şifre özeti, token, e-posta adresi…) trigger tarafından maskeli yazıldığı için öyle görünür.
 */

export type AuditFilters = { table: string | null; actorId: string | null; recordId: string | null; from: string | null; to: string | null };
export type AuditChange = { field: string; old: unknown; new: unknown };
export type AuditEntry = { id: number; at: Date; actorName: string | null; actorId: string | null; table: string; recordId: string | null; action: string; changes: AuditChange[] };

const PAGE = 50;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const IGNORED = new Set(["updated_at", "created_at"]);

/** Değişen alanlar: INSERT'te yeni değerler, DELETE'te eski değerler, UPDATE'te farklı olanlar. */
export function diffRecord(oldData: Record<string, unknown> | null, newData: Record<string, unknown> | null): AuditChange[] {
  const keys = [...new Set([...Object.keys(oldData ?? {}), ...Object.keys(newData ?? {})])].sort();
  return keys
    .filter((k) => !IGNORED.has(k))
    .map((k) => ({ field: k, old: oldData?.[k] ?? null, new: newData?.[k] ?? null }))
    .filter((c) => JSON.stringify(c.old) !== JSON.stringify(c.new));
}

export async function listAuditLog(actor: Actor, f: AuditFilters, page = 1): Promise<{ entries: AuditEntry[]; page: number; hasNext: boolean }> {
  assertUser(actor);
  assertCan(actor, "audit.view");
  const { "org.timezone": tz } = await getSettings(["org.timezone"]);
  const conds: SQL[] = [];
  if (f.table) conds.push(eq(auditLog.tableName, f.table));
  if (f.actorId) conds.push(eq(auditLog.actorId, f.actorId));
  if (f.recordId) conds.push(eq(auditLog.recordId, f.recordId));
  if (f.from && DATE.test(f.from)) conds.push(sql`${auditLog.at} >= (${f.from}::date)::timestamp at time zone ${tz}`);
  if (f.to && DATE.test(f.to)) conds.push(sql`${auditLog.at} < ((${f.to}::date + 1)::timestamp at time zone ${tz})`);
  const p = Math.max(1, page);
  const rows = await db()
    .select({ a: auditLog, actorName: users.name })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.actorId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(auditLog.id))
    .limit(PAGE + 1)
    .offset((p - 1) * PAGE);
  return {
    page: p,
    hasNext: rows.length > PAGE,
    entries: rows.slice(0, PAGE).map(({ a, actorName }) => ({
      id: a.id,
      at: a.at,
      actorId: a.actorId,
      actorName,
      table: a.tableName,
      recordId: a.recordId,
      action: a.action,
      changes: diffRecord(a.oldData as Record<string, unknown> | null, a.newData as Record<string, unknown> | null),
    })),
  };
}

/** Filtre için denetimli tablolar. */
export async function auditTables(actor: Actor): Promise<string[]> {
  assertUser(actor);
  assertCan(actor, "audit.view");
  const rows = await db().selectDistinct({ table: auditLog.tableName }).from(auditLog).orderBy(asc(auditLog.tableName));
  return rows.map((r) => r.table);
}
