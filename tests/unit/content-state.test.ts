import { describe, expect, it } from "vitest";
import { isEditable, onApprove, onReject, onSubmit, pendingStep } from "@/server/state/content";

describe("FG-2.3 içerik yayın durum makinesi", () => {
  it("yetkisiz gönderen → bölüm onayı", () => {
    expect(onSubmit({ isOhs: false, submitterCanApproveSection: false, submitterIsOhsSpecialist: false })).toEqual({ autoSteps: [], status: "section_review" });
  });

  it("bölüm onayı yetkisi olan gönderen: İSG değilse hemen yayın, İSG ise İSG onayına", () => {
    expect(onSubmit({ isOhs: false, submitterCanApproveSection: true, submitterIsOhsSpecialist: false })).toEqual({ autoSteps: ["section"], status: "published" });
    expect(onSubmit({ isOhs: true, submitterCanApproveSection: true, submitterIsOhsSpecialist: false })).toEqual({ autoSteps: ["section"], status: "ohs_review" });
  });

  it("İSG uzmanının İSG içeriği tek adımda yayınlanır", () => {
    expect(onSubmit({ isOhs: true, submitterCanApproveSection: false, submitterIsOhsSpecialist: true })).toEqual({ autoSteps: ["section", "ohs"], status: "published" });
  });

  it("onay ve ret geçişleri", () => {
    expect(onApprove("section_review", false)).toBe("published");
    expect(onApprove("section_review", true)).toBe("ohs_review");
    expect(onApprove("ohs_review", true)).toBe("published");
    expect(() => onApprove("draft", false)).toThrow();
    expect(onReject("ohs_review")).toBe("rejected");
    expect(() => onReject("published")).toThrow();
  });

  it("yalnızca taslak ve reddedilen düzenlenir; bekleyen adım doğru bulunur", () => {
    expect(["draft", "rejected", "section_review", "ohs_review", "published"].filter((s) => isEditable(s as never))).toEqual(["draft", "rejected"]);
    expect(pendingStep("section_review")).toBe("section");
    expect(pendingStep("ohs_review")).toBe("ohs");
    expect(pendingStep("published")).toBeNull();
  });
});
