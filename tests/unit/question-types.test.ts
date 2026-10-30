import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { matchKey } from "@/server/services/imports/parse";
import { parseQuestionWorkbook, QUESTION_HEADERS } from "@/server/services/questions/parse";
import { isAnswerCorrect, isAnswered, pointInRegion } from "@/server/state/exam";

const rect = { shape: "rect" as const, x: 0.1, y: 0.1, w: 0.2, h: 0.2 };
const ellipse = { shape: "ellipse" as const, cx: 0.5, cy: 0.5, rx: 0.2, ry: 0.1 };

describe("yeni soru tipleri: kurallar (iş paketi 2.7a)", () => {
  it("karar #204: nokta bölgede mi (sınır dahil)", () => {
    expect(pointInRegion({ x: 0.2, y: 0.2 }, rect)).toBe(true);
    expect(pointInRegion({ x: 0.3, y: 0.3 }, rect)).toBe(true);
    expect(pointInRegion({ x: 0.31, y: 0.2 }, rect)).toBe(false);
    expect(pointInRegion({ x: 0.7, y: 0.5 }, ellipse)).toBe(true);
    expect(pointInRegion({ x: 0.5, y: 0.61 }, ellipse)).toBe(false);
    expect(pointInRegion({ x: 0.65, y: 0.58 }, ellipse)).toBe(false);
  });

  it("karar #203: eşleştirme yalnızca bütün çiftler doğruysa doğru", () => {
    const q = { type: "matching" as const, correctIndex: null, pairs: [1, 2, 3], regions: null };
    expect(isAnswerCorrect(q, { answerIndex: null, answer: { pairs: [0, 1, 2] } })).toBe(true);
    expect(isAnswerCorrect(q, { answerIndex: null, answer: { pairs: [1, 0, 2] } })).toBe(false);
    expect(isAnswerCorrect(q, { answerIndex: null, answer: { pairs: [0, 1, null] } })).toBe(false);
    expect(isAnswerCorrect(q, { answerIndex: null, answer: null })).toBe(false);
    expect(isAnswered("matching", { answerIndex: null, answer: { pairs: [0, null, 2] } })).toBe(false);
    expect(isAnswered("matching", { answerIndex: null, answer: { pairs: [0, 1, 2] } })).toBe(true);
  });

  it("karar #204: işaretleme herhangi bir doğru bölgedeyse doğru; çoktan seçmeli değişmedi", () => {
    const q = { type: "hotspot" as const, correctIndex: null, pairs: null, regions: [rect, ellipse] };
    expect(isAnswerCorrect(q, { answerIndex: null, answer: { point: { x: 0.15, y: 0.15 } } })).toBe(true);
    expect(isAnswerCorrect(q, { answerIndex: null, answer: { point: { x: 0.6, y: 0.5 } } })).toBe(true);
    expect(isAnswerCorrect(q, { answerIndex: null, answer: { point: { x: 0.9, y: 0.9 } } })).toBe(false);
    expect(isAnswerCorrect(q, { answerIndex: null, answer: null })).toBe(false);
    const c = { type: "single_choice" as const, correctIndex: 2, pairs: null, regions: null };
    expect(isAnswerCorrect(c, { answerIndex: 2, answer: null })).toBe(true);
    expect(isAnswerCorrect(c, { answerIndex: null, answer: null })).toBe(false);
  });
});

async function xlsx(rows: (string | number)[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sorular");
  ws.addRow([...QUESTION_HEADERS]);
  for (const r of rows) ws.addRow(r);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const modules = new Map([[matchKey("İşaret eğitimi"), "m-isaret"]]);
// Soru, Tip, A, B, C, D, E, F, Doğru, Konu, Zorluk, İSG kritik, Modül, Açıklama
const row = (cells: string[]) => ["Uyarı işaretlerini eşleştirin.", "Eşleştirme", ...cells, ...Array(6 - cells.length).fill(""), "", "İşaretler", 1, "Hayır", "İşaret eğitimi", ""];

describe("karar #203: Excel'den eşleştirme sorusu", () => {
  it("A–F hücrelerindeki 'sol = sağ' çiftlerini okur", async () => {
    const { rows } = await parseQuestionWorkbook(await xlsx([row(["Sarı üçgen = Dikkat", "Mavi daire = Zorunluluk", "Kırmızı daire=Yasak", "Yeşil kare = Acil çıkış"])]), modules);
    expect(rows[0]!.errors).toEqual([]);
    expect(rows[0]!.input).toMatchObject({
      type: "matching",
      options: [],
      correctIndex: null,
      pairs: [
        { left: "Sarı üçgen", right: "Dikkat" },
        { left: "Mavi daire", right: "Zorunluluk" },
        { left: "Kırmızı daire", right: "Yasak" },
        { left: "Yeşil kare", right: "Acil çıkış" },
      ],
    });
  });

  it("2 çift, eşittir işareti eksik ya da tekrar eden öğe hatadır", async () => {
    const { rows } = await parseQuestionWorkbook(
      await xlsx([row(["A = 1", "B = 2"]), row(["A = 1", "B 2", "C = 3"]), row(["A = 1", "a = 2", "C = 3"])]),
      modules,
    );
    expect(rows.map((r) => r.errors)).toEqual([["pairs_invalid"], ["pairs_invalid"], ["pairs_invalid"]]);
  });
});
