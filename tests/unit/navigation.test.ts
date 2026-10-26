import { describe, expect, it } from "vitest";
import { bottomTabs, canSeeNav, MAX_BOTTOM_TABS, visibleNav } from "@/features/app-shell/navigation";

describe("Rol bazlı menü", () => {
  it("temel personel yalnızca ana sayfa, eğitimlerim ve profili görür", () => {
    expect(visibleNav(["personnel"]).map((i) => i.key)).toEqual(["home", "learn", "profile"]);
  });

  it("güvenlik görevlisi güvenlik bölümünü görür, yönetim bölümünü görmez", () => {
    expect(canSeeNav("security", ["personnel", "security"])).toBe(true);
    expect(canSeeNav("manage", ["personnel", "security"])).toBe(false);
  });

  it("İK hem yönetim hem sistem bölümünü görür", () => {
    expect(canSeeNav("manage", ["personnel", "hr"])).toBe(true);
    expect(canSeeNav("admin", ["personnel", "hr"])).toBe(true);
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
