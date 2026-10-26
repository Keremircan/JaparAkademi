import ExcelJS from "exceljs";

/** Testler için personel Excel'i üretir. `rows` başlık sırasıyla değerlerdir. */
export async function buildPeopleXlsx(
  rows: (string | number | Date | null)[][],
  headers = ["Sicil No", "Ad Soyad", "Departman", "Pozisyon", "İşe Giriş Tarihi", "Yaka Tipi", "TC Kimlik No", "Telefon", "E-posta"],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Personel");
  ws.addRow(headers);
  for (const r of rows) ws.addRow(r);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
