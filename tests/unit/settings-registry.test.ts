import { describe, expect, it } from "vitest";
import { SETTINGS, type SettingKey } from "@/server/services/settings/registry";

describe("Parametre kaydı (SPEC Bölüm 14)", () => {
  it("her varsayılan değer kendi şemasına uyar", () => {
    for (const [key, def] of Object.entries(SETTINGS)) {
      const result = def.schema.safeParse(def.default);
      expect(result.success, key).toBe(true);
    }
  });

  it("sınav varsayılanları kaynak dokümandaki değerlerdir (Bölüm 6)", () => {
    const d = (k: SettingKey) => SETTINGS[k].default;
    expect(d("exam.theory.question_count")).toBe(20);
    expect(d("exam.theory.duration_min")).toBe(30);
    expect(d("exam.theory.pass_score")).toBe(70);
    expect(d("exam.theory.max_attempts")).toBe(3);
    expect(d("exam.theory.cooldown_hours")).toBe(24);
    expect(d("exam.practical.pass_score")).toBe(80);
    expect(d("exam.practical.max_attempts")).toBe(2);
    expect(d("theory.video_watch_ratio")).toBe(0.9);
  });

  it("tehlike sınıfı İSG uzmanı ayarlayana kadar boştur", () => {
    expect(SETTINGS["ohs.hazard_class"].default).toBeNull();
    expect(SETTINGS["ohs.hazard_class"].managedBy).toEqual(["ohs_specialist"]);
  });

  it("şifre en kısa uzunluğu 8'in altına indirilemez", () => {
    expect(SETTINGS["auth.password_min_length"].schema.safeParse(6).success).toBe(false);
  });

  it("geçme notu 0–100 dışına çıkamaz", () => {
    expect(SETTINGS["exam.theory.pass_score"].schema.safeParse(101).success).toBe(false);
  });
});
