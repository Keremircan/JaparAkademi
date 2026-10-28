import { NextResponse } from "next/server";
import { z } from "zod";
import { visitorAssetUrl } from "@/server/services/visitors";

const params = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  assetId: z.uuid(),
  variant: z.enum(["image", "file", "poster"]),
});

/** Ziyaretçi ekranı kart görseli/videosu (iş paketi 2.3a): ziyaret belirteci + paket kartı kontrolü, imzalı yönlendirme. */
export async function GET(_req: Request, ctx: { params: Promise<{ token: string; assetId: string; variant: string }> }) {
  const parsed = params.safeParse(await ctx.params);
  if (!parsed.success) return new NextResponse(null, { status: 404 });
  const url = await visitorAssetUrl(parsed.data.token, parsed.data.assetId, parsed.data.variant);
  if (!url) return new NextResponse(null, { status: 404 });
  return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "private, no-store" } });
}
