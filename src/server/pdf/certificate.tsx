import { readFileSync } from "node:fs";
import path from "node:path";
import { Document, Font, Image, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";

/**
 * Sertifika ve eğitim katılım belgesi (FG-7.2). Alanlar: eğitim konusu, süresi, tarihi, eğitimci, onaylayan,
 * geçerlilik, logo, imza yetkilileri ve taranmış imzaları, QR doğrulama bağlantısı, belge numarası.
 * Metinler çağıran tarafta mesaj dosyasından hazırlanır (bu dosyada arayüz metni yoktur).
 */

let logo: Buffer | null = null;
/** Kurum logosu: PDF için temel (progressive olmayan) PNG kopyası. */
function logoImage(): Buffer {
  logo ??= readFileSync(path.join(process.cwd(), "src/server/pdf/assets/japar-logo.png"));
  return logo;
}

let fontRegistered = false;
function registerFont() {
  if (fontRegistered) return;
  Font.register({ family: "Geist", src: path.join(process.cwd(), "src/server/pdf/fonts/Geist-Regular.ttf") });
  Font.registerHyphenationCallback((word) => [word]);
  fontRegistered = true;
}

export type CertificatePdfData = {
  heading: string;
  intro: string;
  fullName: string;
  details: { label: string; value: string }[];
  table: { headers: [string, string, string, string, string]; rows: [string, string, string, string, string][] } | null;
  summary: string[];
  signatories: { name: string; title: string; image: { data: Buffer; format: "png" | "jpg" } | null }[];
  footer: { documentNo: string; verifyLabel: string; verifyUrl: string; qrDataUrl: string };
  appName: string;
};

const styles = StyleSheet.create({
  page: { fontFamily: "Geist", fontSize: 10, padding: 40, color: "#111827" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 2, borderBottomColor: "#111827", paddingBottom: 12 },
  logo: { width: 120, height: 48, objectFit: "contain" },
  app: { fontSize: 9, color: "#4b5563" },
  heading: { fontSize: 22, marginTop: 24, textAlign: "center" },
  intro: { fontSize: 11, marginTop: 12, textAlign: "center", color: "#374151" },
  name: { fontSize: 26, marginTop: 10, textAlign: "center" },
  details: { marginTop: 18, flexDirection: "row", flexWrap: "wrap" },
  detail: { width: "50%", marginBottom: 6 },
  label: { fontSize: 8, color: "#6b7280" },
  value: { fontSize: 11 },
  table: { marginTop: 14, borderWidth: 1, borderColor: "#d1d5db" },
  tr: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#e5e7eb" },
  th: { padding: 4, fontSize: 8, color: "#374151", backgroundColor: "#f3f4f6" },
  td: { padding: 4, fontSize: 9 },
  summary: { marginTop: 10, fontSize: 10 },
  signatures: { marginTop: 24, flexDirection: "row", justifyContent: "space-around" },
  signatory: { width: 150, alignItems: "center" },
  signImage: { width: 120, height: 48, objectFit: "contain" },
  signLine: { width: 140, borderTopWidth: 1, borderTopColor: "#9ca3af", marginTop: 4, paddingTop: 3, alignItems: "center" },
  footer: { position: "absolute", left: 40, right: 40, bottom: 32, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: "#e5e7eb", paddingTop: 8 },
  qr: { width: 72, height: 72 },
  small: { fontSize: 8, color: "#4b5563" },
});

const COLS = ["40%", "12%", "16%", "14%", "18%"];

function CertificateDocument({ data }: { data: CertificatePdfData }) {
  return (
    <Document title={`${data.heading} · ${data.footer.documentNo}`} author={data.appName}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- PDF görseli */}
          <Image style={styles.logo} src={{ data: logoImage(), format: "png" }} />
          <Text style={styles.app}>{data.appName}</Text>
        </View>
        <Text style={styles.heading}>{data.heading}</Text>
        <Text style={styles.intro}>{data.intro}</Text>
        <Text style={styles.name}>{data.fullName}</Text>
        <View style={styles.details}>
          {data.details.map((d) => (
            <View key={d.label} style={styles.detail}>
              <Text style={styles.label}>{d.label}</Text>
              <Text style={styles.value}>{d.value}</Text>
            </View>
          ))}
        </View>
        {data.table && (
          <View style={styles.table}>
            <View style={styles.tr}>
              {data.table.headers.map((h, i) => (
                <Text key={h} style={[styles.th, { width: COLS[i] }]}>
                  {h}
                </Text>
              ))}
            </View>
            {data.table.rows.map((r, ri) => (
              <View key={ri} style={styles.tr} wrap={false}>
                {r.map((c, i) => (
                  <Text key={i} style={[styles.td, { width: COLS[i] }]}>
                    {c}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        )}
        {data.summary.map((s) => (
          <Text key={s} style={styles.summary}>
            {s}
          </Text>
        ))}
        {data.signatories.length > 0 && (
          <View style={styles.signatures} wrap={false}>
            {data.signatories.map((s) => (
              <View key={s.name} style={styles.signatory}>
                {/* eslint-disable-next-line jsx-a11y/alt-text -- PDF görseli */}
                {s.image ? <Image style={styles.signImage} src={s.image} /> : <View style={{ height: 48 }} />}
                <View style={styles.signLine}>
                  <Text style={styles.value}>{s.name}</Text>
                  <Text style={styles.small}>{s.title}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
        <View style={styles.footer} fixed>
          <View>
            <Text style={styles.value}>{data.footer.documentNo}</Text>
            <Text style={styles.small}>{data.footer.verifyLabel}</Text>
            <Text style={styles.small}>{data.footer.verifyUrl}</Text>
          </View>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- PDF görseli */}
          <Image style={styles.qr} src={data.footer.qrDataUrl} />
        </View>
      </Page>
    </Document>
  );
}

export async function renderCertificatePdf(data: CertificatePdfData): Promise<Buffer> {
  registerFont();
  return renderToBuffer(<CertificateDocument data={data} />);
}
