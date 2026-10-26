import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import tr from "../../messages/tr.json";

type Tree = { [k: string]: string | Tree };

function keys(tree: Tree, prefix = ""): string[] {
  return Object.entries(tree).flatMap(([k, v]) => (typeof v === "string" ? [`${prefix}${k}`] : keys(v, `${prefix}${k}.`)));
}

describe("Arayüz metinleri", () => {
  it("İngilizce dosyadaki her anahtar Türkçede de vardır (eksikler Türkçeye düşer, fazlası yasak)", () => {
    const trKeys = new Set(keys(tr as Tree));
    expect(keys(en as Tree).filter((k) => !trKeys.has(k))).toEqual([]);
  });

  it("Excel satır hata kodlarının hepsinin Türkçe metni vardır", () => {
    const codes = [
      "sicil_missing", "sicil_invalid", "sicil_duplicate_in_file", "name_missing", "department_missing",
      "department_not_found", "department_inactive", "position_missing", "position_not_found", "position_ambiguous",
      "position_inactive", "hire_date_missing", "hire_date_invalid", "collar_missing", "collar_invalid",
      "collar_mismatch", "national_id_invalid", "national_id_duplicate_in_file", "national_id_taken",
      "phone_invalid", "email_invalid",
    ];
    const rowErrors = (tr as Tree & { admin: { people: { import: { rowErrors: Record<string, string> } } } }).admin.people.import.rowErrors;
    expect(codes.filter((c) => !rowErrors[c])).toEqual([]);
  });
});
