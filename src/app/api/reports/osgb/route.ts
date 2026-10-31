import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/server/auth/current-user";
import { AppError } from "@/server/errors";
import { toActor } from "@/server/services/auth";
import { parseFilters } from "@/server/services/reports";
import { exportOsgb } from "@/server/services/reports/osgb";

const query = z.object({
  format: z.enum(["xlsx", "csv"]),
  from: z.string().max(10).optional(),
  to: z.string().max(10).optional(),
  orgUnitId: z.string().max(36).optional(),
  positionId: z.string().max(36).optional(),
});

/** OSGB dosyası (Excel / CSV, kararlar #226–229). Yetki, kapsam ve TC kuralı serviste; her indirme kayda geçer. */
export async function GET(req: NextRequest) {
  const q = query.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!q.success) return new NextResponse(null, { status: 400 });
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return new NextResponse(null, { status: 401 });
  try {
    const filters = await parseFilters("ohs", q.data);
    const file = await exportOsgb(toActor(user), filters, q.data.format, user.locale);
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
