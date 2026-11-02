import ExcelJS from "exceljs";
import { eq } from "drizzle-orm";
import { createTranslator } from "next-intl";
import type { Actor } from "@/server/authz/actor";
import { assertUser } from "@/server/authz/policy";
import { db } from "@/server/db/client";
import { orgUnits, reportExports } from "@/server/db/schema";
import { withActor } from "@/server/db/with-actor";
import { messagesFor } from "@/server/i18n/messages";
import { toAppLocale, type AppLocale } from "@/lib/locale";
import { getSettings } from "../settings";
import { formatDate } from "./format";
import type { ReportFilters } from "./index";
import { managementSummary, type ManagementSummary } from "./summary";

/** Ay adı ("Ekim 2026"): ayın ortası UTC öğlen, saat diliminden etkilenmez. */
export function monthLabel(month: string, locale: AppLocale, style: "long" | "short" = "long"): string {
  const date = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7) - 1, 15, 12));
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "tr-TR", { month: style, year: "numeric", timeZone: "UTC" }).format(date);
}

type Row = { label: string; value: number | null; format: "count" | "days" | "percent"; basis: "now" | "period" };

/** Excel'deki gösterge satırları (ekrandaki sırayla). Oran 0–1 kesir olarak yazılır, hücre biçimi yüzde. */
function indicatorRows(s: ManagementSummary, t: (key: string, values?: Record<string, string | number>) => string): Row[] {
  const rows: Row[] = [];
  if (s.current) {
    rows.push({ label: t("kpi.activeTrainees"), value: s.current.activeTrainees, format: "count", basis: "now" });
    rows.push({ label: t("kpi.awaitingReadiness"), value: s.current.awaitingReadiness, format: "count", basis: "now" });
    rows.push({ label: t("kpi.overdue"), value: s.current.overdue, format: "count", basis: "now" });
  }
  if (s.period) {
    rows.push({ label: t("kpi.readinessApproved"), value: s.period.readinessApproved, format: "count", basis: "period" });
    rows.push({ label: t("kpi.onboardingDaysUnit"), value: s.period.onboarding.avg, format: "days", basis: "period" });
    rows.push({ label: t("kpi.onboardingMedianUnit"), value: s.period.onboarding.median, format: "days", basis: "period" });
    rows.push({ label: t("kpi.modulesCompleted"), value: s.period.modulesCompleted, format: "count", basis: "period" });
  }
  rows.push({ label: t(s.mode === "ohs" ? "kpi.firstPassOhs" : "kpi.firstPass"), value: s.exams.rate === null ? null : s.exams.rate / 100, format: "percent", basis: "period" });
  rows.push({ label: t("kpi.firstAttempts"), value: s.exams.attempts, format: "count", basis: "period" });
  rows.push({ label: t("kpi.ohsCompleted"), value: s.ohs.completed, format: "count", basis: "period" });
  rows.push({ label: t("kpi.ohsExpired"), value: s.ohs.expired, format: "count", basis: "now" });
  for (const w of s.ohs.expiring) rows.push({ label: t("kpi.ohsExpiring", { days: w.days }), value: w.count, format: "count", basis: "now" });
  return rows;
}

/**
 * Yönetim özeti Excel'i (karar #239): göstergeler, aylık eğilim ve bilgi sayfası; indirenin dilinde. Yetki ve kapsam
 * `managementSummary`'de; her indirme `report_exports`'a (`summary`) yazılır.
 */
export async function exportSummary(
  actor: Actor,
  filters: ReportFilters,
  locale: AppLocale = "tr",
): Promise<{ buffer: Buffer; fileName: string; contentType: string }> {
  assertUser(actor);
  const s = await managementSummary(actor, filters);
  const { "org.timezone": tz } = await getSettings(["org.timezone"]);
  const messages = messagesFor(locale);
  const t = createTranslator({ locale: toAppLocale(locale), messages, namespace: "reports.summary" }) as unknown as (
    key: string,
    values?: Record<string, string | number>,
  ) => string;
  const tr = createTranslator({ locale: toAppLocale(locale), messages, namespace: "reports" }) as unknown as typeof t;
  const appName = createTranslator({ locale: toAppLocale(locale), messages, namespace: "app" })("name");
  const [unit] = filters.orgUnitId ? await db().select({ name: orgUnits.name }).from(orgUnits).where(eq(orgUnits.id, filters.orgUnitId)).limit(1) : [];

  const wb = new ExcelJS.Workbook();
  wb.creator = appName;
  const rows = indicatorRows(s, t);
  const ws = wb.addWorksheet(t("excel.sheet").slice(0, 31));
  ws.addRow([t("excel.indicator"), t("excel.value"), t("excel.basis")]);
  for (const r of rows) {
    const row = ws.addRow([r.label, r.value, t(`groups.${r.basis}`)]);
    row.getCell(2).numFmt = r.format === "percent" ? "0%" : r.format === "days" ? "0.0" : "0";
  }
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.getColumn(1).width = Math.max(30, ...rows.map((r) => r.label.length + 2));
  ws.getColumn(2).width = 12;
  ws.getColumn(3).width = 24;

  const trend = wb.addWorksheet(t("excel.trendSheet").slice(0, 31));
  trend.addRow([t("trend.month"), t(s.mode === "ohs" ? "trend.completedOhs" : "trend.completed"), t("trend.attempts"), t("trend.passed"), t("trend.ratePercent")]);
  for (const p of s.trend) {
    const row = trend.addRow([
      p.partial ? `${monthLabel(p.month, locale)} (${t("trend.partial")})` : monthLabel(p.month, locale),
      p.completed,
      p.attempts,
      p.passed,
      p.rate === null ? null : p.rate / 100,
    ]);
    row.getCell(5).numFmt = "0%";
  }
  trend.getRow(1).font = { bold: true };
  trend.views = [{ state: "frozen", ySplit: 1 }];
  trend.columns.forEach((col, i) => (col.width = i === 0 ? 26 : 22));

  const info = wb.addWorksheet(tr("meta.sheet"));
  info.addRow([t("title")]);
  info.getRow(1).font = { bold: true, size: 14 };
  for (const m of [
    tr("meta.range", { from: formatDate(filters.from, tz), to: formatDate(filters.to, tz) }),
    unit ? t("excel.unit", { name: unit.name }) : t("excel.allUnits"),
    ...(s.mode === "ohs" ? [t("ohsOnly")] : []),
    t("excel.privacy"),
    tr("meta.generated", {
      date: new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "tr-TR", { dateStyle: "long", timeStyle: "short", timeZone: tz }).format(new Date()),
    }),
  ])
    info.addRow([m]);
  info.getColumn(1).width = 80;
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());

  await withActor(actor, (tx) =>
    tx.insert(reportExports).values({
      actorId: actor.userId,
      report: "summary",
      format: "xlsx",
      filters: { from: filters.from, to: filters.to, orgUnitId: filters.orgUnitId, positionId: null },
      rowCount: rows.length + s.trend.length,
    }),
  );
  return {
    buffer,
    fileName: `${t("file")}-${filters.to.replaceAll("-", "")}.xlsx`,
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
}
