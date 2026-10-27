import { describe, expect, it } from "vitest";
import { DEFAULT_EMAIL_EVENTS, emailHtml, NOTIFICATION_KINDS, nextAttemptDelayMs } from "@/server/state/notifications";

describe("SPEC 10.2 bildirim kuralları", () => {
  it("karar #85 varsayılan: sınav sonucu ve sistem alarmı yalnızca uygulama içi", () => {
    expect(DEFAULT_EMAIL_EVENTS).not.toContain("exam_result");
    expect(DEFAULT_EMAIL_EVENTS).not.toContain("email_failed");
    expect(DEFAULT_EMAIL_EVENTS).toContain("readiness_pending");
    // Saklama işi özeti de sistem bildirimidir (iş paketi 2.1)
    expect(DEFAULT_EMAIL_EVENTS).not.toContain("retention_completed");
    expect(DEFAULT_EMAIL_EVENTS.length).toBe(NOTIFICATION_KINDS.length - 3);
  });

  it("karar #87 yeniden deneme üstel beklemeyle, en çok 6 saat", () => {
    expect([1, 2, 3, 4, 5, 6, 9].map((a) => nextAttemptDelayMs(a) / 60_000)).toEqual([1, 5, 15, 60, 180, 360, 360]);
    expect(nextAttemptDelayMs(0)).toBe(60_000);
  });

  it("karar #86 e-posta gövdesi kaçışlanır; yalnızca başlık, metin ve bağlantı", () => {
    const html = emailHtml({ heading: "Onay <bekliyor>", body: 'A & B "C"', linkLabel: "Aç", url: "https://akademi.example/x?a=1&b=2", footer: "Otomatik" });
    expect(html).toContain("Onay &lt;bekliyor&gt;");
    expect(html).toContain("A &amp; B &quot;C&quot;");
    expect(html).toContain('href="https://akademi.example/x?a=1&amp;b=2"');
    expect(html).not.toContain("<script");
  });
});
