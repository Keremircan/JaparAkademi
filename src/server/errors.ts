/**
 * Uygulama hataları. `code`, arayüzde messages/*.json içindeki "errors.<code>" anahtarına karşılık gelir.
 */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = new.target.name;
  }
}

export class UnauthenticatedError extends AppError {
  constructor() {
    super("unauthenticated", "Oturum gerekli");
  }
}

export class ForbiddenError extends AppError {
  constructor(public readonly permission?: string) {
    super("forbidden", permission ? `Yetki yok: ${permission}` : "Yetki yok");
  }
}

export class NotFoundError extends AppError {
  constructor(what: string) {
    super("not_found", `Bulunamadı: ${what}`);
  }
}

export class ValidationError extends AppError {
  constructor(
    code: string,
    public readonly details?: unknown,
  ) {
    super(code);
  }
}

/** Veritabanı hata kodu (SQLSTATE). Drizzle hataları asıl Postgres hatasını `cause` içinde taşır. */
export function pgErrorCode(err: unknown): string | undefined {
  let current: unknown = err;
  for (let depth = 0; depth < 5 && current; depth++) {
    if (typeof current === "object" && current !== null && "code" in current) {
      const code = (current as { code: unknown }).code;
      if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

/** prevent_mutation() trigger'ının hata kodu. */
export const IMMUTABLE_VIOLATION = "JA001";

export function isImmutableViolation(err: unknown): boolean {
  return pgErrorCode(err) === IMMUTABLE_VIOLATION;
}
