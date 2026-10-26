import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/server/auth/current-user";
import { toActor } from "@/server/services/auth";
import { getAssetForViewer } from "@/server/services/media";
import { buildMasterPlaylist, isRenditionName, rewriteMediaPlaylist, segmentTtlSeconds } from "@/server/services/media/hls";
import { getObjectText, signedGetUrl } from "@/server/storage/client";

const params = z.object({ assetId: z.uuid(), file: z.string().regex(/^[a-z0-9]{1,16}\.m3u8$/) });

const headers = { "Content-Type": "application/vnd.apple.mpegurl", "Cache-Control": "private, no-store" };

/** Video oynatma listeleri: master.m3u8 ve kalite listeleri (segmentler imzalı URL). */
export async function GET(_req: Request, ctx: { params: Promise<{ assetId: string; file: string }> }) {
  const parsed = params.safeParse(await ctx.params);
  if (!parsed.success) return new NextResponse(null, { status: 404 });
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return new NextResponse(null, { status: 401 });

  const asset = await getAssetForViewer(toActor(user), parsed.data.assetId);
  const renditions = asset?.derived.renditions ?? [];
  const prefix = asset?.derived.hlsPrefix;
  if (!asset || asset.kind !== "video" || asset.status !== "ready" || !prefix || renditions.length === 0) {
    return new NextResponse(null, { status: 404 });
  }

  const name = parsed.data.file.replace(/\.m3u8$/, "");
  if (name === "master") return new NextResponse(buildMasterPlaylist(renditions), { headers });
  if (!isRenditionName(name, renditions)) return new NextResponse(null, { status: 404 });

  const playlist = await getObjectText(`${prefix}/${name}.m3u8`);
  if (!playlist) return new NextResponse(null, { status: 404 });
  const ttl = segmentTtlSeconds(asset.durationSec);
  const body = await rewriteMediaPlaylist(playlist, name, (segment) => signedGetUrl(`${prefix}/${segment}`, ttl));
  return new NextResponse(body, { headers });
}
