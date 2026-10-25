import { describe, expect, it } from "vitest";
import { ForbiddenError, ValidationError } from "@/server/errors";
import { getSetting, getSettings, setSetting } from "@/server/services/settings";
import { owner } from "../support/db";
import { createTestUser } from "../support/factories";

describe("Parametreler (SPEC Bölüm 14)", () => {
  it("kayıt yoksa varsayılan değer döner", async () => {
    expect(await getSetting("exam.theory.pass_score")).toBe(70);
    expect(await getSetting("ohs.hazard_class")).toBeNull();
  });

  it("sistem yöneticisi genel parametreyi değiştirir ve değer okunur", async () => {
    const { actor } = await createTestUser({ roles: ["sysadmin"] });
    await setSetting(actor, "exam.theory.pass_score", 75);
    await setSetting(actor, "exam.theory.pass_score", 80);
    expect(await getSetting("exam.theory.pass_score")).toBe(80);
  });

  it("İSG parametresini yalnızca İSG uzmanı değiştirir", async () => {
    const admin = await createTestUser({ roles: ["sysadmin"] });
    const ohs = await createTestUser({ roles: ["ohs_specialist"] });
    await expect(setSetting(admin.actor, "ohs.hazard_class", "high")).rejects.toBeInstanceOf(ForbiddenError);
    await setSetting(ohs.actor, "ohs.hazard_class", "high");
    expect(await getSetting("ohs.hazard_class")).toBe("high");
  });

  it("İSG uzmanı genel parametreleri değiştiremez", async () => {
    const ohs = await createTestUser({ roles: ["ohs_specialist"] });
    await expect(setSetting(ohs.actor, "exam.theory.pass_score", 60)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("yetkisi olmayan roller parametre değiştiremez", async () => {
    for (const roles of [[], ["hr"], ["section_manager"], ["trainer"]] as const) {
      const u = await createTestUser({ roles: [...roles] });
      await expect(setSetting(u.actor, "session.shared_idle_min", 5)).rejects.toBeInstanceOf(ForbiddenError);
    }
  });

  it("şemaya uymayan değer reddedilir", async () => {
    const { actor } = await createTestUser({ roles: ["sysadmin"] });
    await expect(setSetting(actor, "exam.theory.pass_score", 150)).rejects.toBeInstanceOf(ValidationError);
  });

  it("veritabanındaki bozuk değer uygulamayı durdurmaz, varsayılana döner", async () => {
    await owner()`insert into settings (key, value) values ('exam.theory.duration_min', '"otuz"'::jsonb)`;
    expect(await getSetting("exam.theory.duration_min")).toBe(30);
  });

  it("birden fazla parametre tek sorguda okunur", async () => {
    const values = await getSettings(["auth.lockout_attempts", "auth.lockout_min"]);
    expect(values).toEqual({ "auth.lockout_attempts": 5, "auth.lockout_min": 15 });
  });
});
