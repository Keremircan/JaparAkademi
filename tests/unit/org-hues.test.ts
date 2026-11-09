import { describe, expect, it } from "vitest";
import { DEPARTMENT_HUES, departmentHues, HUE_CLASSES } from "@/features/org/hues";

const dept = (code: string, isActive = true) => ({ code, isActive });

describe("Karar #293 organizasyon ağacında departman renkleri", () => {
  it("karar #293: altı departmana kadar her departmanın rengi farklıdır", () => {
    const hues = departmentHues(["YON", "BURO", "URETIM", "LOJ", "KALITE", "IK"].map((c) => dept(c)));
    expect(new Set(hues).size).toBe(6);
    for (const h of hues) expect(DEPARTMENT_HUES).toContain(h);
  });

  it("karar #293: renk koddan gelir; aynı liste her açılışta aynı renkleri alır", () => {
    const list = ["YON", "BURO", "URETIM"].map((c) => dept(c));
    expect(departmentHues(list)).toEqual(departmentHues(list));
    // Tek başına bir departmanın rengi listedeki yerine değil koduna bağlıdır
    expect(departmentHues([dept("URETIM")])).toEqual(departmentHues([dept("URETIM"), dept("ZZZ")]).slice(0, 1));
  });

  it("karar #293: pasif departman gri olur ve renk sırasından pay almaz", () => {
    const hues = departmentHues([dept("YON", false), dept("BURO"), dept("URETIM")]);
    expect(hues[0]).toBe("slate");
    expect(hues[1]).not.toBe("slate");
    expect(hues[1]).not.toBe(hues[2]);
  });

  it("karar #293: renkler bitince baştan dolanır, boş kalan departman olmaz", () => {
    const hues = departmentHues(Array.from({ length: 9 }, (_, i) => dept(`D${i}`)));
    expect(hues).toHaveLength(9);
    expect(new Set(hues.slice(0, 6)).size).toBe(6);
    for (const h of hues) expect(DEPARTMENT_HUES).toContain(h);
  });

  it("karar #293: her renk takımının koyu mod karşılığı vardır", () => {
    for (const [hue, classes] of Object.entries(HUE_CLASSES))
      for (const [part, value] of Object.entries(classes)) expect(value, `${hue}.${part}`).toMatch(/dark:/);
  });
});
