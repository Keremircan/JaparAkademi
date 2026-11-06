import { describe, expect, it } from "vitest";
import {
  classifyFetchError,
  classifyGraphError,
  classifyResendError,
  formatMailError,
  isLinkEmail,
  LINK_EMAIL_KINDS,
  mailBudget,
  maskEmail,
  nextDailyReset,
  parseMailError,
  pickWithinBudget,
} from "@/server/state/mail";

describe("İş paketi 3.7: e-posta kuralları", () => {
  it("karar #262: Resend hataları türüne göre sınıflanır (kalıcı olanlar yeniden denenmez)", () => {
    expect(classifyResendError(429, "daily_quota_exceeded")).toEqual({ problem: "quota", retryable: true });
    expect(classifyResendError(429, "monthly_quota_exceeded")).toEqual({ problem: "quota", retryable: true });
    expect(classifyResendError(429, "rate_limit_exceeded")).toEqual({ problem: "rate", retryable: true });
    expect(classifyResendError(429, undefined)).toEqual({ problem: "rate", retryable: true });
    expect(classifyResendError(401, "missing_api_key")).toEqual({ problem: "auth", retryable: false });
    expect(classifyResendError(403, "restricted_api_key")).toEqual({ problem: "auth", retryable: false });
    expect(classifyResendError(403, "invalid_api_key")).toEqual({ problem: "auth", retryable: false });
    expect(classifyResendError(403, "validation_error")).toEqual({ problem: "permission", retryable: false });
    expect(classifyResendError(422, "invalid_from_address")).toEqual({ problem: "sender", retryable: false });
    expect(classifyResendError(422, "invalid_parameter")).toEqual({ problem: "request", retryable: false });
    expect(classifyResendError(400, "validation_error")).toEqual({ problem: "request", retryable: false });
    expect(classifyResendError(409, "concurrent_idempotent_requests")).toEqual({ problem: "unknown", retryable: true });
    expect(classifyResendError(500, "application_error")).toEqual({ problem: "unavailable", retryable: true });
    expect(classifyResendError(503, undefined)).toEqual({ problem: "unavailable", retryable: true });
    expect(classifyResendError(404, "not_found")).toEqual({ problem: "unknown", retryable: false });
  });

  it("karar #262: Graph hataları aşamaya göre sınıflanır", () => {
    expect(classifyGraphError("token", 400)).toEqual({ problem: "auth", retryable: false });
    expect(classifyGraphError("token", 503)).toEqual({ problem: "unavailable", retryable: true });
    expect(classifyGraphError("send", 401)).toEqual({ problem: "auth", retryable: true });
    expect(classifyGraphError("send", 403)).toEqual({ problem: "permission", retryable: false });
    expect(classifyGraphError("send", 404)).toEqual({ problem: "sender", retryable: false });
    expect(classifyGraphError("send", 400)).toEqual({ problem: "request", retryable: false });
    expect(classifyGraphError("send", 429)).toEqual({ problem: "rate", retryable: true });
  });

  it("karar #262: yanıtsız istek hatası kodu ile sınıflanır; hata metni (anahtar) dışarı verilmez", async () => {
    const dns = new TypeError("fetch failed", { cause: Object.assign(new Error("getaddrinfo ENOTFOUND"), { code: "ENOTFOUND" }) });
    expect(classifyFetchError(dns)).toEqual({ problem: "network", retryable: true, code: "ENOTFOUND" });
    const connect = new TypeError("fetch failed", { cause: Object.assign(new Error("x"), { code: "UND_ERR_CONNECT_TIMEOUT" }) });
    expect(classifyFetchError(connect).code).toBe("UND_ERR_CONNECT_TIMEOUT");
    expect(classifyFetchError(new DOMException("aborted", "TimeoutError"))).toEqual({ problem: "network", retryable: true, code: "TIMEOUT" });
    // Gerçek fetch: anahtarda Türkçe harf varsa istek kurulamaz; hata metni anahtarı içerir, koda dönüşür
    const header = await fetch("http://127.0.0.1:9/", { headers: { Authorization: "Bearer re_gizlı" } }).catch((e: unknown) => e);
    const info = classifyFetchError(header);
    expect(info).toEqual({ problem: "auth", retryable: false, code: "INVALID_HEADER" });
    expect(JSON.stringify(info)).not.toContain("re_");
    const odd = new TypeError("fetch failed", { cause: { code: "bad code with spaces" } });
    expect(classifyFetchError(odd).code).toBe("TypeError");
    expect(classifyFetchError("x")).toEqual({ problem: "network", retryable: true, code: "error" });
  });

  it("karar #260: bağlantılar kalan hakkın tamamını, bildirimler ayrılan pay dışını kullanır; 0 = sınırsız", () => {
    expect(mailBudget({ limit: 100, reserve: 20, sent: 0 })).toEqual({ links: 100, others: 80 });
    expect(mailBudget({ limit: 100, reserve: 20, sent: 85 })).toEqual({ links: 15, others: 0 });
    expect(mailBudget({ limit: 100, reserve: 20, sent: 120 })).toEqual({ links: 0, others: 0 });
    expect(mailBudget({ limit: 10, reserve: 50, sent: 0 })).toEqual({ links: 10, others: 0 });
    const unlimited = mailBudget({ limit: 0, reserve: 20, sent: 5000 });
    expect(unlimited.links).toBe(Number.POSITIVE_INFINITY);
    expect(unlimited.others).toBe(Number.POSITIVE_INFINITY);
  });

  it("karar #260: bütçe dolunca önce bağlantılar seçilir, bildirimler bekler", () => {
    const rows = [
      { id: 1, kind: "password_reset" },
      { id: 2, kind: "account_invite" },
      { id: 3, kind: "readiness_pending" },
      { id: 4, kind: "weekly_summary" },
    ];
    expect(pickWithinBudget(rows, { links: 3, others: 1 }).map((r) => r.id)).toEqual([1, 2, 3]);
    expect(pickWithinBudget(rows, { links: 10, others: 0 }).map((r) => r.id)).toEqual([1, 2]);
    expect(pickWithinBudget(rows, { links: 1, others: 5 }).map((r) => r.id)).toEqual([1]);
    expect(pickWithinBudget(rows, { links: Number.POSITIVE_INFINITY, others: Number.POSITIVE_INFINITY })).toHaveLength(4);
    // Öncelik sırası: şifre sıfırlama en önde
    expect(LINK_EMAIL_KINDS[0]).toBe("password_reset");
    expect(isLinkEmail("visitor_link")).toBe(true);
    expect(isLinkEmail("mail_test")).toBe(false);
  });

  it("karar #260: günlük sayaç UTC gece yarısı sıfırlanır (Türkiye saatiyle 03:00)", () => {
    expect(nextDailyReset(new Date("2026-11-04T20:59:00Z")).toISOString()).toBe("2026-11-05T00:00:00.000Z");
    // Türkiye saatiyle 01:30 (UTC 22:30): sayaç henüz sıfırlanmadı
    expect(nextDailyReset(new Date("2026-11-04T22:30:00Z")).toISOString()).toBe("2026-11-05T00:00:00.000Z");
    expect(nextDailyReset(new Date("2026-12-31T23:59:59Z")).toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  it("karar #262: hata kaydı tür + ayrıntı; adres maskelenir", () => {
    const text = formatMailError("permission", "Resend 403 validation_error");
    expect(text).toBe("[permission] Resend 403 validation_error");
    expect(parseMailError(text)).toEqual({ problem: "permission", detail: "Resend 403 validation_error" });
    expect(parseMailError("Graph sendMail başarısız (503)")).toEqual({ problem: "unknown", detail: "Graph sendMail başarısız (503)" });
    expect(parseMailError("[bilinmeyen] x")).toEqual({ problem: "unknown", detail: "[bilinmeyen] x" });
    expect(parseMailError(null)).toBeNull();
    expect(formatMailError("unknown", "x".repeat(600))).toHaveLength(500);

    expect(maskEmail("ahmet.yilmaz@japar.com.tr")).toBe("a***@japar.com.tr");
    expect(maskEmail("x@y.com")).toBe("x***@y.com");
    expect(maskEmail("bozuk")).toBe("***");
  });
});
