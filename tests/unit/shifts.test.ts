import { describe, expect, it } from "vitest";
import { DEFAULT_SHIFT_TYPES, formatShifts, MAX_SHIFT_TYPES, normalizeShift, orderShifts, SHIFT_PATTERN, shiftLabel } from "@/lib/shifts";
import { SETTINGS } from "@/server/services/settings/registry";

describe("Karar #291 vardiya türleri", () => {
  it("karar #291: varsayılan liste JAPAR'ın dört vardiyasıdır ve saklama biçimine uyar", () => {
    expect(DEFAULT_SHIFT_TYPES).toEqual(["23:00-07:00", "07:00-15:00", "15:00-23:00", "08:00-18:00"]);
    for (const s of DEFAULT_SHIFT_TYPES) expect(SHIFT_PATTERN.test(s), s).toBe(true);
    expect(SETTINGS["org.shift_types"].default).toEqual(DEFAULT_SHIFT_TYPES);
    expect(SETTINGS["org.shift_types"].managedBy).toEqual(["hr", "sysadmin"]);
  });

  it("karar #291: farklı yazımlar SS:DD-SS:DD biçimine çevrilir, geçersiz saatler reddedilir", () => {
    expect(normalizeShift("8.00 - 18.00")).toBe("08:00-18:00");
    expect(normalizeShift(" 23:00–07:00 ")).toBe("23:00-07:00");
    expect(normalizeShift("7:00 — 15:00")).toBe("07:00-15:00");
    for (const bad of ["24:00-07:00", "07:60-08:00", "07:00-07:00", "gece", "0700-1500", "07:00", ""]) {
      expect(normalizeShift(bad), bad).toBeNull();
    }
  });

  it("karar #291: ekranda ve künyede okunur gösterim", () => {
    expect(shiftLabel("23:00-07:00")).toBe("23:00 – 07:00");
    expect(formatShifts([])).toBeNull();
    expect(formatShifts(["23:00-07:00", "07:00-15:00"])).toBe("23:00 – 07:00, 07:00 – 15:00");
  });

  it("karar #291: tekrarlar atılır, liste sırası korunur, listede olmayanlar sona gelir", () => {
    const list = ["23:00-07:00", "07:00-15:00", "15:00-23:00"];
    expect(orderShifts(["15:00-23:00", "06:00-14:00", "23:00-07:00", "15:00-23:00"], list)).toEqual(["23:00-07:00", "15:00-23:00", "06:00-14:00"]);
  });

  it("karar #291: parametre yazımı düzeltir; tekrar, geçersiz saat ve sınır aşımı reddedilir", () => {
    const schema = SETTINGS["org.shift_types"].schema;
    expect(schema.parse(["8.00 - 18.00", "23:00-07:00"])).toEqual(["08:00-18:00", "23:00-07:00"]);
    expect(schema.safeParse(["08:00-18:00", "8:00-18:00"]).success).toBe(false);
    expect(schema.safeParse(["gündüz"]).success).toBe(false);
    expect(schema.safeParse([]).success).toBe(true);
    const many = Array.from({ length: MAX_SHIFT_TYPES + 1 }, (_, i) => `${String(i).padStart(2, "0")}:00-${String(i).padStart(2, "0")}:30`);
    expect(schema.safeParse(many).success).toBe(false);
  });
});
