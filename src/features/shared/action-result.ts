import "server-only";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { getCurrentUser } from "@/server/auth/current-user";
import { AppError, ValidationError } from "@/server/errors";
import { logger } from "@/server/logger";
import { toActor, type SessionUser } from "@/server/services/auth";

/**
 * Server Action sonuç biçimi. Hata kodu arayüzde "errors.<code>" metnine çevrilir.
 */
export type ActionError = { ok: false; error: string; details?: unknown };
export type ActionResult<T = void> = { ok: true; data: T } | ActionError;

/** Servis çağrısını sarar: uygulama hatalarını koda çevirir, beklenmeyenleri loglar. */
export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    if (err instanceof AppError) {
      return { ok: false, error: err.code, details: err instanceof ValidationError ? err.details : undefined };
    }
    // redirect/notFound gibi Next kontrol akışı hataları yeniden fırlatılır
    if (err && typeof err === "object" && "digest" in err) throw err;
    logger.error({ err }, "Beklenmeyen eylem hatası");
    return { ok: false, error: "unexpected" };
  }
}

/** Eylemi yapan kullanıcı. Oturum yoksa giriş sayfasına yönlendirir (yetki kontrolü serviste yapılır). */
export async function actionUser(): Promise<{ user: SessionUser; actor: ReturnType<typeof toActor> }> {
  const user = await getCurrentUser();
  if (!user) return redirect({ href: "/login", locale: await getLocale() });
  return { user, actor: toActor(user) };
}

/** FormData'dan boş olmayan metin (yoksa null). */
export function formText(formData: FormData, key: string): string | null {
  const v = formData.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}
