import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth/current-user";
import { can } from "@/server/authz/policy";
import { toActor } from "@/server/services/auth";
import { priorTemplate } from "@/server/services/assignments/periodic";

/** Son eğitim tarihleri şablonu (karar #223): tarihi girilmemiş kişi × süreli modül satırları. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return new NextResponse(null, { status: 401 });
  const actor = toActor(user);
  if (!can(actor, "periodic.record")) return new NextResponse(null, { status: 404 });
  const xlsx = await priorTemplate(actor);
  return new NextResponse(new Uint8Array(xlsx), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="son-egitim-tarihleri.xlsx"',
      "Cache-Control": "private, no-store",
    },
  });
}
