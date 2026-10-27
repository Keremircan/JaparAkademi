import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/server/auth/current-user";
import { toActor } from "@/server/services/auth";
import { certificateFile } from "@/server/services/certificates";
import { signedGetUrl } from "@/server/storage/client";
import { getAssetForViewer } from "@/server/services/media";

/** Sertifika PDF'ini indirir (kursiyer kendisi, eğitmeni, kapsamdaki bölüm sorumlusu, İK). */
export async function GET(_req: NextRequest, { params }: RouteContext<"/api/certificates/[id]">) {
  const parsed = z.uuid().safeParse((await params).id);
  if (!parsed.success) return new NextResponse(null, { status: 404 });
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return new NextResponse(null, { status: 401 });
  const actor = toActor(user);
  const file = await certificateFile(actor, parsed.data);
  if (!file) return new NextResponse(null, { status: 404 });
  const asset = await getAssetForViewer(actor, file.assetId);
  if (!asset) return new NextResponse(null, { status: 404 });
  const url = await signedGetUrl(asset.objectKey, undefined, { downloadName: file.fileName, contentType: "application/pdf" });
  return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "private, no-store" } });
}
