import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/server/auth/current-user";
import { AppError } from "@/server/errors";
import { toActor } from "@/server/services/auth";
import { evacuationPdf } from "@/server/services/visitors";

/** Tahliye kağıt yedeği (karar #161): içeridekiler ya da `?rollcall=<id>` yoklama sonucu. Her indirme kayda geçer. */
export async function GET(req: NextRequest) {
  const rollcall = z.uuid().nullable().safeParse(req.nextUrl.searchParams.get("rollcall"));
  if (!rollcall.success) return new NextResponse(null, { status: 400 });
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return new NextResponse(null, { status: 401 });
  try {
    const file = await evacuationPdf(toActor(user), rollcall.data, user.locale);
    return new NextResponse(new Uint8Array(file.buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json({ error: err.code }, { status: err.code === "forbidden" ? 403 : 404 });
    throw err;
  }
}
