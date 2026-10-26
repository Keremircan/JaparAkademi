import path from "node:path";
import { Document, Font, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";

/**
 * Geçici şifre fişleri (FG-1.4): A4 sayfada 8 kesilebilir fiş. Şifreler saklanmaz;
 * PDF yalnızca üretildiği anda bir kez verilir.
 */

let fontRegistered = false;
function registerFont() {
  if (fontRegistered) return;
  Font.register({ family: "Geist", src: path.join(process.cwd(), "src/server/pdf/fonts/Geist-Regular.ttf") });
  Font.registerHyphenationCallback((word) => [word]);
  fontRegistered = true;
}

export type CredentialSlip = { sicilNo: string; fullName: string; positionName: string; tempPassword: string };

export type CredentialLabels = {
  appName: string;
  title: string;
  sicil: string;
  position: string;
  password: string;
  instructions: string;
  issuedAt: string;
};

const styles = StyleSheet.create({
  page: { fontFamily: "Geist", fontSize: 10, padding: 24, flexDirection: "row", flexWrap: "wrap" },
  slip: {
    width: "50%",
    height: "25%",
    padding: 14,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#999999",
  },
  app: { fontSize: 9, color: "#555555" },
  title: { fontSize: 12, marginTop: 2, marginBottom: 8 },
  name: { fontSize: 13, marginBottom: 4 },
  row: { fontSize: 10, marginBottom: 2 },
  passwordLabel: { fontSize: 9, color: "#555555", marginTop: 6 },
  password: { fontSize: 22, letterSpacing: 3, marginTop: 2 },
  note: { fontSize: 8, color: "#555555", marginTop: 6 },
});

function SlipsDocument({ slips, labels }: { slips: CredentialSlip[]; labels: CredentialLabels }) {
  const pages: CredentialSlip[][] = [];
  for (let i = 0; i < slips.length; i += 8) pages.push(slips.slice(i, i + 8));
  return (
    <Document title={labels.title} author={labels.appName}>
      {pages.map((page, pi) => (
        <Page key={pi} size="A4" style={styles.page}>
          {page.map((s) => (
            <View key={s.sicilNo} style={styles.slip} wrap={false}>
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
              <Text style={styles.passwordLabel}>{labels.password}</Text>
              <Text style={styles.password}>{s.tempPassword}</Text>
              <Text style={styles.note}>{labels.instructions}</Text>
              <Text style={styles.note}>{labels.issuedAt}</Text>
            </View>
          ))}
        </Page>
      ))}
    </Document>
  );
}

export async function renderCredentialSlips(slips: CredentialSlip[], labels: CredentialLabels): Promise<Buffer> {
  registerFont();
  return renderToBuffer(<SlipsDocument slips={slips} labels={labels} />);
}
