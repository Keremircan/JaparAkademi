/**
 * proxy.ts ve sunucu kodunun paylaştığı sabitler.
 * Bu dosya Better Auth veya veritabanı modülü içe aktarmamalıdır (proxy paketine girer).
 */
export const AUTH_COOKIE_PREFIX = "akademi";

/** Oturum gerektirmeyen yollar (dil öneki olmadan). */
export const PUBLIC_PATHS = ["/login", "/verify", "/~offline"] as const;
