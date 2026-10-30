import ExcelJS from "exceljs";
import { MATCHING_MAX_PAIRS, MATCHING_MIN_PAIRS, TRUE_FALSE_OPTIONS, type MatchingPair } from "@/lib/questions";
import { matchKey } from "../imports/parse";
import type { QuestionInput } from "./index";

/**
 * Soru Excel'i (karar #64): Soru, Tip, A–E şıkları, Doğru, Konu, Zorluk, İSG kritik, Modül, Açıklama.
 * Eşleştirme (karar #203): Tip "Eşleştirme", A–F hücrelerine "sol = sağ" (3–6 çift), Doğru boş bırakılır.
 * Görselde işaretleme Excel'den aktarılamaz (bölge çizimi gerekir; karar #204).
 * İsteğe bağlı İngilizce sütunlar (karar #207): "Soru (EN)", "A (EN)"–"F (EN)", "Açıklama (EN)". Doluysa şık/çift sayısı
 * Türkçeyle aynı olmalıdır; doğru/yanlışta yalnızca soru metni yazılır. Boşsa soru yalnızca Türkçedir.
 * Modül, aktarımın yapıldığı birimin modül adlarıyla eşleşir (büyük/küçük harf ve Türkçe karakter farkı yok sayılır);
 * birden çok modül ";" ile ayrılır. Veritabanına dokunmaz; birim testlenir.
 */

export const MAX_QUESTION_ROWS = 1000;
export const MAX_QUESTION_BYTES = 2 * 1024 * 1024;

const EN_LETTERS = ["A (EN)", "B (EN)", "C (EN)", "D (EN)", "E (EN)", "F (EN)"] as const;
export const QUESTION_HEADERS = [
  "Soru",
  "Tip",
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "Doğru",
  "Konu",
  "Zorluk",
  "İSG kritik",
  "Modül",
  "Açıklama",
  "Soru (EN)",
  ...EN_LETTERS,
  "Açıklama (EN)",
] as const;
type Header = (typeof QUESTION_HEADERS)[number];

export type QuestionRowError =
  | "stem_missing"
  | "type_invalid"
  | "options_missing"
  | "options_duplicate"
  | "correct_invalid"
  | "pairs_invalid"
  | "translation_invalid"
  | "topic_missing"
  | "difficulty_invalid"
  | "critical_invalid"
  | "module_missing"
  | "module_not_found";

export type ParsedQuestionRow = { rowNumber: number; stem: string; input: QuestionInput | null; errors: QuestionRowError[] };

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "Evet" : "Hayır";
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((r) => r.text).join("");
    if ("text" in value && typeof value.text === "string") return value.text;
    if ("result" in value) return cellText(value.result as ExcelJS.CellValue);
    return "";
  }
  return String(value);
}

const YES = new Set(["evet", "e", "var", "x", "1", "true"]);
const NO = new Set(["hayir", "h", "yok", "", "0", "false"]);
const TF_TRUE = new Set(["dogru", "d", "true"]);
const TF_FALSE = new Set(["yanlis", "y", "false"]);
const DIFFICULTY_WORDS: Record<string, number> = { kolay: 1, orta: 2, zor: 3 };

export { TRUE_FALSE_OPTIONS };

/** Satırları okur ve doğrular. `modulesByKey`: eşleştirme anahtarı → modül kimliği. */
export async function parseQuestionWorkbook(
  buffer: ArrayBuffer | Buffer,
  modulesByKey: Map<string, string>,
): Promise<{ missingColumns: string[]; rows: ParsedQuestionRow[]; tooManyRows: boolean }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const sheet = wb.worksheets.find((ws) => ws.state === "visible") ?? wb.worksheets[0];
  if (!sheet) return { missingColumns: ["Soru"], rows: [], tooManyRows: false };

  const cols = new Map<Header, number>();
  sheet.getRow(1).eachCell((cell, col) => {
    const key = matchKey(cellText(cell.value));
    const h = QUESTION_HEADERS.find((x) => matchKey(x) === key);
    if (h && !cols.has(h)) cols.set(h, col);
  });
  const required: Header[] = ["Soru", "Tip", "A", "B", "Doğru", "Konu", "Zorluk", "Modül"];
  const missingColumns = required.filter((h) => !cols.has(h));
  if (missingColumns.length) return { missingColumns, rows: [], tooManyRows: false };

  const rows: ParsedQuestionRow[] = [];
  let tooManyRows = false;
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const get = (h: Header) => (cols.has(h) ? cellText(row.getCell(cols.get(h)!).value).trim() : "");
    if (QUESTION_HEADERS.every((h) => !get(h))) return;
    if (rows.length >= MAX_QUESTION_ROWS) {
      tooManyRows = true;
      return;
    }
    rows.push(validateRow(rowNumber, get, modulesByKey));
  });
  return { missingColumns: [], rows, tooManyRows };
}

function validateRow(rowNumber: number, get: (h: Header) => string, modulesByKey: Map<string, string>): ParsedQuestionRow {
  const errors: QuestionRowError[] = [];
  const stem = get("Soru");
  if (stem.length < 5) errors.push("stem_missing");

  const typeKey = matchKey(get("Tip"));
  const type =
    typeKey.startsWith("dogru") || typeKey.startsWith("d/y") || typeKey === "dy"
      ? "true_false"
      : typeKey.startsWith("coktan") || typeKey === "cs"
        ? "single_choice"
        : typeKey.startsWith("eslestir")
          ? "matching"
          : null;
  if (!type) errors.push("type_invalid");

  let options: string[] = [];
  let correctIndex = -1;
  let pairs: MatchingPair[] | null = null;
  const correct = matchKey(get("Doğru"));
  if (type === "matching") {
    const cells = (["A", "B", "C", "D", "E", "F"] as const).map((l) => get(l)).filter(Boolean);
    const parsed = cells.map((c) => {
      const i = c.indexOf("=");
      return i < 0 ? null : { left: c.slice(0, i).trim(), right: c.slice(i + 1).trim() };
    });
    const valid = parsed.every((p) => p && p.left && p.right);
    const unique = (xs: string[]) => new Set(xs.map(matchKey)).size === xs.length;
    if (!valid || cells.length < MATCHING_MIN_PAIRS || cells.length > MATCHING_MAX_PAIRS) errors.push("pairs_invalid");
    else if (!unique(parsed.map((p) => p!.left)) || !unique(parsed.map((p) => p!.right))) errors.push("pairs_invalid");
    else pairs = parsed as MatchingPair[];
  } else if (type === "true_false") {
    options = TRUE_FALSE_OPTIONS;
    correctIndex = TF_TRUE.has(correct) ? 0 : TF_FALSE.has(correct) ? 1 : -1;
  } else {
    const letters = ["A", "B", "C", "D", "E"] as const;
    const raw = letters.map((l) => get(l));
    // Şıklar boşluksuz ardışık olmalı (A, B zorunlu)
    const lastFilled = raw.reduce((acc, v, i) => (v ? i : acc), -1);
    options = raw.slice(0, lastFilled + 1);
    if (options.length < 2 || options.some((o) => !o)) errors.push("options_missing");
    else if (new Set(options.map(matchKey)).size !== options.length) errors.push("options_duplicate");
    const idx = letters.findIndex((l) => matchKey(l) === correct);
    correctIndex = idx >= 0 && idx < options.length ? idx : -1;
  }
  if (type && type !== "matching" && correctIndex < 0) errors.push("correct_invalid");

  const en = parseTranslation(type, get, options, pairs);
  if (en === "invalid") errors.push("translation_invalid");

  const topic = get("Konu").replace(/\s+/g, " ");
  if (topic.length < 2) errors.push("topic_missing");
  const difficultyKey = matchKey(get("Zorluk"));
  const difficulty = DIFFICULTY_WORDS[difficultyKey] ?? Number(difficultyKey);
  if (![1, 2, 3].includes(difficulty)) errors.push("difficulty_invalid");
  const criticalKey = matchKey(get("İSG kritik"));
  const isOhsCritical = YES.has(criticalKey);
  if (!isOhsCritical && !NO.has(criticalKey)) errors.push("critical_invalid");

  const moduleNames = get("Modül")
    .split(/[;\n]/)
    .map((m) => m.trim())
    .filter(Boolean);
  const moduleIds = moduleNames.map((m) => modulesByKey.get(matchKey(m)));
  if (moduleNames.length === 0) errors.push("module_missing");
  else if (moduleIds.some((id) => !id)) errors.push("module_not_found");

  return {
    rowNumber,
    stem,
    errors,
    input:
      errors.length === 0
        ? {
            type: type!,
            stem,
            options: type === "matching" ? [] : options,
            correctIndex: type === "matching" ? null : correctIndex,
            pairs,
            regions: null,
            explanation: get("Açıklama") || null,
            topic,
            difficulty,
            isOhsCritical,
            mediaAssetId: null,
            moduleIds: [...new Set(moduleIds as string[])],
            en: en === "invalid" ? null : en,
          }
        : null,
  };
}

/** İngilizce sütunlar: boşsa null, eksik/uyumsuzsa "invalid" (karar #207). */
function parseTranslation(
  type: QuestionInput["type"] | null,
  get: (h: Header) => string,
  options: string[],
  pairs: MatchingPair[] | null,
): QuestionInput["en"] | "invalid" {
  const stem = get("Soru (EN)");
  const cells = EN_LETTERS.map((l) => get(l));
  const explanation = get("Açıklama (EN)") || null;
  if (!stem && cells.every((c) => !c) && !explanation) return null;
  if (stem.length < 5 || !type) return "invalid";
  if (type === "single_choice") {
    const filled = cells.slice(0, options.length);
    if (filled.some((c) => !c) || cells.slice(options.length).some(Boolean)) return "invalid";
    if (new Set(filled.map(matchKey)).size !== filled.length) return "invalid";
    return { stem, options: filled, explanation };
  }
  if (type === "matching") {
    const count = pairs?.length ?? 0;
    const parsed = cells.filter(Boolean).map((c) => {
      const i = c.indexOf("=");
      return i < 0 ? null : { left: c.slice(0, i).trim(), right: c.slice(i + 1).trim() };
    });
    if (parsed.length !== count || parsed.some((p) => !p || !p.left || !p.right)) return "invalid";
    return { stem, pairs: parsed as MatchingPair[], explanation };
  }
  // Doğru/yanlış: şıklar sabit (True/False)
  if (cells.some(Boolean)) return "invalid";
  return { stem, explanation };
}

/** Boş şablon (örnek satırlı). */
export async function buildQuestionTemplate(moduleTitles: string[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "JAPAR Akademi";
  const sheet = wb.addWorksheet("Sorular");
  sheet.addRow([...QUESTION_HEADERS]);
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  [50, 16, 22, 22, 22, 22, 22, 22, 10, 20, 9, 11, 30, 40, 50, 22, 22, 22, 22, 22, 22, 40].forEach((w, i) => (sheet.getColumn(i + 1).width = w));
  sheet.addRow([
    "Presi çalıştırırken eller nerede olmalıdır?",
    "Çoktan seçmeli",
    "İki el kumandasında",
    "Kalıp alanında",
    "Cepte",
    "",
    "",
    "",
    "A",
    "Pres güvenliği",
    1,
    "Evet",
    moduleTitles[0] ?? "",
    "İki el kumandası elleri kalıp alanının dışında tutar.",
    // İsteğe bağlı İngilizce (karar #207)
    "Where should your hands be while operating the press?",
    "On the two-hand control",
    "In the die area",
    "In your pockets",
    "",
    "",
    "",
    "The two-hand control keeps the hands out of the die area.",
  ]);
  sheet.addRow(["Işık perdesi arızalıyken pres çalıştırılabilir.", "Doğru/Yanlış", "", "", "", "", "", "", "Yanlış", "Pres güvenliği", 1, "Evet", moduleTitles[0] ?? "", ""]);
  sheet.addRow(["Uyarı işaretlerini anlamlarıyla eşleştirin.", "Eşleştirme", "Sarı üçgen = Dikkat", "Mavi daire = Zorunluluk", "Kırmızı daire = Yasak", "", "", "", "", "İşaretler", 1, "Hayır", moduleTitles[0] ?? "", ""]);
  for (let r = 2; r <= 1001; r++) {
    sheet.getCell(`B${r}`).dataValidation = { type: "list", allowBlank: true, formulae: ['"Çoktan seçmeli,Doğru/Yanlış,Eşleştirme"'] };
    sheet.getCell(`K${r}`).dataValidation = { type: "list", allowBlank: true, formulae: ['"1,2,3"'] };
    sheet.getCell(`L${r}`).dataValidation = { type: "list", allowBlank: true, formulae: ['"Evet,Hayır"'] };
  }
  const info = wb.addWorksheet("Modüller");
  info.addRow(["Modül adı (Modül sütununa aynen yazın; birden çok modül için ; ile ayırın)"]);
  info.getRow(1).font = { bold: true };
  for (const t of moduleTitles) info.addRow([t]);
  info.getColumn(1).width = 70;
  return Buffer.from(await wb.xlsx.writeBuffer());
}
