import path from "node:path";
import { Document, Font, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";

/** Rapor PDF'i (SPEC 10.1): yatay A4, başlık, filtre bilgisi ve tablolar. Metinler çağıran tarafta hazırlanır. */

let fontRegistered = false;
function registerFont() {
  if (fontRegistered) return;
  Font.register({ family: "Geist", src: path.join(process.cwd(), "src/server/pdf/fonts/Geist-Regular.ttf") });
  Font.registerHyphenationCallback((word) => [word]);
  fontRegistered = true;
}

export type ReportPdfData = {
  appName: string;
  title: string;
  meta: string[];
  warnings: string[];
  tables: { title: string; headers: string[]; rows: string[][] }[];
  footer: string;
};

const styles = StyleSheet.create({
  page: { fontFamily: "Geist", fontSize: 8, paddingTop: 28, paddingBottom: 36, paddingHorizontal: 28, color: "#111827" },
  app: { fontSize: 8, color: "#6b7280" },
  title: { fontSize: 16, marginTop: 2 },
  meta: { fontSize: 8, color: "#374151", marginTop: 2 },
  warning: { fontSize: 8, color: "#b45309", marginTop: 4 },
  tableTitle: { fontSize: 11, marginTop: 14, marginBottom: 4 },
  table: { borderWidth: 1, borderColor: "#d1d5db" },
  tr: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#e5e7eb" },
  th: { padding: 3, fontSize: 7, color: "#374151", backgroundColor: "#f3f4f6", flexGrow: 1, flexBasis: 0 },
  td: { padding: 3, fontSize: 7.5, flexGrow: 1, flexBasis: 0 },
  footer: { position: "absolute", bottom: 16, left: 28, right: 28, fontSize: 7, color: "#6b7280", flexDirection: "row", justifyContent: "space-between" },
});

function ReportDocument({ data }: { data: ReportPdfData }) {
  return (
    <Document title={data.title} author={data.appName}>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <Text style={styles.app}>{data.appName}</Text>
        <Text style={styles.title}>{data.title}</Text>
        {data.meta.map((m) => (
          <Text key={m} style={styles.meta}>
            {m}
          </Text>
        ))}
        {data.warnings.map((w) => (
          <Text key={w} style={styles.warning}>
            {w}
          </Text>
        ))}
        {data.tables.map((tbl) => (
          <View key={tbl.title}>
            <Text style={styles.tableTitle}>{tbl.title}</Text>
            <View style={styles.table}>
              <View style={styles.tr} fixed>
                {tbl.headers.map((h) => (
                  <Text key={h} style={styles.th}>
                    {h}
                  </Text>
                ))}
              </View>
              {tbl.rows.map((r, ri) => (
                <View key={ri} style={styles.tr} wrap={false}>
                  {r.map((c, ci) => (
                    <Text key={ci} style={styles.td}>
                      {c}
                    </Text>
                  ))}
                </View>
              ))}
            </View>
          </View>
        ))}
        <View style={styles.footer} fixed>
          <Text>{data.footer}</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export async function renderReportPdf(data: ReportPdfData): Promise<Buffer> {
  registerFont();
  return renderToBuffer(<ReportDocument data={data} />);
}
