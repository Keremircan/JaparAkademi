import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { matchKey } from "@/server/services/imports/parse";
import { buildQuestionTemplate, parseQuestionWorkbook, QUESTION_HEADERS } from "@/server/services/questions/parse";

const modules = new Map([
  [matchKey("Pres hattı temel eğitimi"), "m-pres"],
  [matchKey("Genel İSG eğitimi"), "m-isg"],
]);

async function xlsx(rows: (string | number)[][], headers: readonly string[] = QUESTION_HEADERS): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sorular");
  ws.addRow([...headers]);
  for (const r of rows) ws.addRow(r);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// Soru, Tip, A, B, C, D, E, Doğru, Konu, Zorluk, İSG kritik, Modül, Açıklama
const ok = ["Pres çalışırken eller nerede olmalı?", "Çoktan seçmeli", "İki el kumandasında", "Kalıpta", "Cepte", "", "", "A", "Güvenlik", 1, "Evet", "Pres hattı temel eğitimi", "Not"];

describe("Excel'den soru aktarma (karar #64)", () => {
  it("geçerli çoktan seçmeli satırı soru girdisine çevirir", async () => {
    const { rows, missingColumns } = await parseQuestionWorkbook(await xlsx([ok]), modules);
    expect(missingColumns).toEqual([]);
    expect(rows[0]).toMatchObject({
      rowNumber: 2,
      errors: [],
      input: { type: "single_choice", options: ["İki el kumandasında", "Kalıpta", "Cepte"], correctIndex: 0, topic: "Güvenlik", difficulty: 1, isOhsCritical: true, moduleIds: ["m-pres"], explanation: "Not" },
    });
  });

  it("Doğru/Yanlış sorusu ve sözel zorluk", async () => {
    const row = ["Işık perdesi arızalıyken pres çalışabilir.", "Doğru/Yanlış", "", "", "", "", "", "yanlış", "Güvenlik", "Orta", "Hayır", "PRES HATTI TEMEL EĞİTİMİ", ""];
    const { rows } = await parseQuestionWorkbook(await xlsx([row]), modules);
    expect(rows[0]!.errors).toEqual([]);
    expect(rows[0]!.input).toMatchObject({ type: "true_false", options: ["Doğru", "Yanlış"], correctIndex: 1, difficulty: 2, isOhsCritical: false });
  });

  it("modül adı büyük/küçük harf ve Türkçe karakterden bağımsız eşleşir; birden çok modül ; ile", async () => {
    const row = [...ok];
    row[11] = "genel isg egitimi; Pres Hatti Temel Egitimi";
    const { rows } = await parseQuestionWorkbook(await xlsx([row]), modules);
    expect(rows[0]!.input?.moduleIds).toEqual(["m-isg", "m-pres"]);
  });

  it("hatalı satırlar satır numarası ve nedenleriyle döner", async () => {
    const bad = ["Kısa", "Eşleştirme", "A1", "", "", "", "", "Z", "", 7, "Belki", "Bilinmeyen modül", ""];
    const dup = [...ok];
    dup[3] = "iki el kumandasında";
    const noOptions = [...ok];
    noOptions[3] = "";
    noOptions[4] = "";
    const wrongLetter = [...ok];
    wrongLetter[7] = "D";
    const { rows } = await parseQuestionWorkbook(await xlsx([bad, dup, noOptions, wrongLetter]), modules);
    expect(rows[0]!.errors).toEqual(expect.arrayContaining(["stem_missing", "type_invalid", "topic_missing", "difficulty_invalid", "critical_invalid", "module_not_found"]));
    expect(rows[0]!.input).toBeNull();
    expect(rows[1]!.errors).toEqual(["options_duplicate"]);
    expect(rows[2]!.errors).toContain("options_missing");
    expect(rows[3]!.errors).toEqual(["correct_invalid"]);
  });

  it("eksik zorunlu sütunlar bildirilir", async () => {
    const { missingColumns } = await parseQuestionWorkbook(await xlsx([], ["Soru", "Tip", "A"]), modules);
    expect(missingColumns).toEqual(["B", "Doğru", "Konu", "Zorluk", "Modül"]);
  });

  it("boş satırlar atlanır", async () => {
    const { rows } = await parseQuestionWorkbook(await xlsx([ok, ["", "", "", "", "", "", "", "", "", "", "", "", ""], ok]), modules);
    expect(rows.map((r) => r.rowNumber)).toEqual([2, 4]);
  });

  it("şablon kendi örnek satırlarıyla geçerli okunur", async () => {
    const template = await buildQuestionTemplate(["Pres hattı temel eğitimi"]);
    const { rows } = await parseQuestionWorkbook(template, modules);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.errors.length === 0)).toBe(true);
  });
});
