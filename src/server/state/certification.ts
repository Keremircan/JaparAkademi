/**
 * Sertifika ve doğrulama kuralları (FG-7.2), saf fonksiyonlar.
 *  - Doğrulama sayfasında ad maskelenir: ilk ad tam, diğerleri baş harf + *** ("Ahmet Y***").
 *  - "Süresi dolmuş" saklanmaz; bitiş tarihinden hesaplanır (karar #78).
 *  - Pozisyon sertifikası, atamadaki geçerlilik süreli modüllerin en erken bitişine kadar geçerlidir.
 */

export function maskName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "***";
  const [first, ...rest] = parts;
  return [first, ...rest.map((p) => `${p.charAt(0).toLocaleUpperCase("tr")}***`)].join(" ");
}

export function documentNo(serialNo: number, issuedYear: number): string {
  return `JA-${issuedYear}-${String(serialNo).padStart(6, "0")}`;
}

export type CertificateState = "valid" | "expired" | "revoked";

export function certificateState(status: "valid" | "revoked", expiresAt: Date | null, now: Date = new Date()): CertificateState {
  if (status === "revoked") return "revoked";
  if (expiresAt && expiresAt.getTime() <= now.getTime()) return "expired";
  return "valid";
}

/** Pozisyon sertifikasının bitişi: geçerlilik süreli modüllerin en erken bitişi; yoksa süresiz (karar #78). */
export function earliestExpiry(dates: readonly (Date | null)[]): Date | null {
  const valid = dates.filter((d): d is Date => d instanceof Date);
  if (valid.length === 0) return null;
  return new Date(Math.min(...valid.map((d) => d.getTime())));
}

/** Basit kayan pencere hız sınırı (doğrulama sayfası; tek uygulama süreci). */
export function createRateLimiter() {
  const hits = new Map<string, number[]>();
  return (key: string, max: number, windowMs: number, now = Date.now()): boolean => {
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= max) {
      hits.set(key, recent);
      return false;
    }
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 10_000) for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k);
    return true;
  };
}
