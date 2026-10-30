import ExcelJS from "exceljs";
import { and, count, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import type { Actor } from "@/server/authz/actor";
import { assertCan, assertUser } from "@/server/authz/policy";
import { db } from "@/server/db/client";
import { loginAttempts, personnel, reportExports } from "@/server/db/schema";
import { withActor } from "@/server/db/with-actor";
import { ValidationError } from "@/server/errors";
import { LOGIN_FAILURE_RESULTS, maskLoginInput, type LoginResult } from "@/server/state/login-log";
import { getSettings } from "./settings";

/**
 * Giriş kayıtları ekranı (karar #215): sistem yöneticisi ve üst yönetici, salt okunur. Kayıtlar değiştirilemez;
 * saklama süresini (`retention.login_attempt_days`) geçenler gece silinir (karar #216).
 * Bilinmeyen kullanıcı denemesinde yazılan metin maskelenir (kişi yanlışlıkla şifresini yazmış olabilir).
 */

export type LoginLogFilters = {
  /** Sicil no, ad soyad ya da IP (parça) */
  q: string | null;
  /** Tek sonuç ya da "failed" (başarısız olanların hepsi) */
  result: LoginResult | "failed" | null;
  from: string | null;
  to: string | null;
};

export type LoginLogEntry = {
  id: string;
  at: Date;
  input: string;
  userId: string | null;
  fullName: string | null;
  sicilNo: string | null;
  ip: string | null;
  userAgent: string | null;
  result: LoginResult;
};

const PAGE = 50;
const EXPORT_MAX = 10_000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

async function conditions(f: LoginLogFilters): Promise<SQL[]> {
  const { "org.timezone": tz } = await getSettings(["org.timezone"]);
  const conds: SQL[] = [];
  if (f.result === "failed") conds.push(inArray(loginAttempts.result, [...LOGIN_FAILURE_RESULTS]));
  else if (f.result) conds.push(eq(loginAttempts.result, f.result));
  if (f.from && DATE.test(f.from)) conds.push(sql`${loginAttempts.at} >= (${f.from}::date)::timestamp at time zone ${tz}`);
  if (f.to && DATE.test(f.to)) conds.push(sql`${loginAttempts.at} < ((${f.to}::date + 1)::timestamp at time zone ${tz})`);
  const q = f.q?.trim().slice(0, 100);
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    // Bilinmeyen kullanıcı denemesinin metni maskeli gösterildiğinden yalnızca kişiye bağlı denemelerde aranır
    conds.push(or(ilike(personnel.sicilNo, like), ilike(personnel.fullName, like), ilike(loginAttempts.ip, like))!);
  }
  return conds;
}

function toEntry(r: {
  a: typeof loginAttempts.$inferSelect;
  fullName: string | null;
  sicilNo: string | null;
}): LoginLogEntry {
  return {
    id: r.a.id,
    at: r.a.at,
    input: maskLoginInput(r.a.sicilInput, r.a.result),
    userId: r.a.userId,
    fullName: r.fullName,
    sicilNo: r.sicilNo,
    ip: r.a.ip,
    userAgent: r.a.userAgent,
    result: r.a.result,
  };
}

function select() {
  return db()
    .select({ a: loginAttempts, fullName: personnel.fullName, sicilNo: personnel.sicilNo })
    .from(loginAttempts)
    .leftJoin(personnel, eq(personnel.userId, loginAttempts.userId));
}

export async function listLoginAttempts(
  actor: Actor,
  f: LoginLogFilters,
  page = 1,
): Promise<{ entries: LoginLogEntry[]; page: number; hasNext: boolean; summary: Partial<Record<LoginResult, number>> }> {
  assertUser(actor);
  assertCan(actor, "logins.view");
  const conds = await conditions(f);
  const where = conds.length ? and(...conds) : undefined;
  const p = Math.max(1, Math.min(page, 1000));
  const rows = await select()
    .where(where)
    .orderBy(desc(loginAttempts.at), desc(loginAttempts.id))
    .limit(PAGE + 1)
    .offset((p - 1) * PAGE);
  // Sonuçlara göre sayılar (süzgeçteki aralıkta; sonuç süzgeci hariç) — saldırı/kilit dalgası bir bakışta görünür
  const summaryConds = await conditions({ ...f, result: null });
  const counts = await db()
    .select({ result: loginAttempts.result, n: count() })
    .from(loginAttempts)
    .leftJoin(personnel, eq(personnel.userId, loginAttempts.userId))
    .where(summaryConds.length ? and(...summaryConds) : undefined)
    .groupBy(loginAttempts.result);
  return {
    page: p,
    hasNext: rows.length > PAGE,
    entries: rows.slice(0, PAGE).map(toEntry),
    summary: Object.fromEntries(counts.map((c) => [c.result, Number(c.n)])),
  };
}

/** Excel dışa aktarma; her indirme `report_exports`'a yazılır. Satır sınırı aşılırsa daraltılması istenir. */
export async function exportLoginAttempts(
  actor: Actor,
  f: LoginLogFilters,
  labels: { columns: string[]; results: Record<LoginResult, string>; sheet: string },
): Promise<{ buffer: Buffer; rowCount: number }> {
  assertUser(actor);
  assertCan(actor, "logins.view");
  const conds = await conditions(f);
  const rows = await select()
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(loginAttempts.at), desc(loginAttempts.id))
    .limit(EXPORT_MAX + 1);
  if (rows.length > EXPORT_MAX) throw new ValidationError("report_too_large");
  const { "org.timezone": tz } = await getSettings(["org.timezone"]);
  const fmt = new Intl.DateTimeFormat("tr-TR", { timeZone: tz, dateStyle: "short", timeStyle: "medium" });

  const wb = new ExcelJS.Workbook();
  wb.creator = "JAPAR Akademi";
  const sheet = wb.addWorksheet(labels.sheet);
  sheet.addRow(labels.columns);
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  [20, 22, 28, 14, 22, 18, 50].forEach((w, i) => (sheet.getColumn(i + 1).width = w));
  for (const e of rows.map(toEntry)) {
    sheet.addRow([fmt.format(e.at), e.input, e.fullName ?? "", e.sicilNo ?? "", labels.results[e.result], e.ip ?? "", e.userAgent ?? ""]);
  }
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  await withActor(actor, (tx) =>
    tx.insert(reportExports).values({
      actorId: actor.userId,
      report: "login_attempts",
      format: "xlsx",
      filters: { q: f.q, result: f.result, from: f.from, to: f.to },
      rowCount: rows.length,
    }),
  );
  return { buffer, rowCount: rows.length };
}
