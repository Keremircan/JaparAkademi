import { describe, expect, it } from "vitest";
import { cleanEraseReason, confirmationMatches, confirmationPhrase } from "@/lib/erasure";
import en from "../../messages/en.json";
import tr from "../../messages/tr.json";

describe("Kişiyi kalıcı silme onayı (karar #265)", () => {
  const phrase = confirmationPhrase(tr.admin.people.erase.phrase, "İsmail Işık");

  it("onay metni kişinin adıyla oluşur; fazla boşluk tek boşluğa iner", () => {
    expect(phrase).toBe("İsmail Işık silmeyi onaylıyorum");
    expect(confirmationPhrase(tr.admin.people.erase.phrase, "  Ali   Veli ")).toBe("Ali Veli silmeyi onaylıyorum");
    expect(confirmationPhrase(en.admin.people.erase.phrase, "Ali Veli")).toBe("I confirm deleting Ali Veli");
  });

  it("büyük/küçük harf, Türkçe i/ı/İ/I farkı ve fazla boşluk önemsizdir", () => {
    for (const typed of [
      "İsmail Işık silmeyi onaylıyorum",
      "ismail ışık silmeyi onaylıyorum",
      "ISMAIL IŞIK SILMEYI ONAYLIYORUM",
      "  ismail   işik silmeyi onayliyorum ",
    ]) {
      expect(confirmationMatches(typed, phrase), typed).toBe(true);
    }
  });

  it("eksik, farklı ad ya da boş metin kabul edilmez; diğer Türkçe harfler aynen yazılmalı", () => {
    for (const typed of ["", "   ", "İsmail Işık", "İsmail Işık silmeyi onaylıyorum.", "Ismail Isik silmeyi onaylıyorum!", "Ali Veli silmeyi onaylıyorum"]) {
      expect(confirmationMatches(typed, phrase), typed).toBe(false);
    }
    const s = confirmationPhrase(tr.admin.people.erase.phrase, "Şükrü Öztürk");
    expect(confirmationMatches("sukru ozturk silmeyi onaylıyorum", s)).toBe(false);
    expect(confirmationMatches("şükrü öztürk silmeyi onaylıyorum", s)).toBe(true);
  });

  it("gerekçe 3–500 karakter; boşluklar kırpılır", () => {
    expect(cleanEraseReason("  KVKK   silme talebi ")).toBe("KVKK silme talebi");
    expect(cleanEraseReason("ab")).toBeNull();
    expect(cleanEraseReason("   ")).toBeNull();
    expect(cleanEraseReason("x".repeat(501))).toBeNull();
    expect(cleanEraseReason("x".repeat(500))).toHaveLength(500);
  });
});
