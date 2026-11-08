import { describe, expect, it } from "vitest";
import { isSafeReturnPath } from "@/lib/deletion";

describe("iş paketi 3.14: silme sonrası dönüş yolu", () => {
  it("yalnızca uygulama içi yol ve basit sorgu dizesi kabul edilir", () => {
    expect(isSafeReturnPath("/manage/modules")).toBe(true);
    expect(isSafeReturnPath("/admin/people?deleted=1")).toBe(true);
    expect(isSafeReturnPath("//evil.example")).toBe(false);
    expect(isSafeReturnPath("https://evil.example")).toBe(false);
    expect(isSafeReturnPath("/admin/people?next=https://x")).toBe(false);
    expect(isSafeReturnPath("/a b")).toBe(false);
    expect(isSafeReturnPath("")).toBe(false);
    expect(isSafeReturnPath(null)).toBe(false);
  });
});
