import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/server/auth/current-user";
import { AppError } from "@/server/errors";
import { toActor } from "@/server/services/auth";
import { questionTemplate } from "@/server/services/questions/import";

const params = z.object({ owner: z.union([z.literal("common"), z.uuid()]), ohs: z.enum(["0", "1"]).default("0") });

/** Soru aktarım şablonu: hedef birimin modül listesiyle. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = params.safeParse({ owner: url.searchParams.get("owner"), ohs: url.searchParams.get("ohs") ?? undefined });
  if (!parsed.success) return new NextResponse(null, { status: 400 });
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return new NextResponse(null, { status: 401 });
  try {
    const xlsx = await questionTemplate(toActor(user), {
      ownerOrgUnitId: parsed.data.owner === "common" ? null : parsed.data.owner,
      isOhs: parsed.data.owner === "common" || parsed.data.ohs === "1",
    });
    return new NextResponse(new Uint8Array(xlsx), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="soru-aktarim-sablonu.xlsx"',
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    if (err instanceof AppError) return new NextResponse(null, { status: 404 });
    throw err;
  }
}
