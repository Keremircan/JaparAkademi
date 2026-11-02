import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/server/auth/current-user";
import { AppError } from "@/server/errors";
import { toActor } from "@/server/services/auth";
import { parseSummaryFilters } from "@/server/services/reports/summary";
import { exportSummary } from "@/server/services/reports/summary-export";

const query = z.object({
  from: z.string().max(10).optional(),
  to: z.string().max(10).optional(),
  unit: z.string().max(36).optional(),
});

/** Yönetim özeti Excel'i (karar #239): indirenin dilinde; yetki ve kapsam serviste, her indirme kayda geçer. */
export async function GET(req: NextRequest) {
  const q = query.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!q.success) return new NextResponse(null, { status: 400 });
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return new NextResponse(null, { status: 401 });
  try {
    const filters = await parseSummaryFilters({ from: q.data.from, to: q.data.to, orgUnitId: q.data.unit });
    const file = await exportSummary(toActor(user), filters, user.locale);
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
