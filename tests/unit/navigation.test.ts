import { describe, expect, it } from "vitest";
import { bottomTabs, canSeeNav, MAX_BOTTOM_TABS, NAV_KEYS, visibleNav } from "@/features/app-shell/navigation";
import { effectiveRoles } from "@/server/authz/roles";

describe("Rol bazlı menü", () => {
  it("temel personel yalnızca ana sayfa, eğitimlerim, programım ve profili görür (karar #256)", () => {
    expect(visibleNav(["personnel"]).map((i) => i.key)).toEqual(["home", "learn", "schedule", "profile"]);
  });

  it("güvenlik görevlisi güvenlik bölümünü görür, yönetim bölümünü görmez", () => {
    expect(canSeeNav("security", ["personnel", "security"])).toBe(true);
    expect(canSeeNav("manage", ["personnel", "security"])).toBe(false);
  });

  it("İK hem yönetim hem sistem bölümünü görür", () => {
    expect(canSeeNav("manage", ["personnel", "hr"])).toBe(true);
    expect(canSeeNav("admin", ["personnel", "hr"])).toBe(true);
  });

  it("FG-3.7 karar #192: üst yönetici (oturumdaki geçerli rollerle) bütün menü bölümlerini görür", () => {
    expect(visibleNav(effectiveRoles(["personnel", "owner"])).map((i) => i.key)).toEqual([...NAV_KEYS]);
  });

  it("alt sekme bar'ı en fazla 5 öğe gösterir, fazlası 'Daha fazla'ya gider", () => {
    const many = visibleNav(["personnel", "trainer", "section_manager", "hr"]);
    const { tabs, hasMore } = bottomTabs(many);
    expect(hasMore).toBe(true);
    expect(tabs.length + 1).toBe(MAX_BOTTOM_TABS);

    const few = visibleNav(["personnel"]);
    expect(bottomTabs(few)).toEqual({ tabs: few, hasMore: false });
  });
});
