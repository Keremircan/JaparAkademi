import ExcelJS from "exceljs";
import { and, eq, sql } from "drizzle-orm";
import { createTranslator } from "next-intl";
import type { Actor } from "@/server/authz/actor";
import { assertCan, assertUser, can } from "@/server/authz/policy";
import { decryptNationalId } from "@/server/crypto/national-id";
import { db } from "@/server/db/client";
import { assignmentModules, assignments, dataAccessLog, modules, orgUnits, personnel, positions, priorTrainings, reportExports, users } from "@/server/db/schema";
import { withActor } from "@/server/db/with-actor";
import { ValidationError } from "@/server/errors";
import { messagesFor } from "@/server/i18n/messages";
import { documentNo } from "@/server/state/certification";
import { decimalText, OSGB_COLUMNS, osgbMethod, toCsv, type OsgbMethod, type OsgbSource } from "@/server/state/osgb";
import { priorExpiry } from "@/server/state/periodic";
import { minutesToHours } from "@/server/state/reports";
import { toAppLocale, type AppLocale } from "@/lib/locale";
import type { OhsTopic } from "@/lib/ohs";
import { getSettings } from "../settings";
import { formatDate } from "./format";
import { range, unitCondition, type ReportFilters } from "./index";

/**
 * OSGB dışa aktarımı (iş paketi 3.3, kararlar #226–229). Dönemdeki İSG eğitim kayıtları kişi × eğitim satırı olarak:
 * sistemde tamamlanan İSG modülleri + eski personel için girilen son eğitim tarihleri (`prior_trainings`).
 * Yetki İSG raporuyla aynı (`reports.ohs`); İSG uzmanı bütün personeli görür. Tam TC kimlik no yalnızca
 * `people.view_national_id` (İK) indirirken yazılır ve dosyadaki her kişi için `data_access_log`'a kayıt düşülür.
 */

export type OsgbFormat = "xlsx" | "csv";

export type OsgbRecord = {
  userId: string;
  nationalId: string | null;
  sicil: string | null;
  name: string;
  unit: string;
  position: string;
  topic: string;
  topicGroup: OhsTopic | null;
  /** YYYY-MM-DD (kurum saat diliminde) */
  date: string;
  hours: number;
  method: OsgbMethod | null;
  trainer: string | null;
  documentNo: string | null;
  validUntil: string | null;
  source: OsgbSource;
};

function guard(actor: Actor) {
  assertUser(actor);
  assertCan(actor, "reports.ohs");
}

/** Dönemin kayıtları; satır sınırı aşılırsa filtre daraltılması istenir (`report_too_large`). */
export async function osgbRecords(actor: Actor, f: ReportFilters): Promise<{ records: OsgbRecord[]; withNationalId: boolean }> {
  guard(actor);
  const { "reports.max_rows": max, "org.timezone": tz } = await getSettings(["reports.max_rows", "org.timezone"]);
  const unit = await unitCondition(actor, f, positions.id, { ohsAll: true });
  const withNationalId = can(actor, "people.view_national_id");

  const system = await db()
    .select({
      userId: users.id,
      enc: personnel.nationalIdEnc,
      sicil: users.username,
      name: users.name,
      unit: orgUnits.name,
      position: positions.name,
      topic: assignmentModules.title,
      topicGroup: modules.ohsTopic,
      day: sql<string>`to_char(${assignmentModules.completedAt} at time zone ${tz}, 'YYYY-MM-DD')`,
      minutes: assignmentModules.durationMin,
      via: assignmentModules.completedVia,
      validUntil: sql<string | null>`to_char(${assignmentModules.expiresAt} at time zone ${tz}, 'YYYY-MM-DD')`,
      trainer: sql<string | null>`(
        select tu.name from classroom_attendees ca
        join classroom_sessions cs on cs.id = ca.session_id
        join users tu on tu.id = cs.trainer_user_id
        where ca.user_id = ${assignments.userId} and cs.module_id = ${assignmentModules.moduleId} and cs.status = 'approved'
        order by cs.session_date desc limit 1)`,
      certSerial: sql<number | null>`(
        select c.serial_no from certificates c
        where c.assignment_module_id = ${assignmentModules.id} and c.kind = 'attendance' and c.status = 'valid'
        order by c.issued_at desc limit 1)`,
      certYear: sql<number | null>`(
        select extract(year from c.issued_at at time zone ${tz})::int from certificates c
        where c.assignment_module_id = ${assignmentModules.id} and c.kind = 'attendance' and c.status = 'valid'
        order by c.issued_at desc limit 1)`,
    })
    .from(assignmentModules)
    .innerJoin(assignments, eq(assignments.id, assignmentModules.assignmentId))
    .innerJoin(modules, eq(modules.id, assignmentModules.moduleId))
    .innerJoin(users, eq(users.id, assignments.userId))
    .leftJoin(personnel, eq(personnel.userId, users.id))
    .innerJoin(positions, eq(positions.id, assignments.positionId))
    .innerJoin(orgUnits, eq(orgUnits.id, positions.orgUnitId))
    .where(
      and(
        unit,
        eq(assignmentModules.isOhs, true),
        eq(assignmentModules.status, "completed"),
        // Devreden modül ilk tamamlandığı kayıtla zaten dosyadadır (karar #94)
        sql`${assignmentModules.completedVia} <> 'carried_over'`,
        range(assignmentModules.completedAt, f, tz),
      ),
    )
    .limit(max + 1);

  // Girilen son eğitim tarihleri: kişi × modülde en son girilen kayıt geçerlidir (karar #223); kişinin bugünkü pozisyonu
  const latest = sql`not exists (
    select 1 from prior_trainings n
    where n.user_id = ${priorTrainings.userId} and n.module_id = ${priorTrainings.moduleId}
      and (n.created_at, n.id) > (${priorTrainings.createdAt}, ${priorTrainings.id}))`;
  const prior = await db()
    .select({
      userId: users.id,
      enc: personnel.nationalIdEnc,
      sicil: users.username,
      name: users.name,
      unit: orgUnits.name,
      position: positions.name,
      topic: modules.title,
      topicGroup: modules.ohsTopic,
      day: priorTrainings.completedOn,
      minutes: modules.durationMin,
      validityMonths: modules.validityMonths,
    })
    .from(priorTrainings)
    .innerJoin(modules, eq(modules.id, priorTrainings.moduleId))
    .innerJoin(users, eq(users.id, priorTrainings.userId))
    .innerJoin(personnel, eq(personnel.userId, users.id))
    .innerJoin(positions, eq(positions.id, personnel.positionId))
    .innerJoin(orgUnits, eq(orgUnits.id, positions.orgUnitId))
    .where(and(unit, eq(modules.isOhs, true), latest, sql`${priorTrainings.completedOn} between ${f.from}::date and ${f.to}::date`))
    .limit(max + 1);

  if (system.length + prior.length > max) throw new ValidationError("report_too_large");

  const nid = (enc: string | null) => (withNationalId && enc ? decryptNationalId(enc) : null);
  const records: OsgbRecord[] = [
    ...system.map((r) => ({
      userId: r.userId,
      nationalId: nid(r.enc),
      sicil: r.sicil,
      name: r.name,
      unit: r.unit,
      position: r.position,
      topic: r.topic,
      topicGroup: r.topicGroup,
      date: r.day,
      hours: minutesToHours(r.minutes),
      method: osgbMethod(r.via),
      trainer: r.trainer,
      documentNo: r.certSerial !== null && r.certYear !== null ? documentNo(r.certSerial, r.certYear) : null,
      validUntil: r.validUntil,
      source: "system" as const,
    })),
    ...prior.map((r) => ({
      userId: r.userId,
      nationalId: nid(r.enc),
      sicil: r.sicil,
      name: r.name,
      unit: r.unit,
      position: r.position,
      topic: r.topic,
      topicGroup: r.topicGroup,
      date: r.day,
      hours: minutesToHours(r.minutes),
      method: null,
      trainer: null,
      documentNo: null,
      validUntil: r.validityMonths ? priorExpiry(r.day, r.validityMonths) : null,
      source: "prior" as const,
    })),
  ].sort((a, b) => a.name.localeCompare(b.name, "tr") || a.date.localeCompare(b.date) || a.topic.localeCompare(b.topic, "tr"));
  return { records, withNationalId };
}

/** Excel ya da CSV üretir; indirme `report_exports`'a, tam TC'si yazılan her kişi `data_access_log`'a kaydedilir. */
export async function exportOsgb(
  actor: Actor,
  filters: ReportFilters,
  format: OsgbFormat,
  locale: AppLocale = "tr",
): Promise<{ buffer: Buffer; fileName: string; contentType: string }> {
  assertUser(actor);
  const { records, withNationalId } = await osgbRecords(actor, filters);
  const { "org.timezone": tz } = await getSettings(["org.timezone"]);
  const t = createTranslator({ locale: toAppLocale(locale), messages: messagesFor(locale), namespace: "reports.osgb" });
  const headers = OSGB_COLUMNS.map((c) => t(`columns.${c}`));
  const text = (r: OsgbRecord) => ({
    topicGroup: r.topicGroup ? t(`topicGroups.${r.topicGroup}`) : t("topicGroups.none"),
    method: r.method ? t(`methods.${r.method}`) : "",
    source: t(`sources.${r.source}`),
  });
  const stamp = filters.to.replaceAll("-", "");
  const fileName = `${t("file")}-${stamp}.${format}`;

  let buffer: Buffer;
  if (format === "xlsx") {
    const wb = new ExcelJS.Workbook();
    wb.creator = createTranslator({ locale: toAppLocale(locale), messages: messagesFor(locale), namespace: "app" })("name");
    const ws = wb.addWorksheet(t("sheet").slice(0, 31));
    ws.addRow(headers);
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: "frozen", ySplit: 1 }];
    const day = (d: string | null) => (d ? new Date(`${d}T00:00:00Z`) : null);
    for (const r of records) {
      const x = text(r);
      ws.addRow([r.nationalId, r.sicil, r.name, r.unit, r.position, r.topic, x.topicGroup, day(r.date), r.hours, x.method, r.trainer, r.documentNo, day(r.validUntil), x.source]);
    }
    ws.columns.forEach((col, i) => {
      const key = OSGB_COLUMNS[i]!;
      col.width = key === "date" || key === "validUntil" ? 12 : key === "hours" ? 8 : Math.min(50, Math.max(12, headers[i]!.length + 2));
      if (key === "date" || key === "validUntil") col.numFmt = "dd.mm.yyyy";
      // TC ve sicil metin kalır (baştaki sıfırlar kaybolmasın)
      if (key === "nationalId" || key === "sicil") col.numFmt = "@";
    });
    if (records.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };
    buffer = Buffer.from(await wb.xlsx.writeBuffer());
  } else {
    const date = (d: string | null) => (d ? formatDate(d, tz) : "");
    const rows = records.map((r) => {
      const x = text(r);
      return [
        r.nationalId ?? "",
        r.sicil ?? "",
        r.name,
        r.unit,
        r.position,
        r.topic,
        x.topicGroup,
        date(r.date),
        decimalText(r.hours, locale),
        x.method,
        r.trainer ?? "",
        r.documentNo ?? "",
        date(r.validUntil),
        x.source,
      ];
    });
    buffer = Buffer.from(toCsv([headers, ...rows]), "utf8");
  }

  const subjects = withNationalId ? [...new Set(records.filter((r) => r.nationalId).map((r) => r.userId))] : [];
  await withActor(actor, async (tx) => {
    await tx.insert(reportExports).values({
      actorId: actor.userId,
      report: "osgb",
      format,
      filters: { from: filters.from, to: filters.to, orgUnitId: filters.orgUnitId, positionId: filters.positionId, nationalId: withNationalId ? "full" : "none" },
      rowCount: records.length,
    });
    // KVKK: tam TC'nin her açılışı kayıtlıdır (kişi başına bir satır)
    for (let i = 0; i < subjects.length; i += 1000) {
      await tx.insert(dataAccessLog).values(subjects.slice(i, i + 1000).map((s) => ({ actorId: actor.userId, subjectUserId: s, field: "national_id_osgb" })));
    }
  });
  return {
    buffer,
    fileName,
    contentType: format === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "text/csv; charset=utf-8",
  };
}

