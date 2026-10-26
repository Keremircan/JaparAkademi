import { NextResponse } from "next/server";
import { can } from "@/server/authz/policy";
import { getCurrentUser } from "@/server/auth/current-user";
import { toActor } from "@/server/services/auth";
import { buildImportTemplate } from "@/server/services/imports";

/** Boş personel aktarım şablonu (İK / sistem yöneticisi). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return new NextResponse(null, { status: 401 });
  const actor = toActor(user);
  if (!can(actor, "people.manage")) return new NextResponse(null, { status: 404 });

  const xlsx = await buildImportTemplate(actor);
  return new NextResponse(new Uint8Array(xlsx), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="personel-aktarim-sablonu.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
