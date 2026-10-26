import { spawn } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { systemActor } from "@/server/authz/actor";
import { db } from "@/server/db/client";
import { mediaAssets, type MediaDerived } from "@/server/db/schema";
import { withActor } from "@/server/db/with-actor";
import { logger } from "@/server/logger";
import { deletePrefix, downloadToFile, uploadBuffer, uploadFile } from "@/server/storage/client";

/**
 * Worker: yüklenen medyanın işlenmesi (SPEC 4.2, 11.5).
 *  - Görsel: EXIF/konum silinir, en fazla 2000 px WebP + 480 px önizleme
 *  - PDF: sayfa sayısı
 *  - Video: ffmpeg ile HLS (360p + 720p; kaynaktan büyük kalite üretilmez), süre ve kapak
 *  - Doküman: işlem yok
 */

const actor = systemActor("worker:media.process");
const IMAGE_MAX = 2000;
const THUMB_MAX = 480;

type Rendition = { name: string; height: number; videoKbps: number };
const RENDITIONS: Rendition[] = [
  { name: "360p", height: 360, videoKbps: 800 },
  { name: "720p", height: 720, videoKbps: 2500 },
];
const AUDIO_KBPS = 96;

function ffmpegPath() {
  return process.env.FFMPEG_PATH || "ffmpeg";
}
function ffprobePath() {
  return process.env.FFPROBE_PATH || "ffprobe";
}

function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { windowsHide: true });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err = (err + d).slice(-4000)));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(`${path.basename(cmd)} çıkış ${code}: ${err}`))));
  });
}

async function update(assetId: string, values: Partial<typeof mediaAssets.$inferInsert>) {
  await withActor(actor, (tx) => tx.update(mediaAssets).set(values).where(eq(mediaAssets.id, assetId)));
}

async function processImage(assetId: string, input: string, dir: string) {
  // sharp varsayılan olarak meta verileri (EXIF, konum) yazmaz; rotate() EXIF yönünü uygular
  const image = sharp(input, { failOn: "error" }).rotate();
  const webp = path.join(dir, "image.webp");
  const info = await image
    .clone()
    .resize({ width: IMAGE_MAX, height: IMAGE_MAX, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(webp);
  const thumb = await image
    .clone()
    .resize({ width: THUMB_MAX, height: THUMB_MAX, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 75 })
    .toBuffer();
  const webpKey = `media/${assetId}/image.webp`;
  const thumbKey = `media/${assetId}/thumb.webp`;
  await uploadFile(webpKey, webp, "image/webp");
  await uploadBuffer(thumbKey, thumb, "image/webp");
  return { derived: { webpKey, thumbKey } satisfies MediaDerived, width: info.width, height: info.height };
}

async function processPdf(input: string) {
  const doc = await PDFDocument.load(await readFile(input), { ignoreEncryption: true, updateMetadata: false });
  return { pageCount: doc.getPageCount() };
}

async function probe(input: string): Promise<{ duration: number; width: number; height: number; hasAudio: boolean }> {
  const json = JSON.parse(
    await run(ffprobePath(), ["-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height", "-of", "json", input]),
  ) as { format?: { duration?: string }; streams?: { codec_type?: string; width?: number; height?: number }[] };
  const video = json.streams?.find((s) => s.codec_type === "video");
  if (!video?.width || !video.height) throw new Error("Video akışı bulunamadı");
  return {
    duration: Math.round(Number(json.format?.duration ?? 0)),
    width: video.width,
    height: video.height,
    hasAudio: !!json.streams?.some((s) => s.codec_type === "audio"),
  };
}

async function processVideo(assetId: string, input: string, dir: string) {
  const meta = await probe(input);
  // Kaynaktan büyük kalite üretilmez; kaynak 360p'den küçükse tek kalite (kaynak yüksekliği)
  let renditions = RENDITIONS.filter((r) => r.height <= meta.height);
  if (renditions.length === 0) renditions = [{ name: "low", height: meta.height - (meta.height % 2), videoKbps: 600 }];

  const hlsPrefix = `media/${assetId}/hls`;
  for (const r of renditions) {
    const out = path.join(dir, r.name);
    await run(ffmpegPath(), ["-hide_banner", "-loglevel", "error", "-y", "-i", input, "-map", "0:v:0", "-map", "0:a:0?",
      "-vf", `scale=-2:${r.height}`, "-c:v", "libx264", "-preset", "veryfast", "-profile:v", "main",
      "-b:v", `${r.videoKbps}k`, "-maxrate", `${Math.round(r.videoKbps * 1.2)}k`, "-bufsize", `${r.videoKbps * 2}k`,
      "-g", "48", "-keyint_min", "48", "-sc_threshold", "0",
      "-c:a", "aac", "-b:a", `${AUDIO_KBPS}k`, "-ac", "2",
      "-f", "hls", "-hls_time", "6", "-hls_playlist_type", "vod",
      "-hls_segment_filename", path.join(dir, `${r.name}_%04d.ts`), `${out}.m3u8`,
    ]);
  }

  // Kapak görseli (1. saniyeden; video daha kısaysa ilk kare)
  const posterJpg = path.join(dir, "poster.jpg");
  await run(ffmpegPath(), ["-hide_banner", "-loglevel", "error", "-y", "-ss", meta.duration > 1 ? "1" : "0", "-i", input,
    "-frames:v", "1", "-vf", "scale=-2:720", posterJpg]);
  const posterKey = `media/${assetId}/poster.webp`;
  await uploadBuffer(posterKey, await sharp(posterJpg).webp({ quality: 75 }).toBuffer(), "image/webp");

  for (const file of await readdir(dir)) {
    if (file.endsWith(".ts")) await uploadFile(`${hlsPrefix}/${file}`, path.join(dir, file), "video/mp2t", "private, max-age=31536000, immutable");
    if (file.endsWith(".m3u8")) await uploadFile(`${hlsPrefix}/${file}`, path.join(dir, file), "application/vnd.apple.mpegurl");
  }

  const derived: MediaDerived = {
    hlsPrefix,
    posterKey,
    renditions: renditions.map((r) => ({
      name: r.name,
      height: r.height,
      bandwidth: (r.videoKbps + (meta.hasAudio ? AUDIO_KBPS : 0)) * 1000,
    })),
  };
  const playlistBytes = (await stat(path.join(dir, `${renditions[0]!.name}.m3u8`))).size;
  logger.debug({ assetId, playlistBytes }, "HLS üretildi");
  return { derived, durationSec: meta.duration, width: meta.width, height: meta.height };
}

/**
 * Bir medyayı işler. Hata olursa `final` ise durum "failed" olur (yeniden deneme bitti),
 * değilse hata fırlatılır ve pg-boss yeniden dener.
 */
export async function processMediaAsset(assetId: string, opts: { final?: boolean } = { final: true }): Promise<void> {
  const [asset] = await db().select().from(mediaAssets).where(eq(mediaAssets.id, assetId)).limit(1);
  if (!asset) return;
  if (asset.status === "ready" || asset.status === "pending_upload") return;

  await update(assetId, { status: "processing", error: null });
  const dir = await mkdtemp(path.join(tmpdir(), "akademi-media-"));
  try {
    const input = path.join(dir, `original${path.extname(asset.objectKey)}`);
    await downloadToFile(asset.objectKey, input);

    if (asset.kind === "image") {
      const r = await processImage(assetId, input, dir);
      await update(assetId, { status: "ready", derived: r.derived, width: r.width, height: r.height });
    } else if (asset.kind === "pdf") {
      const r = await processPdf(input);
      await update(assetId, { status: "ready", pageCount: r.pageCount });
    } else if (asset.kind === "video") {
      await deletePrefix(`media/${assetId}/hls/`);
      const r = await processVideo(assetId, input, dir);
      await update(assetId, { status: "ready", ...r });
    } else {
      if (asset.mime === "application/pdf") await update(assetId, { status: "ready", ...(await processPdf(input)) });
      else await update(assetId, { status: "ready" });
    }
    logger.info({ assetId, kind: asset.kind }, "Medya işlendi");
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 500) : String(err);
    logger.error({ assetId, err: message }, "Medya işlenemedi");
    await update(assetId, { status: opts.final ? "failed" : "uploaded", error: message });
    if (!opts.final) throw err;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Testler için: küçük bir video dosyası üretir (ffmpeg gerekir). */
export async function generateTestVideo(filePath: string, seconds = 3): Promise<void> {
  await run(ffmpegPath(), ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", `testsrc=size=1280x720:rate=24:duration=${seconds}`,
    "-f", "lavfi", "-i", `sine=frequency=440:duration=${seconds}`, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", filePath]);
}

export async function ffmpegAvailable(): Promise<boolean> {
  try {
    await run(ffmpegPath(), ["-version"]);
    return true;
  } catch {
    return false;
  }
}
