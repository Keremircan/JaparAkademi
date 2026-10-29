/**
 * proxy.ts ve sunucu kodunun paylaştığı sabitler.
 * Bu dosya Better Auth veya veritabanı modülü içe aktarmamalıdır (proxy paketine girer).
 */
export const AUTH_COOKIE_PREFIX = "akademi";

/** Oturum gerektirmeyen yollar (dil öneki olmadan). */
/** Ziyaretçi ekranları da hesapsızdır (iş paketi 2.3a): /v (bağlantı), /kiosk (kapı tableti), /visit (QR ile kendi kaydı). */
export const PUBLIC_PATHS = ["/login", "/activate", "/verify", "/forgot-password", "/reset-password", "/~offline", "/v", "/kiosk", "/visit"] as const;
