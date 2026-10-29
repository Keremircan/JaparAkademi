import { describe, expect, it } from "vitest";
import { classifyPushStatus, isAllowedPushEndpoint, outboxResult, pushPayload, shortUserAgent } from "@/server/state/push";

describe("web push kuralları (iş paketi 2.6)", () => {
  it("karar #176: içerik yalnızca kimlik ve genel metin", () => {
    expect(JSON.parse(pushPayload("n1", { title: "JAPAR Akademi", body: "Yeni bildiriminiz var" }))).toEqual({
      id: "n1",
      title: "JAPAR Akademi",
      body: "Yeni bildiriminiz var",
    });
  });

  it("karar #179: push servisi yanıtları", () => {
    expect(classifyPushStatus(201)).toBe("ok");
    expect(classifyPushStatus(404)).toBe("gone");
    expect(classifyPushStatus(410)).toBe("gone");
    expect(classifyPushStatus(429)).toBe("retry");
    expect(classifyPushStatus(503)).toBe("retry");
    expect(classifyPushStatus(null)).toBe("retry");
    expect(classifyPushStatus(400)).toBe("drop");
    expect(classifyPushStatus(413)).toBe("drop");
  });

  it("karar #179: bir cihaza ulaşan bildirim gönderilmiş sayılır; hepsi yoksa atlanır; geçici hata sınıra kadar denenir", () => {
    expect(outboxResult(["gone", "ok"], 1, 3)).toBe("sent");
    expect(outboxResult([], 1, 3)).toBe("skipped");
    expect(outboxResult(["gone", "gone"], 1, 3)).toBe("skipped");
    expect(outboxResult(["retry", "gone"], 2, 3)).toBe("retry");
    expect(outboxResult(["retry"], 3, 3)).toBe("failed");
    expect(outboxResult(["drop"], 1, 3)).toBe("failed");
  });

  it("tarayıcı bilgisi kısaltılır", () => {
    expect(shortUserAgent("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36")).toBe("Chrome · Android");
    expect(shortUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1")).toBe("Safari · iOS");
    expect(shortUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36 Edg/130.0")).toBe("Edge · Windows");
    expect(shortUserAgent(null)).toBeNull();
  });

  it("yalnızca bilinen push servislerine gönderilir", () => {
    expect(isAllowedPushEndpoint("https://fcm.googleapis.com/fcm/send/abc")).toBe(true);
    expect(isAllowedPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/abc")).toBe(true);
    expect(isAllowedPushEndpoint("https://web.push.apple.com/QGx")).toBe(true);
    expect(isAllowedPushEndpoint("https://wns2-db5p.notify.windows.com/w/?token=x")).toBe(true);
    expect(isAllowedPushEndpoint("http://fcm.googleapis.com/fcm/send/abc")).toBe(false);
    expect(isAllowedPushEndpoint("https://fcm.googleapis.com:8443/x")).toBe(false);
    expect(isAllowedPushEndpoint("https://fcm.googleapis.com.evil.test/x")).toBe(false);
    expect(isAllowedPushEndpoint("https://localhost/x")).toBe(false);
    expect(isAllowedPushEndpoint("not a url")).toBe(false);
  });
});
