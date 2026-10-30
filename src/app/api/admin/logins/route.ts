import { NextResponse, type NextRequest } from "next/server";
import { createTranslator } from "next-intl";
import { loginLogQuery, parseLoginLogFilters } from "@/features/admin/login-log-filters";
import { getCurrentUser } from "@/server/auth/current-user";
import { can } from "@/server/authz/policy";
import { AppError } from "@/server/errors";
import { messagesFor } from "@/server/i18n/messages";
import { toActor } from "@/server/services/auth";
import { exportLoginAttempts } from "@/server/services/login-log";
import { LOGIN_RESULTS } from "@/server/state/login-log";
import { todayIn } from "@/lib/dates";
import { getSettings } from "@/server/services/settings";

/** Giriş kayıtlarını Excel olarak indirir (karar #215). Yetki serviste de denetlenir; her indirme kayda geçer. */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return new NextResponse(null, { status: 401 });
  const actor = toActor(user);
  if (!can(actor, "logins.view")) return new NextResponse(null, { status: 404 });
  const filters = parseLoginLogFilters(Object.fromEntries(req.nextUrl.searchParams));
  // İndiren kişinin dilinde (karar #217)
  const t = createTranslator({ locale: user.locale, messages: messagesFor(user.locale), namespace: "logins" });
  try {
    const { buffer } = await exportLoginAttempts(actor, filters, {
      sheet: t("title"),
      columns: [t("columns.at"), t("input"), t("person"), t("columns.sicil"), t("columns.result"), t("ip"), t("userAgent")],
      results: Object.fromEntries(LOGIN_RESULTS.map((r) => [r, t(`results.${r}`)])) as Record<(typeof LOGIN_RESULTS)[number], string>,
    });
    const { "org.timezone": tz } = await getSettings(["org.timezone"]);
    const fileName = `giris-kayitlari-${todayIn(tz)}.xlsx`;
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    // Satır sınırı aşıldı: ekrana dönüp süzgecin daraltılması istenir
    if (err instanceof AppError && err.code === "report_too_large") {
      return NextResponse.redirect(new URL(`/admin/logins?${loginLogQuery(filters, { error: "too_large" })}`, req.url), 303);
    }
    if (err instanceof AppError) return new NextResponse(null, { status: err.code === "forbidden" ? 404 : 400 });
    throw err;
  }
}
