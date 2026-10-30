/** Giriş kayıtları için saf kurallar (karar #215–216). */

export const LOGIN_RESULTS = ["success", "unknown_user", "bad_password", "locked", "inactive", "rate_limited", "bad_invite", "activated"] as const;
export type LoginResult = (typeof LOGIN_RESULTS)[number];

/** Başarısız sayılan sonuçlar ("Başarısız olanlar" süzgeci). */
export const LOGIN_FAILURE_RESULTS = ["unknown_user", "bad_password", "locked", "inactive", "rate_limited", "bad_invite"] as const satisfies readonly LoginResult[];

export function isLoginResult(value: string): value is LoginResult {
  return (LOGIN_RESULTS as readonly string[]).includes(value);
}

/**
 * Bilinmeyen kullanıcı denemesinde yazılan metin maskelenir: kişi sicil yerine şifresini yazmış olabilir.
 * İlk 3 karakter gösterilir (saldırı denemelerindeki "admin" gibi adlar tanınır), gerisi gizlenir.
 */
export function maskLoginInput(input: string, result: LoginResult): string {
  if (result !== "unknown_user") return input;
  const visible = [...input].slice(0, 3).join("");
  return [...input].length > 3 ? `${visible}•••` : visible;
}

/** Saklama: bu tarihten eski giriş kayıtları silinir (en az 30 gün; veritabanı da 30 günden yenisini silmez). */
export function loginAttemptPurgeBefore(now: Date, days: number): Date {
  return new Date(now.getTime() - Math.max(30, days) * 24 * 60 * 60 * 1000);
}
