import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/server/auth/current-user";
import { toActor } from "@/server/services/auth";
import { getAssetForViewer } from "@/server/services/media";
import { signedGetUrl } from "@/server/storage/client";

const params = z.object({
  assetId: z.uuid(),
  variant: z.enum(["file", "download", "image", "thumb", "poster"]),
});

/**
 * Medya erişimi: yetki kontrolünden sonra kısa süreli (5 dk) imzalı URL'e yönlendirir.
 *  - file: özgün dosya (PDF görüntüleme)   - download: indirme (özgün ad)
 *  - image / thumb: işlenmiş görsel        - poster: video kapağı
 */
export async function GET(_req: Request, ctx: { params: Promise<{ assetId: string; variant: string }> }) {
  const parsed = params.safeParse(await ctx.params);
  if (!parsed.success) return new NextResponse(null, { status: 404 });
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return new NextResponse(null, { status: 401 });

  const asset = await getAssetForViewer(toActor(user), parsed.data.assetId);
  if (!asset || asset.status === "pending_upload" || asset.status === "purged") return new NextResponse(null, { status: 404 });

  const { variant } = parsed.data;
  const key =
    variant === "image"
      ? asset.derived.webpKey
      : variant === "thumb"
        ? asset.derived.thumbKey
        : variant === "poster"
          ? asset.derived.posterKey
          : asset.objectKey;
  if (!key) return new NextResponse(null, { status: 404 });

  const url = await signedGetUrl(key, undefined, {
    downloadName: variant === "download" ? asset.originalName : undefined,
    contentType: variant === "file" || variant === "download" ? asset.mime : undefined,
  });
  return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "private, no-store" } });
}
