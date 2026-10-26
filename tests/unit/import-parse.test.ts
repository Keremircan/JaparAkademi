import { describe, expect, it } from "vitest";
import { checkRows, normalizePhone, type OrgLookup, parseDate, parseWorkbook } from "@/server/services/imports/parse";
import { buildPeopleXlsx } from "../support/xlsx";

const lookup: OrgLookup = {
  departments: [
    { id: "d-uretim", name: "Üretim", code: "URETIM", isActive: true },
    { id: "d-eski", name: "Eski Departman", code: "ESKI", isActive: false },
  ],
  positionsByDepartment: new Map([
    [
      "d-uretim",
      [
        { id: "p-pres", name: "Pres Operatörü", code: "PRES-OP", status: "active", collarType: "blue" as const },
        { id: "p-sef1", name: "Vardiya Şefi", code: "SEF-PRES", status: "active", collarType: "blue" as const },
        { id: "p-sef2", name: "Vardiya Şefi", code: "SEF-MONTAJ", status: "active", collarType: "blue" as const },
        { id: "p-mudur", name: "Üretim Müdürü", code: "URETIM-MUDUR", status: "active", collarType: "white" as const },
        { id: "p-pasif", name: "Eski Pozisyon", code: "ESKI-POZ", status: "passive", collarType: "blue" as const },
      ],
    ],
  ]),
  positionsByCode: new Map([
    ["PRES-OP", { id: "p-pres", departmentId: "d-uretim", status: "active", collarType: "blue" as const }],
    ["SEF-PRES", { id: "p-sef1", departmentId: "d-uretim", status: "active", collarType: "blue" as const }],
    ["SEF-MONTAJ", { id: "p-sef2", departmentId: "d-uretim", status: "active", collarType: "blue" as const }],
  ]),
};

const ok = ["1001", "Ayşe Yılmaz", "Üretim", "Pres Operatörü", "05.01.2026", "Mavi", "10000000146", "0532 111 22 33", "ayse@japar.com.tr"];

async function check(rows: (string | number | Date | null)[][], headers?: string[]) {
  const parsed = await parseWorkbook(await buildPeopleXlsx(rows, headers));
  return { parsed, checks: checkRows(parsed.rows, lookup) };
}

describe("FG-1.4 Excel okuma", () => {
  it("başlık takma adlarını ve sütun sırasını tanır", async () => {
    const parsed = await parseWorkbook(
      await buildPeopleXlsx([["Pres Operatörü", "1001", "Ayşe", "Üretim", "05.01.2026", "Mavi"]], [
        "Görev",
        "Sicil",
        "Adı Soyadı",
        "Departman",
        "İşe Giriş",
        "Yaka",
      ]),
    );
    expect(parsed.missingColumns).toEqual([]);
    expect(parsed.rows[0]).toMatchObject({ sicilNo: "1001", position: "Pres Operatörü", fullName: "Ayşe" });
  });

  it("zorunlu sütun eksikse listeler", async () => {
    const parsed = await parseWorkbook(await buildPeopleXlsx([["1001"]], ["Sicil No", "Ad Soyad"]));
    expect(parsed.missingColumns).toEqual(["department", "position", "hireDate", "collarType"]);
  });

  it("boş satırları atlar, sayısal sicil ve TC'yi metne çevirir, Excel tarih hücresini okur", async () => {
    const { parsed, checks } = await check([
      [1001, "Ayşe Yılmaz", "Üretim", "Pres Operatörü", new Date(Date.UTC(2026, 0, 5)), "Mavi", 10000000146, null, null],
      [null, null, null, null, null, null, null, null, null],
    ]);
    expect(parsed.rows).toHaveLength(1);
    expect(checks[0]!.errors).toEqual([]);
    expect(checks[0]!.data).toMatchObject({ sicilNo: "1001", hireDate: "2026-01-05", nationalId: "10000000146" });
  });
});

describe("FG-1.4 satır doğrulama", () => {
  it("geçerli satırı normalleştirir", async () => {
    const { checks } = await check([ok]);
    expect(checks[0]!.errors).toEqual([]);
    expect(checks[0]!.data).toEqual({
      sicilNo: "1001",
      fullName: "Ayşe Yılmaz",
      collarType: "blue",
      positionId: "p-pres",
      hireDate: "2026-01-05",
      nationalId: "10000000146",
      phone: "5321112233",
      email: "ayse@japar.com.tr",
    });
  });

  it("departman ve pozisyonu büyük/küçük harften bağımsız, kodla da eşleştirir", async () => {
    const { checks } = await check([["1001", "Ayşe", "uretim", "pres-op", "05.01.2026", "mavi yaka"]]);
    expect(checks[0]!.errors).toEqual([]);
    expect(checks[0]!.data.positionId).toBe("p-pres");
  });

  it("bilinmeyen/pasif departman ve pozisyon satırı hatalıdır; otomatik oluşturulmaz", async () => {
    const { checks } = await check([
      ["1", "A Kişi", "Lojistik", "Forkliftçi", "05.01.2026", "Mavi"],
      ["2", "B Kişi", "Eski Departman", "X", "05.01.2026", "Mavi"],
      ["3", "C Kişi", "Üretim", "Forkliftçi", "05.01.2026", "Mavi"],
      ["4", "D Kişi", "Üretim", "Eski Pozisyon", "05.01.2026", "Mavi"],
    ]);
    expect(checks[0]!.errors).toContain("department_not_found");
    expect(checks[1]!.errors).toContain("department_inactive");
    expect(checks[2]!.errors).toContain("position_not_found");
    expect(checks[3]!.errors).toContain("position_inactive");
  });

  it("aynı adda iki pozisyon varsa kod ister", async () => {
    const { checks } = await check([
      ["1", "A Kişi", "Üretim", "Vardiya Şefi", "05.01.2026", "Mavi"],
      ["2", "B Kişi", "Üretim", "SEF-MONTAJ", "05.01.2026", "Mavi"],
    ]);
    expect(checks[0]!.errors).toEqual(["position_ambiguous"]);
    expect(checks[1]!.errors).toEqual([]);
  });

  it("karar #1: yaka tipi pozisyonunkiyle uyuşmazsa satır hatalıdır", async () => {
    const { checks } = await check([["1", "A Kişi", "Üretim", "Üretim Müdürü", "05.01.2026", "Mavi"]]);
    expect(checks[0]!.errors).toEqual(["collar_mismatch"]);
  });

  it("dosyada tekrar eden sicil ve TC numaralarını işaretler", async () => {
    const { checks } = await check([ok, [...ok.slice(0, 1), "Başka Kişi", ...ok.slice(2)]]);
    expect(checks[0]!.errors).toEqual(expect.arrayContaining(["sicil_duplicate_in_file", "national_id_duplicate_in_file"]));
  });

  it("geçersiz alanları ayrı ayrı bildirir", async () => {
    const { checks } = await check([["1 0", "", "Üretim", "Pres Operatörü", "31.02.2026", "Kırmızı", "12345678901", "123", "posta"]]);
    expect(checks[0]!.errors).toEqual(
      expect.arrayContaining([
        "sicil_invalid",
        "name_missing",
        "collar_invalid",
        "hire_date_invalid",
        "national_id_invalid",
        "phone_invalid",
        "email_invalid",
      ]),
    );
  });
});

describe("Yardımcılar", () => {
  it("tarih biçimleri", () => {
    expect(parseDate("5.1.2026")).toBe("2026-01-05");
    expect(parseDate("2026-01-05")).toBe("2026-01-05");
    expect(parseDate("05/01/2026")).toBe("2026-01-05");
    expect(parseDate("29.02.2026")).toBeNull();
    expect(parseDate("dün")).toBeNull();
  });

  it("telefon biçimleri 10 haneye iner", () => {
    expect(normalizePhone("+90 532 111 22 33")).toBe("5321112233");
    expect(normalizePhone("0532 111 22 33")).toBe("5321112233");
    expect(normalizePhone("5321112233")).toBe("5321112233");
    expect(normalizePhone("12345")).toBeNull();
  });
});
