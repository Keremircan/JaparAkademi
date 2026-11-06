/**
 * E-posta gönderim kuralları (iş paketi 3.7, kararlar #258–263), saf fonksiyonlar:
 * sağlayıcı hatalarının sınıflanması, günlük gönderim bütçesi ve ekranda maskeli adres.
 */

/** Gönderim hatasının türü; ekranda `mailStatus.problems.<tür>` ve sağlayıcıya özel ipucu ile gösterilir. */
export const MAIL_PROBLEMS = ["auth", "permission", "sender", "request", "quota", "rate", "unavailable", "network", "unknown"] as const;
export type MailProblem = (typeof MAIL_PROBLEMS)[number];

export type MailErrorInfo = { problem: MailProblem; retryable: boolean };

/**
 * Resend API hatası (durum kodu + hata adı). Sağlayıcının hata metni adres içerebildiği için saklanmaz;
 * yalnızca durum kodu ve ad kullanılır.
 */
export function classifyResendError(status: number, name: string | undefined): MailErrorInfo {
  const n = name ?? "";
  if (status === 429 || n.includes("quota")) {
    return { problem: n.includes("quota") ? "quota" : "rate", retryable: true };
  }
  if (status === 401 || ["missing_api_key", "invalid_api_key", "restricted_api_key", "suspended_api_key"].includes(n)) {
    return { problem: "auth", retryable: false };
  }
  if (n === "invalid_from_address") return { problem: "sender", retryable: false };
  // 403 validation_error: alan adı doğrulanmamış ya da yalnızca hesap sahibine deneme gönderimi
  if (status === 403) return { problem: "permission", retryable: false };
  if (status === 400 || status === 422) return { problem: "request", retryable: false };
  if (status >= 500) return { problem: "unavailable", retryable: true };
  // 409: aynı anahtarla eş zamanlı istek; biraz sonra yeniden denenir
  return { problem: "unknown", retryable: status === 409 };
}

/** Microsoft Graph hatası: belirteç alma (`token`) ya da gönderim (`send`) aşaması. */
export function classifyGraphError(stage: "token" | "send", status: number): MailErrorInfo {
  if (status === 429) return { problem: "rate", retryable: true };
  if (status >= 500) return { problem: "unavailable", retryable: true };
  if (stage === "token") return { problem: "auth", retryable: false };
  // Belirtecin süresi dolmuş olabilir: belirteç sıfırlanır, yeniden denenir
  if (status === 401) return { problem: "auth", retryable: true };
  if (status === 403) return { problem: "permission", retryable: false };
  if (status === 404) return { problem: "sender", retryable: false };
  if (status === 400) return { problem: "request", retryable: false };
  return { problem: "unknown", retryable: false };
}

/**
 * `fetch` hiç yanıt alamadan düştüğünde (karar #262). Ekrana yalnızca hata kodu yazılır (ör. `ENOTFOUND`,
 * `UND_ERR_CONNECT_TIMEOUT`); hata metni yazılmaz, çünkü geçersiz başlık hatası anahtarın kendisini içerir.
 * Nedeni olmayan `TypeError` istek kurulurken çıkar: tek değişken başlık `Authorization` olduğundan anahtarda
 * geçersiz karakter (Türkçe harf, görünmez karakter) vardır.
 */
export function classifyFetchError(err: unknown): MailErrorInfo & { code: string } {
  if (!(err instanceof Error)) return { problem: "network", retryable: true, code: "error" };
  if (err.name === "TimeoutError" || err.name === "AbortError") return { problem: "network", retryable: true, code: "TIMEOUT" };
  const cause = err.cause as { code?: unknown; name?: unknown } | undefined;
  const raw = typeof cause?.code === "string" ? cause.code : typeof cause?.name === "string" ? cause.name : null;
  const code = raw && /^[A-Za-z0-9_]{1,40}$/.test(raw) ? raw : null;
  if (err.name === "TypeError" && !cause && err.message !== "fetch failed") {
    return { problem: "auth", retryable: false, code: "INVALID_HEADER" };
  }
  return { problem: "network", retryable: true, code: code ?? err.name };
}

/**
 * Bağlantı taşıyan e-postalar: günlük sınırda bildirimlerden önce gider (karar #260).
 * Dizideki sıra öncelik sırasıdır (şifre sıfırlama bağlantısı en kısa sürede geçersizleşir).
 */
export const LINK_EMAIL_KINDS = ["password_reset", "visitor_link", "account_invite"] as const;

export function isLinkEmail(kind: string): boolean {
  return (LINK_EMAIL_KINDS as readonly string[]).includes(kind);
}

export type MailBudget = { links: number; others: number };

/**
 * Bugün kalan gönderim hakkı (karar #260). `limit` 0 ise sınır yoktur. Bağlantı e-postaları kalan hakkın
 * tamamını, bildirimler ise yalnızca `reserve` dışında kalan kısmı kullanabilir.
 */
export function mailBudget(input: { limit: number; reserve: number; sent: number }): MailBudget {
  if (input.limit <= 0) return { links: Number.POSITIVE_INFINITY, others: Number.POSITIVE_INFINITY };
  return {
    links: Math.max(0, input.limit - input.sent),
    others: Math.max(0, input.limit - input.reserve - input.sent),
  };
}

/** Öncelik sırasına dizilmiş adaylardan (bağlantılar önce) bütçeye sığanları seçer; kalanlar bekler. */
export function pickWithinBudget<T extends { kind: string }>(rows: readonly T[], budget: MailBudget): T[] {
  const picked: T[] = [];
  let others = 0;
  for (const row of rows) {
    if (picked.length >= budget.links) break;
    if (!isLinkEmail(row.kind)) {
      if (others >= budget.others) continue;
      others++;
    }
    picked.push(row);
  }
  return picked;
}

/** Resend'in günlük kotası UTC gününe göre sayılır ve UTC gece yarısı sıfırlanır (karar #260). */
export function nextDailyReset(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
}

/** Denetim ve ekran için hata kaydı: `[tür] ayrıntı` (ayrıntıda adres ya da sağlayıcı metni yok). */
export function formatMailError(problem: MailProblem, detail: string): string {
  return `[${problem}] ${detail}`.slice(0, 500);
}

export function parseMailError(text: string | null): { problem: MailProblem; detail: string } | null {
  if (!text) return null;
  const m = /^\[([a-z]+)\] ?([\s\S]*)$/.exec(text);
  const problem = m && (MAIL_PROBLEMS as readonly string[]).includes(m[1]!) ? (m[1] as MailProblem) : null;
  return problem ? { problem, detail: m![2]! } : { problem: "unknown", detail: text };
}

/** Ekranda adres maskelenir: `a***@alanadi.com` (karar #262). */
export function maskEmail(address: string): string {
  const at = address.lastIndexOf("@");
  if (at <= 0) return "***";
  return `${address[0]}***${address.slice(at)}`;
}
