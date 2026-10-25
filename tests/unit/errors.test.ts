import { describe, expect, it } from "vitest";
import { isImmutableViolation, pgErrorCode } from "@/server/errors";

describe("Veritabanı hata kodu çözümleme", () => {
  it("Drizzle'ın sardığı hatanın içindeki Postgres kodunu bulur", () => {
    const pg = Object.assign(new Error("db"), { code: "JA001" });
    const wrapped = Object.assign(new Error("Failed query"), { cause: pg });
    expect(pgErrorCode(wrapped)).toBe("JA001");
    expect(isImmutableViolation(wrapped)).toBe(true);
  });

  it("Postgres dışı kodları yok sayar", () => {
    expect(pgErrorCode(Object.assign(new Error("x"), { code: "ECONNREFUSED" }))).toBeUndefined();
    expect(isImmutableViolation(new Error("x"))).toBe(false);
  });
});
