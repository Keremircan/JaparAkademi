import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/server/auth/current-user";
import { AppError } from "@/server/errors";
import { toActor } from "@/server/services/auth";
import { parseFilters, REPORT_KINDS } from "@/server/services/reports";
import { exportReport } from "@/server/services/reports/export";

const query = z.object({
  format: z.enum(["xlsx", "pdf"]),
  from: z.string().max(10).optional(),
  to: z.string().max(10).optional(),
  orgUnitId: z.string().max(36).optional(),
  positionId: z.string().max(36).optional(),
});

/** Rapor dışa aktarma (Excel / PDF). Yetki ve kapsam serviste; her indirme kayda geçer. */
export async function GET(req: NextRequest, { params }: RouteContext<"/api/reports/[kind]">) {
  const kind = z.enum(REPORT_KINDS).safeParse((await params).kind);
  const q = query.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!kind.success || !q.success) return new NextResponse(null, { status: 400 });
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return new NextResponse(null, { status: 401 });
  try {
    const filters = await parseFilters(kind.data, q.data);
    const file = await exportReport(toActor(user), kind.data, filters, q.data.format);
    return new NextResponse(new Uint8Array(file.buffer), {
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json({ error: err.code }, { status: err.code === "forbidden" ? 403 : 400 });
    throw err;
  }
}
