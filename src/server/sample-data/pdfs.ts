import { readFile } from "node:fs/promises";
import path from "node:path";
import { createElement as h, type ReactElement, type ReactNode } from "react";

/**
 * Örnek veri PDF'leri (karar #296): İSG/KKD talimatı, ramak kala formu (TR + EN) ve sınıf eğitimi katılım formu.
 * @react-pdf yalnızca ESM olarak yüklenir; bu yüzden dinamik içe aktarılır (yükleyici esbuild ile ESM paketlenir).
 */

type Lang = "tr" | "en";
type Pdf = typeof import("@react-pdf/renderer");

let lib: Pdf | null = null;
async function pdf(): Promise<Pdf> {
  if (lib) return lib;
  lib = await import("@react-pdf/renderer");
  lib.Font.register({ family: "Geist", src: path.join(process.cwd(), "src/server/pdf/fonts/Geist-Regular.ttf") });
  lib.Font.registerHyphenationCallback((w) => [w]);
  return lib;
}

const logo = () => readFile(path.join(process.cwd(), "src/server/pdf/assets/japar-logo.png"));

const COLOR = { ink: "#111827", muted: "#4B5563", line: "#CBD5E1", navy: "#1F3A5F", soft: "#F1F5F9", warn: "#B45309" };

function styles(p: Pdf) {
  return p.StyleSheet.create({
    page: { fontFamily: "Geist", fontSize: 10, color: COLOR.ink, paddingTop: 36, paddingBottom: 48, paddingHorizontal: 42 },
    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 2, borderBottomColor: COLOR.navy, paddingBottom: 8, marginBottom: 14 },
    logo: { width: 90, height: 30, objectFit: "contain" },
    docMeta: { fontSize: 8, color: COLOR.muted, textAlign: "right" },
    title: { fontSize: 18, color: COLOR.navy, marginBottom: 6 },
    subtitle: { fontSize: 9, color: COLOR.muted, marginBottom: 10, lineHeight: 1.4 },
    h2: { fontSize: 12.5, color: COLOR.navy, marginTop: 12, marginBottom: 5 },
    p: { marginBottom: 5, lineHeight: 1.4 },
    li: { flexDirection: "row", marginBottom: 3 },
    bullet: { width: 12 },
    liText: { flex: 1, lineHeight: 1.4 },
    table: { borderWidth: 1, borderColor: COLOR.line, marginTop: 4 },
    tr: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: COLOR.line },
    th: { padding: 4, fontSize: 8.5, color: COLOR.navy, backgroundColor: COLOR.soft, lineHeight: 1.4 },
    td: { padding: 4, fontSize: 8.5, lineHeight: 1.4 },
    note: { marginTop: 10, padding: 8, backgroundColor: COLOR.soft, borderLeftWidth: 3, borderLeftColor: COLOR.navy, fontSize: 9, lineHeight: 1.4 },
    footer: { position: "absolute", bottom: 20, left: 42, right: 42, fontSize: 7.5, color: COLOR.muted, flexDirection: "row", justifyContent: "space-between" },
    field: { borderWidth: 1, borderColor: COLOR.line, padding: 6, marginBottom: 6 },
    fieldLabel: { fontSize: 8, color: COLOR.muted, marginBottom: 2 },
    box: { width: 9, height: 9, borderWidth: 1, borderColor: COLOR.ink, marginRight: 5 },
    sample: { fontSize: 8, color: COLOR.warn },
  });
}

type S = ReturnType<typeof styles>;

function frame(p: Pdf, s: S, logoPng: Buffer, meta: string[], footer: string, body: ReactNode[], title: string): ReactElement {
  return h(
    p.Document,
    { title, author: "JAPAR Akademi" },
    h(
      p.Page,
      { size: "A4", style: s.page },
      h(
        p.View,
        { style: s.header, fixed: true },
        h(p.Image, { style: s.logo, src: { data: logoPng, format: "png" } }),
        h(p.View, null, ...meta.map((m) => h(p.Text, { key: m, style: s.docMeta }, m))),
      ),
      ...body,
      h(
        p.View,
        { style: s.footer, fixed: true },
        h(p.Text, null, footer),
        h(p.Text, { render: ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) => `${pageNumber} / ${totalPages}` }),
      ),
    ),
  );
}

const bullets = (p: Pdf, s: S, items: string[]) =>
  items.map((t, i) => h(p.View, { key: i, style: s.li, wrap: false }, h(p.Text, { style: s.bullet }, "•"), h(p.Text, { style: s.liText }, t)));

function table(p: Pdf, s: S, widths: number[], head: string[], rows: string[][]) {
  const cell = (style: S[keyof S], w: number, t: string, k: number) => h(p.Text, { key: k, style: [style, { width: `${w}%` }] }, t);
  return h(
    p.View,
    { style: s.table },
    h(p.View, { style: s.tr, fixed: true }, ...head.map((t, i) => cell(s.th, widths[i]!, t, i))),
    ...rows.map((r, j) => h(p.View, { key: j, style: s.tr, wrap: false }, ...r.map((t, i) => cell(s.td, widths[i]!, t, i)))),
  );
}

// ---------------------------------------------------------------------------
// Temel İSG ve KKD talimatı
// ---------------------------------------------------------------------------

const ISG = {
  tr: {
    title: "Temel İSG ve KKD Talimatı",
    subtitle: "Duroplast pres hattı çalışanları için",
    meta: ["Doküman no: İSG-T-01 (örnek)", "Yürürlük: kurum onayıyla", "Revizyon: 0"],
    footer: "JAPAR Akademi · Örnek doküman; kurumun İSG uzmanı tarafından gözden geçirilmelidir.",
    sections: [
      {
        h: "1. Amaç ve kapsam",
        p: [
          "Bu talimat, pres hattında çalışanların iş sağlığı ve güvenliği konusundaki temel hak ve yükümlülüklerini ve kullanacakları kişisel koruyucu donanımı (KKD) açıklar. 6331 sayılı İş Sağlığı ve Güvenliği Kanunu, Kişisel Koruyucu Donanımların İşyerlerinde Kullanılması Hakkında Yönetmelik ve Gürültü Yönetmeliği esas alınmıştır.",
        ],
      },
      {
        h: "2. Haklarınız",
        b: [
          "İşinizle ilgili riskler ve alınan önlemler hakkında bilgi almak.",
          "İşe başlarken, iş değişikliğinde ve belirli aralıklarla iş sağlığı ve güvenliği eğitimi almak.",
          "Ciddi ve yakın bir tehlike karşısında durumu bildirip tehlike giderilene kadar çalışmaktan kaçınmak (Kanun md. 13). Bu hakkı kullandığınız için ücretiniz ve diğer haklarınız kısıtlanamaz.",
          "Görüş ve önerilerinizi çalışan temsilcisi aracılığıyla ya da doğrudan iletmek.",
        ],
      },
      {
        h: "3. Yükümlülükleriniz",
        b: [
          "Aldığınız eğitime ve talimatlara uygun çalışmak.",
          "Makineleri, araçları ve güvenlik donanımını doğru kullanmak; koruyucuları çıkarmamak, değiştirmemek ve etkisiz bırakmamak (Kanun md. 19).",
          "Size verilen KKD'yi doğru kullanmak ve korumak.",
          "Ciddi bir tehlike, arıza ya da eksiklik gördüğünüzde vardiya amirinize ve İSG uzmanına hemen bildirmek.",
        ],
      },
      { h: "4. Pres hattında kullanılan KKD", table: true },
      {
        h: "5. KKD'nin kontrolü, bakımı ve değişimi",
        b: [
          "Her vardiya başında donanımınızı gözden geçirin: çatlak gözlük, delik eldiven, nemlenmiş maske ya da aşınmış taban kullanılmaz.",
          "Kulak koruyucuyu temiz elle takın; köpük tıkaçları tek kullanımlıktır.",
          "KKD kişiseldir; başkasıyla paylaşmayın. Hasarlı ya da eksik donanımı vardiya amirinizden yenisiyle değiştirin.",
          "KKD son çaredir: makinedeki koruyucuların ve havalandırmanın yerini tutmaz.",
        ],
      },
      {
        h: "6. Ramak kala ve kaza bildirimi",
        p: [
          "Yaralanma ya da hasar olmadan atlatılan olayları Ramak Kala Olay Bildirim Formu ile bildirin. Her iş kazası, ne kadar küçük görünürse görünsün, vardiya amirine hemen haber verilir; İSG uzmanı olayı inceleyip kalıcı önlemi belirler.",
        ],
      },
    ],
    tableHead: ["Donanım", "Standart", "Ne zaman", "Dikkat"],
    tableRows: [
      ["Göz koruyucu (yan korumalı)", "EN 166", "Pres başında sürekli; kalıp temizliğinde mutlaka", "Çizik ya da çatlak gözlük değiştirilir"],
      ["Isıya dayanıklı eldiven", "EN 407 (+EN 388)", "Sıcak ürün ve kalıpla temas eden işlerde", "Islak eldivenle sıcak yüzey tutulmaz"],
      ["Kulak koruyucu", "EN 352", "80 dB(A) üzerinde verilir, 85 dB(A) üzerinde zorunlu", "Tıkaçlar tek kullanımlık"],
      ["Toz maskesi FFP2", "EN 149", "Toz dökme, doz hazırlama, temizlik", "Nemlenen maske değiştirilir"],
      ["Güvenlik ayakkabısı", "EN ISO 20345", "Üretim alanında sürekli", "Aşınmış taban kayma riski yaratır"],
      ["İş kıyafeti", "-", "Sürekli", "Kollar bilekte kapalı; takı ve kordon yok"],
    ],
    summaryTitle: "Özet: vardiya amirinizle birlikte gözden geçirin",
    summary: [
      "KKD'mi her vardiya başında kontrol ediyorum.",
      "Koruyucuları ve güvenlik donanımını devre dışı bırakmıyorum.",
      "Tehlikeyi, arızayı ve ramak kala olayları hemen bildiriyorum.",
      "Ciddi ve yakın tehlikede çalışmaktan kaçınma hakkımı biliyorum.",
    ],
  },
  en: {
    title: "Basic OHS and PPE Instruction",
    subtitle: "For employees on the thermoset press line",
    meta: ["Document no: OHS-I-01 (sample)", "Effective: on approval", "Revision: 0"],
    footer: "JAPAR Akademi · Sample document; to be reviewed by the company's OHS specialist.",
    sections: [
      {
        h: "1. Purpose and scope",
        p: [
          "This instruction explains the basic occupational health and safety rights and duties of press line employees and the personal protective equipment (PPE) they use. It is based on the Turkish Occupational Health and Safety Law No. 6331, the regulation on the use of PPE at workplaces and the noise regulation.",
        ],
      },
      {
        h: "2. Your rights",
        b: [
          "To be informed about the risks of your work and the measures taken.",
          "To receive health and safety training when you start, when your job changes and at regular intervals.",
          "To report a serious and imminent danger and refrain from working until it is removed (Law Art. 13). Your wages and other rights cannot be restricted for using this right.",
          "To give your views and suggestions through the employee representative or directly.",
        ],
      },
      {
        h: "3. Your duties",
        b: [
          "Work in line with your training and instructions.",
          "Use machines, tools and safety devices correctly; never remove, alter or defeat guards (Law Art. 19).",
          "Use and look after the PPE given to you.",
          "Report any serious danger, fault or deficiency to your shift supervisor and the OHS specialist at once.",
        ],
      },
      { h: "4. PPE used on the press line", table: true },
      {
        h: "5. Checking, maintaining and replacing PPE",
        b: [
          "Check your equipment at the start of every shift: cracked glasses, torn gloves, damp masks or worn soles are not used.",
          "Insert hearing protection with clean hands; foam plugs are single-use.",
          "PPE is personal; do not share it. Replace damaged or missing equipment through your shift supervisor.",
          "PPE is the last resort: it does not replace machine guards or ventilation.",
        ],
      },
      {
        h: "6. Reporting near misses and accidents",
        p: [
          "Report events that ended without injury or damage on the Near-Miss Report Form. Every accident, however small it seems, is reported to the shift supervisor at once; the OHS specialist investigates and decides on the permanent measure.",
        ],
      },
    ],
    tableHead: ["Equipment", "Standard", "When", "Note"],
    tableRows: [
      ["Eye protection (side shields)", "EN 166", "At the press at all times; always for mould cleaning", "Replace scratched or cracked glasses"],
      ["Heat-resistant gloves", "EN 407 (+EN 388)", "Work in contact with hot parts and moulds", "Never hold hot surfaces with wet gloves"],
      ["Hearing protection", "EN 352", "Provided above 80 dB(A), mandatory above 85 dB(A)", "Plugs are single-use"],
      ["FFP2 dust mask", "EN 149", "Pouring powder, dosing, cleaning", "Replace a damp mask"],
      ["Safety shoes", "EN ISO 20345", "At all times in production", "Worn soles cause slips"],
      ["Work clothing", "-", "At all times", "Cuffs closed; no jewellery or cords"],
    ],
    summaryTitle: "Summary: review with your shift supervisor",
    summary: [
      "I check my PPE at the start of every shift.",
      "I never defeat guards or safety devices.",
      "I report hazards, faults and near misses at once.",
      "I know my right to refrain from work in serious and imminent danger.",
    ],
  },
};

export async function isgInstructionPdf(lang: Lang): Promise<Buffer> {
  const p = await pdf();
  const s = styles(p);
  const t = ISG[lang];
  const body: ReactNode[] = [h(p.Text, { key: "t", style: s.title }, t.title), h(p.Text, { key: "st", style: s.subtitle }, t.subtitle)];
  for (const [i, sec] of t.sections.entries()) {
    body.push(h(p.Text, { key: `h${i}`, style: s.h2, minPresenceAhead: 40 }, sec.h));
    if ("p" in sec && sec.p) body.push(...sec.p.map((x, j) => h(p.Text, { key: `p${i}${j}`, style: s.p }, x)));
    if ("b" in sec && sec.b) body.push(h(p.View, { key: `b${i}` }, ...bullets(p, s, sec.b)));
    if ("table" in sec && sec.table) body.push(h(p.View, { key: `tb${i}` }, table(p, s, [26, 16, 30, 28], t.tableHead, t.tableRows)));
  }
  body.push(
    h(p.View, { key: "sum", style: s.note, wrap: false }, h(p.Text, { style: { color: COLOR.navy, marginBottom: 4 } }, t.summaryTitle), ...bullets(p, s, t.summary)),
  );
  return p.renderToBuffer(frame(p, s, await logo(), t.meta, t.footer, body, t.title) as Parameters<Pdf["renderToBuffer"]>[0]);
}

// ---------------------------------------------------------------------------
// Ramak kala olay bildirim formu
// ---------------------------------------------------------------------------

const NEAR = {
  tr: {
    title: "Ramak Kala Olay Bildirim Formu",
    subtitle: "Yaralanma ya da hasar olmadan atlatılan olayları bildirmek için. Adınızı yazmak isteğe bağlıdır.",
    meta: ["Form no: İSG-F-04 (örnek)", "Revizyon: 0"],
    footer: "JAPAR Akademi · Doldurduktan sonra vardiya amirine verin.",
    fields: [
      ["Tarih ve saat", 24],
      ["Yer / makine", 24],
      ["Ne oldu? (Olayı kısaca anlatın)", 90],
      ["Ne olabilirdi?", 0],
      ["Hemen ne yapıldı?", 50],
      ["Bir daha olmaması için öneriniz", 50],
      ["Bildiren (isteğe bağlı)", 24],
    ] as [string, number][],
    outcomes: ["Yaralanma", "Makine ya da kalıp hasarı", "Yangın", "Çevre (dökülme, sızıntı)", "Diğer"],
    review: "İSG uzmanı değerlendirmesi",
    reviewHead: ["Kök neden", "Kalıcı önlem", "Sorumlu", "Termin"],
  },
  en: {
    title: "Near-Miss Report Form",
    subtitle: "For reporting events that ended without injury or damage. Giving your name is optional.",
    meta: ["Form no: OHS-F-04 (sample)", "Revision: 0"],
    footer: "JAPAR Akademi · Hand the completed form to your shift supervisor.",
    fields: [
      ["Date and time", 24],
      ["Location / machine", 24],
      ["What happened? (Describe briefly)", 90],
      ["What could have happened?", 0],
      ["What was done immediately?", 50],
      ["Your suggestion to prevent it", 50],
      ["Reported by (optional)", 24],
    ] as [string, number][],
    outcomes: ["Injury", "Machine or mould damage", "Fire", "Environment (spill, leak)", "Other"],
    review: "OHS specialist review",
    reviewHead: ["Root cause", "Permanent measure", "Owner", "Due date"],
  },
};

export async function nearMissFormPdf(lang: Lang): Promise<Buffer> {
  const p = await pdf();
  const s = styles(p);
  const t = NEAR[lang];
  const body: ReactNode[] = [h(p.Text, { key: "t", style: s.title }, t.title), h(p.Text, { key: "st", style: s.subtitle }, t.subtitle)];
  for (const [i, [label, height]] of t.fields.entries()) {
    if (height === 0) {
      body.push(
        h(
          p.View,
          { key: `f${i}`, style: s.field },
          h(p.Text, { style: s.fieldLabel }, label),
          h(
            p.View,
            { style: { flexDirection: "row", flexWrap: "wrap" } },
            ...t.outcomes.map((o) => h(p.View, { key: o, style: { flexDirection: "row", alignItems: "center", marginRight: 14, marginTop: 3 } }, h(p.View, { style: s.box }), h(p.Text, null, o))),
          ),
        ),
      );
    } else {
      body.push(h(p.View, { key: `f${i}`, style: [s.field, { minHeight: height }] }, h(p.Text, { style: s.fieldLabel }, label)));
    }
  }
  body.push(h(p.Text, { key: "rv", style: s.h2 }, t.review));
  body.push(
    h(
      p.View,
      { key: "rt", style: s.table },
      h(p.View, { style: s.tr }, ...t.reviewHead.map((x, i) => h(p.Text, { key: i, style: [s.th, { width: "25%" }] }, x))),
      h(p.View, { style: [s.tr, { minHeight: 48 }] }, ...t.reviewHead.map((_, i) => h(p.Text, { key: i, style: [s.td, { width: "25%" }] }, ""))),
    ),
  );
  return p.renderToBuffer(frame(p, s, await logo(), t.meta, t.footer, body, t.title) as Parameters<Pdf["renderToBuffer"]>[0]);
}

// ---------------------------------------------------------------------------
// Sınıf eğitimi katılım formu (taranmış form yerine)
// ---------------------------------------------------------------------------

export async function attendanceSheetPdf(input: {
  moduleTitle: string;
  date: string;
  location: string;
  durationMin: number;
  trainer: { name: string; signature: Buffer };
  attendees: { name: string; sicilNo: string; signature: Buffer }[];
}): Promise<Buffer> {
  const p = await pdf();
  const s = styles(p);
  const head = ["No", "Ad soyad", "Sicil no", "İmza"];
  const widths = [8, 40, 20, 32];
  const sig = (png: Buffer) => h(p.Image, { src: { data: png, format: "png" }, style: { width: 90, height: 30, objectFit: "contain" } });
  const rows = input.attendees.map((a, i) =>
    h(
      p.View,
      { key: i, style: [s.tr, { alignItems: "center", minHeight: 38 }] },
      h(p.Text, { style: [s.td, { width: `${widths[0]}%` }] }, String(i + 1)),
      h(p.Text, { style: [s.td, { width: `${widths[1]}%` }] }, a.name),
      h(p.Text, { style: [s.td, { width: `${widths[2]}%` }] }, a.sicilNo),
      h(p.View, { style: [s.td, { width: `${widths[3]}%` }] }, sig(a.signature)),
    ),
  );
  const info = [
    ["Eğitim", input.moduleTitle],
    ["Tarih", input.date],
    ["Yer", input.location],
    ["Süre", `${input.durationMin} dakika`],
    ["Eğitmen", input.trainer.name],
  ];
  const body: ReactNode[] = [
    h(p.Text, { key: "t", style: s.title }, "Sınıf Eğitimi Katılım Formu"),
    h(p.Text, { key: "st", style: s.subtitle }, "İşyerinde yüz yüze verilen eğitimin katılım kaydıdır; imzalı form sisteme taranarak yüklenir."),
    h(
      p.View,
      { key: "info", style: s.table },
      ...info.map(([k, v]) => h(p.View, { key: k, style: s.tr }, h(p.Text, { style: [s.th, { width: "25%" }] }, k), h(p.Text, { style: [s.td, { width: "75%" }] }, v))),
    ),
    h(p.Text, { key: "h", style: s.h2 }, "Katılımcılar"),
    h(p.View, { key: "tbl", style: s.table }, h(p.View, { style: s.tr }, ...head.map((x, i) => h(p.Text, { key: i, style: [s.th, { width: `${widths[i]}%` }] }, x))), ...rows),
    h(
      p.View,
      { key: "tr", style: { marginTop: 18, flexDirection: "row", justifyContent: "flex-end" } },
      h(p.View, { style: { width: 200 } }, h(p.Text, { style: s.fieldLabel }, "Eğitmen imzası"), sig(input.trainer.signature), h(p.Text, null, input.trainer.name)),
    ),
  ];
  return p.renderToBuffer(
    frame(p, s, await logo(), ["Form no: EGT-F-02 (örnek)"], "JAPAR Akademi · Örnek katılım formu", body, "Sınıf Eğitimi Katılım Formu") as Parameters<Pdf["renderToBuffer"]>[0],
  );
}
