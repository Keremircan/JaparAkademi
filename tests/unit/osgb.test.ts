import { describe, expect, it } from "vitest";
import { csvCell, decimalText, osgbMethod, toCsv } from "@/server/state/osgb";

describe("OSGB dosya kuralları (karar #229)", () => {
  it("CSV: BOM, noktalı virgül, CRLF; ayraç ve tırnak içeren hücre tırnaklanır", () => {
    expect(toCsv([["a", "b;c"], ['say "x"', "d"]])).toBe('﻿a;"b;c"\r\n"say ""x""";d\r\n');
  });

  it("CSV: formül gibi başlayan hücre metin olarak kalır", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("+90")).toBe("'+90");
    expect(csvCell("@a")).toBe("'@a");
    expect(csvCell("Ayşe")).toBe("Ayşe");
  });

  it("yöntem ve ondalık metni", () => {
    expect(osgbMethod("online")).toBe("remote");
    expect(osgbMethod("classroom")).toBe("classroom");
    expect(osgbMethod("carried_over")).toBeNull();
    expect(decimalText(1.5, "tr")).toBe("1,5");
    expect(decimalText(1.5, "en")).toBe("1.5");
  });
});
