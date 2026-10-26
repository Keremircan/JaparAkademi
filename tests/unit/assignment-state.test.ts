import { describe, expect, it } from "vitest";
import { addBusinessDays, defaultTargetDate, todayIn } from "@/lib/dates";
import { allRequiredDone, coveredSeconds, lockReason, mergeRanges, nextModule, unlockable, type ModuleState } from "@/server/state/assignment";

const m = (moduleId: string, status: ModuleState["status"], prereqs: string[] = [], kind: ModuleState["kind"] = "theory", isRequired = true): ModuleState => ({
  id: `am-${moduleId}`,
  moduleId,
  kind,
  status,
  isRequired,
  prerequisiteModuleIds: prereqs,
});

describe("FG-3.4 ön koşul kilidi", () => {
  it("ön koşulu tamam olan kilitli modül açılır; pratik modül eğitmen seçilmeden açılmaz", () => {
    const list = [m("a", "completed"), m("b", "locked", ["a"]), m("c", "locked", ["b"]), m("p", "locked", ["a"], "practice")];
    expect(unlockable(list, false)).toEqual(["am-b"]);
    expect(unlockable(list, true)).toEqual(["am-b", "am-p"]);
    expect(lockReason(list[2]!, list, false)).toEqual({ kind: "prerequisites", moduleIds: ["b"] });
    expect(lockReason(list[3]!, list, false)).toEqual({ kind: "trainer" });
  });

  it("isteğe bağlı modül tamamlanmayı engellemez; sıradaki adım devam eden modüldür", () => {
    expect(allRequiredDone([m("a", "completed"), m("o", "available", [], "theory", false)])).toBe(true);
    expect(allRequiredDone([m("a", "completed"), m("b", "in_progress")])).toBe(false);
    expect(nextModule([m("a", "completed"), m("b", "available"), m("c", "in_progress")])?.moduleId).toBe("c");
  });
});

describe("FG-4.2 video izleme", () => {
  it("aralıklar birleştirilir, süre dışı kırpılır, tekrar izlenen kısım bir kez sayılır", () => {
    const merged = mergeRanges([[0, 30], [20, 50], [80, 500], [60, 60]], 100);
    expect(merged).toEqual([[0, 50], [80, 100]]);
    expect(coveredSeconds(merged)).toBe(70);
    expect(mergeRanges([[10, 5]], 100)).toEqual([[5, 10]]);
  });
});

describe("Hedef tarih (karar #50)", () => {
  it("iş günü sayılır, hafta sonu atlanır", () => {
    expect(addBusinessDays("2026-10-23", 1)).toBe("2026-10-23"); // cuma
    expect(addBusinessDays("2026-10-23", 2)).toBe("2026-10-26"); // pazartesi
    expect(addBusinessDays("2026-10-24", 1)).toBe("2026-10-26"); // cumartesi → pazartesi
    expect(defaultTargetDate("2026-10-26", 47 * 60, 420)).toBe("2026-11-03"); // 7 iş günü
  });

  it("bugün verilen saat diliminde hesaplanır", () => {
    expect(todayIn("Europe/Istanbul", new Date("2026-10-26T22:30:00Z"))).toBe("2026-10-27");
  });
});
