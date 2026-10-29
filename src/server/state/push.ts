/**
 * Web push kuralları (SPEC 10.2, iş paketi 2.6, kararlar #175–184), saf fonksiyonlar.
 * Push yalnızca bildirimin kimliğini ve genel bir metni taşır; kişisel veya içerik bilgisi yoktur (karar #110).
 */

export type PushPayload = { id: string; title: string; body: string };

export function pushPayload(notificationId: string, text: { title: string; body: string }): string {
  return JSON.stringify({ id: notificationId, title: text.title, body: text.body } satisfies PushPayload);
}

/** Push servisinin yanıtına göre ne yapılacağı: abonelik artık yoksa silinir, geçici hatada yeniden denenir. */
export type PushOutcome = "ok" | "gone" | "retry" | "drop";

export function classifyPushStatus(status: number | null): PushOutcome {
  if (status !== null && status >= 200 && status < 300) return "ok";
  if (status === 404 || status === 410) return "gone";
  // Ağ hatası, hız sınırı ve servis hataları geçicidir
  if (status === null || status === 429 || status >= 500) return "retry";
  // 400, 401, 403, 413: istek (anahtar, boyut) hatalı — yeniden denemek düzeltmez
  return "drop";
}

/** Bir bildirimin bütün cihazlara gönderim sonucu (outbox satırının yeni durumu). */
export function outboxResult(outcomes: readonly PushOutcome[], attempts: number, maxAttempts: number): "sent" | "skipped" | "retry" | "failed" {
  if (outcomes.includes("ok")) return "sent";
  if (outcomes.length === 0 || outcomes.every((o) => o === "gone")) return "skipped";
  if (outcomes.includes("retry") && attempts < maxAttempts) return "retry";
  return "failed";
}

/** Profilde "bu cihaz" gösterimi için kısa tarayıcı bilgisi (tam user-agent saklanmaz). */
export function shortUserAgent(ua: string | null | undefined): string | null {
  if (!ua) return null;
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /SamsungBrowser\//.test(ua)
      ? "Samsung Internet"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : null;
  const os = /Android/.test(ua)
    ? "Android"
    : /iPhone|iPad|iPod/.test(ua)
      ? "iOS"
      : /Windows/.test(ua)
        ? "Windows"
        : /Mac OS X/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : null;
  const parts = [browser, os].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

/** İzin verilen push servisleri: yalnızca bilinen tarayıcı servislerine gönderilir (SSRF koruması). */
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^android\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /^[a-z0-9-]+\.push\.apple\.com$/,
  /^[a-z0-9-]+\.notify\.windows\.com$/,
];

export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  return url.protocol === "https:" && !url.port && PUSH_HOSTS.some((h) => h.test(url.hostname));
}
