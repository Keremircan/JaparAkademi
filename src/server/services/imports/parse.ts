import { normalizePhone as normalizePhoneIntl } from "@/server/state/invitations";
import ExcelJS from "exceljs";
import { isValidNationalId, normalizeNationalId } from "@/server/crypto/national-id";

/**
 * Personel Excel'i okuma ve satır doğrulama (FG-1.4). Veritabanına dokunmaz; birim testlenir.
 * Zorunlu sütunlar: Sicil No, Ad Soyad, Departman, Pozisyon, İşe Giriş Tarihi, Yaka Tipi.
 * İsteğe bağlı: TC Kimlik No, Telefon, E-posta.
 */

export const MAX_IMPORT_ROWS = 5000;
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

export type ImportField =
  | "sicilNo"
  | "fullName"
  | "department"
  | "position"
  | "hireDate"
  | "collarType"
  | "nationalId"
  | "phone"
  | "email";

/** Şablondaki başlıklar (sırasıyla). */
export const TEMPLATE_HEADERS: Record<ImportField, string> = {
  sicilNo: "Sicil No",
  fullName: "Ad Soyad",
  department: "Departman",
  position: "Pozisyon",
  hireDate: "İşe Giriş Tarihi",
  collarType: "Yaka Tipi",
  nationalId: "TC Kimlik No",
  phone: "Telefon",
  email: "E-posta",
};

export const REQUIRED_FIELDS: readonly ImportField[] = ["sicilNo", "fullName", "department", "position", "hireDate", "collarType"];

const HEADER_ALIASES: Record<ImportField, string[]> = {
  sicilNo: ["sicil no", "sicil", "sicil numarası", "sicil numarasi", "sicilno"],
  fullName: ["ad soyad", "adı soyadı", "adi soyadi", "ad-soyad", "isim"],
  department: ["departman"],
  position: ["pozisyon", "görev", "gorev", "pozisyon kodu"],
  hireDate: ["işe giriş tarihi", "ise giris tarihi", "işe giriş", "giriş tarihi", "giris tarihi"],
  collarType: ["yaka tipi", "yaka"],
  nationalId: ["tc kimlik no", "tc kimlik", "tc", "t.c. kimlik no", "tckn"],
  phone: ["telefon", "tel", "cep telefonu"],
  email: ["e-posta", "eposta", "email", "e-mail", "mail"],
};

const trLower = (s: string) => s.trim().toLocaleLowerCase("tr-TR").replace(/\s+/g, " ");

const FOLD: Record<string, string> = { ç: "c", ğ: "g", ı: "i", i̇: "i", ö: "o", ş: "s", ü: "u" };
/** Eşleştirme anahtarı: küçük harf, Türkçe karakterler sadeleştirilmiş ("Üretim" = "uretim"). */
export function matchKey(s: string): string {
  return trLower(s)
    .normalize("NFC")
    .replace(/i̇|[çğıöşü]/g, (ch) => FOLD[ch] ?? ch);
}

export type RawRow = { rowNumber: number } & Partial<Record<ImportField, string>> & { hireDateValue?: Date };

export type ParsedWorkbook = { missingColumns: ImportField[]; rows: RawRow[]; tooManyRows: boolean };

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number") return Number.isInteger(value) ? value.toFixed(0) : String(value);
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((r) => r.text).join("");
    if ("text" in value && typeof value.text === "string") return value.text;
    if ("result" in value) return cellText(value.result as ExcelJS.CellValue);
    return "";
  }
  return String(value);
}

/** İlk çalışma sayfasını okur. Başlıklar 1. satırdadır; boş satırlar atlanır. */
export async function parseWorkbook(buffer: ArrayBuffer | Buffer): Promise<ParsedWorkbook> {
  const wb = new ExcelJS.Workbook();
  // exceljs Node Buffer tipini bekler
  await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const sheet = wb.worksheets.find((ws) => ws.state === "visible") ?? wb.worksheets[0];
  if (!sheet) return { missingColumns: [...REQUIRED_FIELDS], rows: [], tooManyRows: false };

  const columns = new Map<ImportField, number>();
  sheet.getRow(1).eachCell((cell, col) => {
    const header = trLower(cellText(cell.value));
    for (const [field, aliases] of Object.entries(HEADER_ALIASES) as [ImportField, string[]][]) {
      if (!columns.has(field) && aliases.includes(header)) columns.set(field, col);
    }
  });
  const missingColumns = REQUIRED_FIELDS.filter((f) => !columns.has(f));
  if (missingColumns.length > 0) return { missingColumns, rows: [], tooManyRows: false };

  const rows: RawRow[] = [];
  let tooManyRows = false;
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const raw: RawRow = { rowNumber };
    let any = false;
    for (const [field, col] of columns) {
      const value = row.getCell(col).value;
      if (field === "hireDate" && value instanceof Date) raw.hireDateValue = value;
      const text = cellText(value).trim();
      if (text) any = true;
      raw[field] = text;
    }
    if (!any) return;
    if (rows.length >= MAX_IMPORT_ROWS) {
      tooManyRows = true;
      return;
    }
    rows.push(raw);
  });
  return { missingColumns: [], rows, tooManyRows };
}

// ---- Satır doğrulama ----

export type OrgLookup = {
  departments: { id: string; name: string; code: string; isActive: boolean }[];
  /** Departman kimliği → o departman ve bölümlerindeki pozisyonlar */
  positionsByDepartment: Map<string, { id: string; name: string; code: string; status: string; collarType: "blue" | "white" }[]>;
  positionsByCode: Map<string, { id: string; departmentId: string; status: string; collarType: "blue" | "white" }>;
};

export type NormalizedRow = {
  sicilNo: string;
  fullName: string;
  positionId: string;
  hireDate: string;
  collarType: "blue" | "white";
  nationalId: string | null;
  phone: string | null;
  email: string | null;
};

export type RowCheck = { rowNumber: number; sicilNo: string | null; data: Partial<NormalizedRow>; errors: string[] };

const SICIL = /^[0-9A-Za-z-]{1,32}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseCollar(value: string): "blue" | "white" | null {
  const v = trLower(value);
  if (["mavi", "mavi yaka", "blue", "blue collar"].includes(v)) return "blue";
  if (["beyaz", "beyaz yaka", "white", "white collar"].includes(v)) return "white";
  return null;
}

/** Tarih: Excel tarih hücresi, "gg.aa.yyyy", "gg/aa/yyyy" veya "yyyy-aa-gg". Sonuç "yyyy-aa-gg". */
export function parseDate(text: string, cellDate?: Date): string | null {
  let y: number, m: number, d: number;
  if (cellDate) {
    y = cellDate.getUTCFullYear();
    m = cellDate.getUTCMonth() + 1;
    d = cellDate.getUTCDate();
  } else {
    const tr = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(text);
    const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text);
    if (tr) [d, m, y] = [Number(tr[1]), Number(tr[2]), Number(tr[3])];
    else if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
    else return null;
  }
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  if (y < 1950 || y > 2100) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Telefon: rakamlar; +90/0 öneki olabilir. 10 haneli yerel numaraya indirgenir. */
/** Telefon `+90…` biçiminde saklanır (karar #188). */
export function normalizePhone(text: string): string | null {
  return normalizePhoneIntl(text);
}

function matchDepartment(lookup: OrgLookup, text: string) {
  const v = matchKey(text);
  return lookup.departments.find((d) => matchKey(d.name) === v || matchKey(d.code) === v);
}

/** Tek satırı doğrular. Dosya içi sicil tekrarı ayrıca (checkRows) işaretlenir. */
export function checkRow(raw: RawRow, lookup: OrgLookup): RowCheck {
  const errors: string[] = [];
  const data: Partial<NormalizedRow> = {};

  const sicil = raw.sicilNo?.trim() ?? "";
  if (!sicil) errors.push("sicil_missing");
  else if (!SICIL.test(sicil)) errors.push("sicil_invalid");
  else data.sicilNo = sicil;

  const name = raw.fullName?.trim().replace(/\s+/g, " ") ?? "";
  if (name.length < 2) errors.push("name_missing");
  else data.fullName = name;

  const collar = raw.collarType ? parseCollar(raw.collarType) : null;
  if (!raw.collarType) errors.push("collar_missing");
  else if (!collar) errors.push("collar_invalid");
  else data.collarType = collar;

  const dept = raw.department ? matchDepartment(lookup, raw.department) : undefined;
  if (!raw.department) errors.push("department_missing");
  else if (!dept) errors.push("department_not_found");
  else if (!dept.isActive) errors.push("department_inactive");

  if (!raw.position) errors.push("position_missing");
  else if (dept) {
    const byCode = lookup.positionsByCode.get(matchKey(raw.position).toUpperCase());
    let position: { id: string; status: string; collarType: "blue" | "white" } | undefined;
    if (byCode && byCode.departmentId === dept.id) position = byCode;
    else {
      const candidates = (lookup.positionsByDepartment.get(dept.id) ?? []).filter(
        (p) => matchKey(p.name) === matchKey(raw.position!),
      );
      if (candidates.length > 1) errors.push("position_ambiguous");
      position = candidates.length === 1 ? candidates[0] : undefined;
    }
    if (!position && !errors.includes("position_ambiguous")) errors.push("position_not_found");
    else if (position && position.status !== "active") errors.push("position_inactive");
    else if (position) {
      data.positionId = position.id;
      // Karar #1: yaka tipi pozisyondan gelir; Excel'deki değer uyuşmazsa satır hatalı
      if (collar && collar !== position.collarType) errors.push("collar_mismatch");
    }
  }

  const hire = raw.hireDate ? parseDate(raw.hireDate, raw.hireDateValue) : null;
  if (!raw.hireDate) errors.push("hire_date_missing");
  else if (!hire) errors.push("hire_date_invalid");
  else data.hireDate = hire;

  if (raw.nationalId) {
    const tc = normalizeNationalId(raw.nationalId);
    if (!isValidNationalId(tc)) errors.push("national_id_invalid");
    else data.nationalId = tc;
  } else data.nationalId = null;

  if (raw.phone) {
    const phone = normalizePhone(raw.phone);
    if (!phone) errors.push("phone_invalid");
    else data.phone = phone;
  } else data.phone = null;

  if (raw.email) {
    const email = raw.email.trim().toLowerCase();
    if (!EMAIL.test(email)) errors.push("email_invalid");
    else data.email = email;
  } else data.email = null;

  return { rowNumber: raw.rowNumber, sicilNo: sicil || null, data, errors };
}

/** Tüm satırları doğrular; dosyada tekrar eden sicil ve TC numaralarını işaretler. */
export function checkRows(rows: RawRow[], lookup: OrgLookup): RowCheck[] {
  const checks = rows.map((r) => checkRow(r, lookup));
  const countBy = (key: (c: RowCheck) => string | null | undefined) => {
    const m = new Map<string, number>();
    for (const c of checks) {
      const k = key(c);
      if (k) m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  };
  const sicilCounts = countBy((c) => c.sicilNo?.toLocaleUpperCase("tr-TR"));
  const tcCounts = countBy((c) => c.data.nationalId);
  for (const c of checks) {
    if (c.sicilNo && (sicilCounts.get(c.sicilNo.toLocaleUpperCase("tr-TR")) ?? 0) > 1) c.errors.push("sicil_duplicate_in_file");
    if (c.data.nationalId && (tcCounts.get(c.data.nationalId) ?? 0) > 1) c.errors.push("national_id_duplicate_in_file");
  }
  return checks;
}
