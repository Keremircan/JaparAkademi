import ExcelJS from "exceljs";
import { createTranslator } from "next-intl";
import { asc, desc, eq } from "drizzle-orm";
import type { Actor } from "@/server/authz/actor";
import { assertCan, assertUser } from "@/server/authz/policy";
import { db } from "@/server/db/client";
import {
  assignmentModules,
  assignments,
  certificates,
  consents,
  dataAccessLog,
  examAttempts,
  legalTexts,
  orgUnits,
  personnel,
  positions,
  practicalExamResults,
  userRoles,
} from "@/server/db/schema";
import { withActor } from "@/server/db/with-actor";
import { ForbiddenError, NotFoundError } from "@/server/errors";
import { documentNo } from "@/server/state/certification";
import { toAppLocale, type AppLocale } from "@/lib/locale";
import { messagesFor } from "@/server/i18n/messages";
import { formatCell, type Translate } from "./reports/format";
import { getSettings } from "./settings";

/**
 * KVKK kişi verisi dışa aktarma (SPEC 13.3, karar #99): İK, kişinin sistemdeki kişisel verilerini Excel olarak indirir.
 * TC maskeli yer alır; soru ve cevaplar yoktur. Her dışa aktarma `data_access_log`'a yazılır. Kimse kendi verisini bu
 * yolla dışa aktaramaz (talep İK'ya iletilir).
 */

export async function exportPersonalData(actor: Actor, userId: string, locale: AppLocale = "tr"): Promise<{ base64: string; fileName: string }> {
  assertUser(actor);
  assertCan(actor, "people.export_personal");
  if (actor.userId === userId) throw new ForbiddenError("self_action");
  const [p] = await db()
    .select({ p: personnel, positionName: positions.name, unitName: orgUnits.name })
    .from(personnel)
    .leftJoin(positions, eq(positions.id, personnel.positionId))
    .leftJoin(orgUnits, eq(orgUnits.id, positions.orgUnitId))
    .where(eq(personnel.userId, userId))
    .limit(1);
  if (!p) throw new NotFoundError("person");

  const { "org.timezone": tz } = await getSettings(["org.timezone"]);
  // İndiren kişinin dilinde (karar #217)
  const messages = messagesFor(locale);
  const t = createTranslator({ locale: toAppLocale(locale), messages, namespace: "personalExport" }) as unknown as Translate;
  const tr = createTranslator({ locale: toAppLocale(locale), messages, namespace: "reports" }) as unknown as Translate;
  // Kodlar okunur metne çevrilir (kişiye verilen belge)
  const T = createTranslator({ locale: toAppLocale(locale), messages }) as unknown as Translate;
  const v = (value: string | number | boolean | Date | null, column = "") => (value instanceof Date || typeof value === "boolean" || value === null ? formatCell(column, value, tr, tz) : String(value));

  const roles = await db().select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, userId));
  const mods = await db()
    .select({ a: assignments, m: assignmentModules })
    .from(assignmentModules)
    .innerJoin(assignments, eq(assignments.id, assignmentModules.assignmentId))
    .where(eq(assignments.userId, userId))
    .orderBy(desc(assignments.createdAt), asc(assignmentModules.sortOrder));
  const theory = await db()
    .select({ at: examAttempts, title: assignmentModules.title })
    .from(examAttempts)
    .innerJoin(assignmentModules, eq(assignmentModules.id, examAttempts.assignmentModuleId))
    .innerJoin(assignments, eq(assignments.id, assignmentModules.assignmentId))
    .where(eq(assignments.userId, userId))
    .orderBy(asc(examAttempts.startedAt));
  const practical = await db()
    .select({ r: practicalExamResults, title: assignmentModules.title })
    .from(practicalExamResults)
    .innerJoin(assignmentModules, eq(assignmentModules.id, practicalExamResults.assignmentModuleId))
    .innerJoin(assignments, eq(assignments.id, assignmentModules.assignmentId))
    .where(eq(assignments.userId, userId))
    .orderBy(asc(practicalExamResults.createdAt));
  const certs = await db().select().from(certificates).where(eq(certificates.userId, userId)).orderBy(asc(certificates.issuedAt));
  const consentRows = await db()
    .select({ c: consents, title: legalTexts.title, version: legalTexts.version })
    .from(consents)
    .innerJoin(legalTexts, eq(legalTexts.id, consents.legalTextId))
    .where(eq(consents.userId, userId))
    .orderBy(asc(consents.acceptedAt));

  const wb = new ExcelJS.Workbook();
  const sheet = (name: string, headers: string[], rows: (string | number)[][]) => {
    const ws = wb.addWorksheet(t(`sheets.${name}`).slice(0, 31));
    ws.addRow(headers.map((h) => t(`columns.${h}`)));
    ws.getRow(1).font = { bold: true };
    for (const r of rows) ws.addRow(r);
    ws.columns.forEach((c) => (c.width = 24));
  };
  sheet(
    "identity",
    ["sicil", "fullName", "nationalId", "phone", "email", "unit", "position", "employmentType", "hireDate", "endDate", "status"],
    [[p.p.sicilNo, p.p.fullName, p.p.nationalIdMasked ?? "—", p.p.phone ?? "—", p.p.email ?? "—", p.unitName ?? "—", p.positionName ?? "—", T(`admin.people.form.employmentTypes.${p.p.employmentType}`), v(p.p.hireDate), v(p.p.endDate), T(`admin.people.status.${p.p.status}`)]],
  );
  sheet("roles", ["role"], roles.map((r) => [T(`roles.${r.role}`)]));
  sheet(
    "training",
    ["assignmentStart", "assignmentStatus", "module", "moduleStatus", "completedAt", "method", "validUntil"],
    mods.map(({ a, m }) => [
      v(a.startDate),
      T(`assignments.status.${a.status}`),
      m.title,
      T(`readiness.moduleStatus.${m.status}`),
      v(m.completedAt),
      m.completedVia ? T(`reports.values.method.${m.completedVia}`) : "—",
      v(m.expiresAt),
    ]),
  );
  sheet(
    "exams",
    ["exam", "examType", "attemptNo", "date", "score", "result"],
    [
      ...theory.map(({ at, title }) => [title, T("reports.values.examType.theory"), at.attemptNo, v(at.submittedAt ?? at.startedAt), at.score ?? "—", at.passed === null ? "—" : v(at.passed, "result")]),
      ...practical.map(({ r, title }) => [title, T("reports.values.examType.practical"), r.attemptNo, v(r.finalizedAt ?? r.createdAt), r.score ?? "—", r.passed === null ? "—" : v(r.passed, "result")]),
    ],
  );
  sheet(
    "certificates",
    ["documentNo", "certificate", "issuedAt", "expiresAt", "certificateStatus"],
    certs.map((c) => [documentNo(c.serialNo, c.issuedAt.getFullYear()), c.title, v(c.issuedAt), v(c.expiresAt), T(`certificates.list.state.${c.status}`)]),
  );
  sheet("consents", ["legalText", "version", "acceptedAt"], consentRows.map((r) => [r.title, r.version, v(r.c.acceptedAt)]));

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  await withActor(actor, (tx) => tx.insert(dataAccessLog).values({ actorId: actor.userId, subjectUserId: userId, field: "personal_export" }));
  return { base64: buffer.toString("base64"), fileName: `${t("file")}-${p.p.sicilNo}.xlsx` };
}
