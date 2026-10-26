import { describe, expect, it } from "vitest";
import { systemActor, type UserActor } from "@/server/authz/actor";
import { assertCan, assertNotSelf, can, PERMISSIONS } from "@/server/authz/policy";
import { ROLES, type Role } from "@/server/authz/roles";
import { ForbiddenError } from "@/server/errors";

const user = (...roles: Role[]): UserActor => ({ kind: "user", userId: "u1", roles: ["personnel", ...roles] });

describe("Yetki politikası (SPEC 2.3)", () => {
  it("her yetki yalnızca tanımlı rolleri içerir", () => {
    for (const roles of Object.values(PERMISSIONS)) {
      for (const role of roles) expect(ROLES).toContain(role);
    }
  });

  it("temel personel hiçbir yönetim yetkisine sahip değildir", () => {
    for (const permission of Object.keys(PERMISSIONS) as (keyof typeof PERMISSIONS)[]) {
      expect(can(user(), permission)).toBe(false);
    }
  });

  it("İK soru bankasını görür ama düzenleyemez", () => {
    expect(can(user("hr"), "questions.view")).toBe(true);
    expect(can(user("hr"), "questions.edit")).toBe(false);
  });

  it("pratik eğitmen soru bankasını göremez", () => {
    expect(can(user("trainer"), "questions.view")).toBe(false);
    expect(can(user("trainer"), "questions.edit")).toBe(false);
  });

  it("İSG onayını yalnızca İSG uzmanı verir", () => {
    expect(can(user("ohs_specialist"), "content.approve_ohs")).toBe(true);
    expect(can(user("section_manager", "hr", "sysadmin"), "content.approve_ohs")).toBe(false);
  });

  it("işe başlama onayını yalnızca bölüm sorumlusu verir", () => {
    expect(can(user("section_manager"), "readiness.decide")).toBe(true);
    expect(can(user("hr"), "readiness.decide")).toBe(false);
    expect(can(user("trainer"), "readiness.decide")).toBe(false);
  });

  it("TC kimlik numarasının tamamını yalnızca İK görür", () => {
    expect(can(user("hr"), "people.view_national_id")).toBe(true);
    expect(can(user("sysadmin"), "people.view_national_id")).toBe(false);
  });

  it("çoklu rolde yetkiler birleşir", () => {
    const multi = user("trainer", "section_manager");
    expect(can(multi, "practice.mark")).toBe(true);
    expect(can(multi, "readiness.decide")).toBe(true);
  });

  it("sistem aktörü (seed, worker) tüm yetkilere sahiptir", () => {
    expect(can(systemActor("seed"), "roles.manage")).toBe(true);
  });

  it("assertCan yetkisizlikte ForbiddenError fırlatır", () => {
    expect(() => assertCan(user(), "org.manage")).toThrow(ForbiddenError);
    expect(() => assertCan(user("hr"), "org.manage")).not.toThrow();
  });

  it("kimse kendi kaydını değerlendiremez veya onaylayamaz (SPEC 2.4)", () => {
    expect(() => assertNotSelf(user("section_manager"), "u1")).toThrow(ForbiddenError);
    expect(() => assertNotSelf(user("section_manager"), "u2")).not.toThrow();
  });
});
