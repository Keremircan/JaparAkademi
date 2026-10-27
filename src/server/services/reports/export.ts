import ExcelJS from "exceljs";
import { createTranslator } from "next-intl";
import type { Actor } from "@/server/authz/actor";
import { assertUser } from "@/server/authz/policy";
import { reportExports } from "@/server/db/schema";
import { withActor } from "@/server/db/with-actor";
import { ValidationError } from "@/server/errors";
import { renderReportPdf } from "@/server/pdf/report";
import messages from "../../../../messages/tr.json";
import { getSettings } from "../settings";
import { formatCell, formatDate, type Translate } from "./format";
import { runReport, type ReportFilters, type ReportKind } from "./index";

/**
 * Rapor dışa aktarma (karar #96–97): istek anında Excel ya da PDF üretilir; satır sınırı aşılırsa filtre daraltılması
 * istenir. Her dışa aktarma değiştirilemez `report_exports` kaydına yazılır.
 */

export type ExportFormat = "xlsx" | "pdf";

export async function exportReport(actor: Actor, kind: ReportKind, filters: ReportFilters, format: ExportFormat): Promise<{ buffer: Buffer; fileName: string; contentType: string }> {
  assertUser(actor);
  const result = await runReport(actor, kind, filters);
  if (result.truncated) throw new ValidationError("report_too_large");
  const { "org.timezone": tz } = await getSettings(["org.timezone"]);
  const t = createTranslator({ locale: "tr", messages, namespace: "reports" }) as unknown as Translate;
  const appName = createTranslator({ locale: "tr", messages, namespace: "app" })("name");
  const title = t(`kinds.${kind}.title`);
  const meta = [
    t("meta.range", { from: formatDate(filters.from, tz), to: formatDate(filters.to, tz) }),
    t("meta.generated", { date: new Intl.DateTimeFormat("tr-TR", { dateStyle: "long", timeStyle: "short", timeZone: tz }).format(new Date()) }),
  ];
  const warnings = result.warnings.map((w) => t(`warnings.${w}`));
  const tables = result.tables.map((tbl) => ({
    title: t(`kinds.${kind}.tables.${tbl.key}`),
    headers: tbl.columns.map((c) => t(`columns.${c}`)),
    columns: tbl.columns,
    rows: tbl.rows,
  }));
  const rowCount = result.tables.reduce((a, tbl) => a + tbl.rows.length, 0);
  const stamp = filters.to.replaceAll("-", "");
  const fileName = `${t(`kinds.${kind}.file`)}-${stamp}.${format}`;

  let buffer: Buffer;
  if (format === "xlsx") {
    const wb = new ExcelJS.Workbook();
    wb.creator = appName;
    for (const tbl of tables) {
      const ws = wb.addWorksheet(tbl.title.slice(0, 31));
      ws.addRow(tbl.headers);
      ws.getRow(1).font = { bold: true };
      ws.views = [{ state: "frozen", ySplit: 1 }];
      for (const r of tbl.rows) {
        // Sayı ve tarih Excel'de hesaplanabilir kalır; kodlar ve evet/hayır çevrilir
        ws.addRow(r.map((v, i) => (typeof v === "number" ? v : v instanceof Date ? v : v === null ? null : formatCell(tbl.columns[i]!, v, t, tz))));
      }
      ws.columns.forEach((col, i) => {
        col.width = Math.min(60, Math.max(10, tbl.headers[i]!.length + 2, ...tbl.rows.slice(0, 200).map((r) => formatCell(tbl.columns[i]!, r[i] ?? null, t, tz).length + 2)));
        if (tbl.rows.some((r) => r[i] instanceof Date)) col.numFmt = "dd.mm.yyyy";
      });
      if (tbl.rows.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: tbl.headers.length } };
    }
    const info = wb.addWorksheet(t("meta.sheet"));
    info.addRow([title]);
    info.getRow(1).font = { bold: true, size: 14 };
    for (const m of [...meta, ...warnings]) info.addRow([m]);
    info.getColumn(1).width = 80;
    buffer = Buffer.from(await wb.xlsx.writeBuffer());
  } else {
    buffer = await renderReportPdf({
      appName,
      title,
      meta,
      warnings,
      tables: tables.map((tbl) => ({ title: tbl.title, headers: tbl.headers, rows: tbl.rows.map((r) => r.map((v, i) => formatCell(tbl.columns[i]!, v, t, tz))) })),
      footer: `${appName} · ${title}`,
    });
  }

  await withActor(actor, (tx) =>
    tx.insert(reportExports).values({
      actorId: actor.userId,
      report: kind,
      format,
      filters: { from: filters.from, to: filters.to, orgUnitId: filters.orgUnitId, positionId: filters.positionId },
      rowCount,
    }),
  );
  return { buffer, fileName, contentType: format === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "application/pdf" };
}
