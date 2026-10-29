import path from "node:path";
import { Document, Font, Image, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";
import QRCode from "qrcode";

/**
 * Hesap etkinleştirme kağıtları (iş paketi 2.6b, karar #185): A4 sayfada 4 kesilebilir kağıt; her birinde QR
 * (etkinleştirme bağlantısı) ve 8 haneli kod. Kodlar saklanmaz; PDF yalnızca üretildiği anda bir kez verilir.
 */

let fontRegistered = false;
function registerFont() {
  if (fontRegistered) return;
  Font.register({ family: "Geist", src: path.join(process.cwd(), "src/server/pdf/fonts/Geist-Regular.ttf") });
  Font.registerHyphenationCallback((word) => [word]);
  fontRegistered = true;
}

export type ActivationSheet = { sicilNo: string; fullName: string; positionName: string; url: string; code: string; expires: string };

export type ActivationLabels = {
  appName: string;
  title: string;
  sicil: string;
  position: string;
  code: string;
  steps: string;
  note: string;
};

const PER_PAGE = 4;

const styles = StyleSheet.create({
  page: { fontFamily: "Geist", fontSize: 10, padding: 24, flexDirection: "row", flexWrap: "wrap" },
  sheet: { width: "50%", height: 396, padding: 14, borderWidth: 1, borderStyle: "dashed", borderColor: "#999999" },
  app: { fontSize: 9, color: "#555555" },
  title: { fontSize: 13, marginTop: 2, marginBottom: 8 },
  name: { fontSize: 14, marginBottom: 4 },
  row: { fontSize: 10, marginBottom: 2 },
  qr: { width: 96, height: 96, marginTop: 6, marginBottom: 4 },
  codeLabel: { fontSize: 9, color: "#555555", marginTop: 4 },
  code: { fontSize: 24, letterSpacing: 3, marginTop: 2 },
  steps: { fontSize: 8.5, marginTop: 8, lineHeight: 1.4 },
  note: { fontSize: 8, color: "#555555", marginTop: 4 },
});

type Rendered = ActivationSheet & { qr: string };

function SheetsDocument({ sheets, labels }: { sheets: Rendered[]; labels: ActivationLabels }) {
  const pages: Rendered[][] = [];
  for (let i = 0; i < sheets.length; i += PER_PAGE) pages.push(sheets.slice(i, i + PER_PAGE));
  return (
    <Document title={labels.title} author={labels.appName}>
      {pages.map((page, pi) => (
        <Page key={pi} size="A4" style={styles.page}>
          {page.map((s) => (
            <View key={s.sicilNo} style={styles.sheet} wrap={false}>
              <Text style={styles.app}>{labels.appName}</Text>
              <Text style={styles.title}>{labels.title}</Text>
              <Text style={styles.name}>{s.fullName}</Text>
              <Text style={styles.row}>
                {labels.sicil}: {s.sicilNo}
              </Text>
              {s.positionName ? (
                <Text style={styles.row}>
                  {labels.position}: {s.positionName}
                </Text>
              ) : null}
              {/* eslint-disable-next-line jsx-a11y/alt-text -- PDF görseli */}
              <Image style={styles.qr} src={s.qr} />
              <Text style={styles.codeLabel}>{labels.code}</Text>
              <Text style={styles.code}>{s.code}</Text>
              <Text style={styles.steps}>{labels.steps}</Text>
              <Text style={styles.note}>{s.expires}</Text>
              <Text style={styles.note}>{labels.note}</Text>
            </View>
          ))}
        </Page>
      ))}
    </Document>
  );
}

export async function renderActivationSheets(sheets: ActivationSheet[], labels: ActivationLabels): Promise<Buffer> {
  registerFont();
  const rendered = await Promise.all(sheets.map(async (s) => ({ ...s, qr: await QRCode.toDataURL(s.url, { margin: 0, width: 240 }) })));
  return renderToBuffer(<SheetsDocument sheets={rendered} labels={labels} />);
}
