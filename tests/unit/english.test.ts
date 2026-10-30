import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import tr from "../../messages/tr.json";
import { questionTexts } from "@/lib/questions";
import { toAppLocale } from "@/lib/locale";
import { matchKey } from "@/server/services/imports/parse";
import { parseQuestionWorkbook, QUESTION_HEADERS } from "@/server/services/questions/parse";

type Tree = { [k: string]: string | Tree };

const get = (tree: Tree, path: string): string | Tree | undefined =>
  path.split(".").reduce<string | Tree | undefined>((o, k) => (o && typeof o === "object" ? o[k] : undefined), tree);

function leaves(tree: string | Tree, prefix: string): [string, string][] {
  if (typeof tree === "string") return [[prefix, tree]];
  return Object.entries(tree).flatMap(([k, v]) => leaves(v, `${prefix}.${k}`));
}

/** İngilizce olması gereken personel ekranları (karar #207); yönetim ekranları Türkçe kalır. */
const PERSONNEL_SCOPE = [
  "app",
  "common",
  "nav",
  "auth",
  "home",
  "sections",
  "profile",
  "roles",
  "notFound",
  "offline",
  "pwa",
  "consent",
  "learn",
  "assignments.heading",
  "assignments.none",
  "assignments.status",
  "assignments.reason",
  "assignments.progress",
  "assignments.target",
  "assignments.trainer",
  "exams.title",
  "exams.start",
  "exams.runner",
  "exams.result",
  "practice.levels",
  "practice.mine",
  "practice.list",
  "practice.result",
  "practice.exam",
  "practice.signature",
  "practice.photos",
  "certificates.list",
  "notifications",
  "push",
  "visitorFlow",
];
// Kart bölümlerinin ve modül türlerinin yalnızca başlıkları kursiyere görünür
const PERSONNEL_TITLES = ["cards.sections", "modules.kinds"];

/** Eşleşen kapanış parantezinin indeksi. */
function closing(s: string, open: number): number {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === "{") depth++;
    else if (s[i] === "}" && --depth === 0) return i;
  }
  return s.length;
}

/** ICU argüman adları (`{name}`, `{count, plural, one {…} other {…}}`); seçim kollarının içi de taranır. */
function args(s: string, out = new Set<string>()): Set<string> {
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== "{") continue;
    const end = closing(s, i);
    const [name = "", type = "", ...rest] = s.slice(i + 1, end).split(",");
    out.add(name.trim());
    if (["select", "plural", "selectordinal"].includes(type.trim())) {
      const branches = rest.join(",");
      for (let j = 0; j < branches.length; j++) {
        if (branches[j] !== "{") continue;
        const k = closing(branches, j);
        args(branches.slice(j + 1, k), out);
        j = k;
      }
    }
    i = end;
  }
  return out;
}

describe("İngilizce arayüz (iş paketi 2.7b, karar #207)", () => {
  it("FG-8.2 personel ekranlarının bütün metinlerinin İngilizcesi vardır ve aynı değişkenleri kullanır", () => {
    const missing: string[] = [];
    const mismatched: string[] = [];
    const paths = [
      ...PERSONNEL_SCOPE.flatMap((s) => leaves(get(tr as Tree, s)!, s)),
      ...PERSONNEL_TITLES.flatMap((s) => leaves(get(tr as Tree, s)!, s).filter(([k]) => /\.(title|label)$/.test(k))),
    ];
    for (const [path, trText] of paths) {
      const enText = get(en as Tree, path);
      if (typeof enText !== "string") missing.push(path);
      else if ([...args(trText)].sort().join() !== [...args(enText)].sort().join()) mismatched.push(path);
    }
    expect(missing).toEqual([]);
    expect(mismatched).toEqual([]);
  });

  it("bilinmeyen dil tercihi Türkçeye düşer", () => {
    expect(toAppLocale("en")).toBe("en");
    expect(toAppLocale("de")).toBe("tr");
    expect(toAppLocale(undefined)).toBe("tr");
  });

  it("sınav sorusu kursiyerin dilinde; İngilizcesi yoksa Türkçe, doğru/yanlışta True/False", () => {
    const choice = {
      type: "single_choice" as const,
      stem: "Eller nerede olmalı?",
      options: ["Kumandada", "Kalıpta"],
      pairs: null,
      translations: { en: { stem: "Where should the hands be?", options: ["On the control", "In the die"] } },
    };
    expect(questionTexts(choice, "en")).toEqual({ locale: "en", stem: "Where should the hands be?", options: ["On the control", "In the die"], pairs: null });
    expect(questionTexts(choice, "tr")).toMatchObject({ locale: "tr", stem: "Eller nerede olmalı?" });
    expect(questionTexts({ ...choice, translations: null }, "en")).toMatchObject({ locale: "tr", options: ["Kumandada", "Kalıpta"] });
    const tf = { type: "true_false" as const, stem: "Pres arızalıyken çalışır.", options: ["Doğru", "Yanlış"], pairs: null, translations: { en: { stem: "The press runs when faulty." } } };
    expect(questionTexts(tf, "en").options).toEqual(["True", "False"]);
    // Şık sayısı uyuşmayan (bozuk) çeviri şıkları değiştirmez; doğru cevabın sırası korunur
    expect(questionTexts({ ...choice, translations: { en: { stem: "Where?", options: ["Only one"] } } }, "en").options).toEqual(["Kumandada", "Kalıpta"]);
  });

  it("Excel'de isteğe bağlı İngilizce sütunlar okunur; uyumsuz çeviri satır hatasıdır", async () => {
    const modules = new Map([[matchKey("Pres eğitimi"), "m-pres"]]);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Sorular");
    ws.addRow([...QUESTION_HEADERS]);
    const base = ["Pres çalışırken eller nerede olmalı?", "Çoktan seçmeli", "Kumandada", "Kalıpta", "", "", "", "", "A", "Güvenlik", 1, "Hayır", "Pres eğitimi", ""];
    ws.addRow([...base, "Where should the hands be?", "On the control", "In the die", "", "", "", "", "Explained"]);
    ws.addRow([...base, "Where should the hands be?", "On the control", "", "", "", "", "", ""]);
    ws.addRow(base);
    const matching = ["İşaretleri eşleştirin.", "Eşleştirme", "Sarı = Dikkat", "Mavi = Zorunlu", "Kırmızı = Yasak", "", "", "", "", "İşaret", 1, "Hayır", "Pres eğitimi", ""];
    ws.addRow([...matching, "Match the signs.", "Yellow = Caution", "Blue = Mandatory", "Red = Prohibited", "", "", "", ""]);
    const { rows } = await parseQuestionWorkbook(Buffer.from(await wb.xlsx.writeBuffer()), modules);
    expect(rows[0]!.input?.en).toEqual({ stem: "Where should the hands be?", options: ["On the control", "In the die"], explanation: "Explained" });
    expect(rows[1]!.errors).toEqual(["translation_invalid"]);
    expect(rows[2]!.input?.en).toBeNull();
    expect(rows[3]!.input).toMatchObject({ type: "matching", en: { stem: "Match the signs.", pairs: [{ left: "Yellow", right: "Caution" }, { left: "Blue", right: "Mandatory" }, { left: "Red", right: "Prohibited" }] } });
  });
});
