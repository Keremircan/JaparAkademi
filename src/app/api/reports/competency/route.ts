import { NextResponse, type NextRequest } from "next/server";
import { createTranslator } from "next-intl";
import { z } from "zod";
import { getCurrentUser } from "@/server/auth/current-user";
import { can } from "@/server/authz/policy";
import { AppError } from "@/server/errors";
import { messagesFor } from "@/server/i18n/messages";
import { toActor } from "@/server/services/auth";
import { competencyMatrixWorkbook } from "@/server/services/competencies";

/** Yetkinlik matrisi Excel (FG-7.4): indirenin dilinde; yetki ve kapsam serviste, her indirme kayda geçer. */
export async function GET(req: NextRequest) {
  const unit = z.uuid().safeParse(req.nextUrl.searchParams.get("unit"));
  if (!unit.success) return new NextResponse(null, { status: 400 });
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return new NextResponse(null, { status: 401 });
  const actor = toActor(user);
  if (!can(actor, "competencies.view")) return new NextResponse(null, { status: 404 });
  const t = createTranslator({ locale: user.locale, messages: messagesFor(user.locale), namespace: "competencies.matrix" });
  try {
    const buffer = await competencyMatrixWorkbook(actor, unit.data, {
      sheet: t("title"),
      person: t("person"),
      sicil: t("sicil"),
      position: t("position"),
      unlimited: t("unlimited"),
      states: { valid: t("states.valid"), expiring: t("states.expiring"), expired: t("states.expired") },
    });
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${t("file")}.xlsx"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    if (err instanceof AppError) return new NextResponse(null, { status: err.code === "forbidden" ? 404 : 400 });
    throw err;
  }
}
