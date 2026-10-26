/**
 * HLS oynatma listeleri (SPEC 11.5). Segmentler private bucket'tadır; oynatma listesi her istekte
 * yetki kontrolünden sonra imzalı segment URL'leriyle yeniden yazılır.
 *
 * İmza süresi istisnası: segment URL'leri 5 dakika yerine max(1 saat, video süresi × 2) geçerlidir;
 * aksi halde uzun videolarda oynatma ortasında URL'ler sona erer.
 */

export type Rendition = { name: string; height: number; bandwidth: number };

export const HLS_MIN_TTL_SECONDS = 60 * 60;

export function segmentTtlSeconds(durationSec: number | null | undefined): number {
  return Math.max(HLS_MIN_TTL_SECONDS, Math.ceil((durationSec ?? 0) * 2));
}

const NAME = /^[a-z0-9]{1,16}$/;

export function isRenditionName(name: string, renditions: readonly Rendition[]): boolean {
  return NAME.test(name) && renditions.some((r) => r.name === name);
}

/** Ana liste: kaliteler düşükten yükseğe; göreli URL'ler aynı rota altındaki kalite listelerine gider. */
export function buildMasterPlaylist(renditions: readonly Rendition[]): string {
  const lines = ["#EXTM3U", "#EXT-X-VERSION:3"];
  for (const r of [...renditions].sort((a, b) => a.height - b.height)) {
    const width = Math.round((r.height * 16) / 9 / 2) * 2;
    lines.push(`#EXT-X-STREAM-INF:BANDWIDTH=${r.bandwidth},RESOLUTION=${width}x${r.height},NAME="${r.name}"`, `${r.name}.m3u8`);
  }
  return `${lines.join("\n")}\n`;
}

/**
 * Kalite listesindeki segment satırlarını imzalı URL'lerle değiştirir. Yalnızca beklenen biçimdeki
 * segment adları imzalanır (`<kalite>_0001.ts`); başka satırlar olduğu gibi kalır.
 */
export async function rewriteMediaPlaylist(
  playlist: string,
  rendition: string,
  sign: (segmentFile: string) => Promise<string>,
): Promise<string> {
  const segment = new RegExp(`^${rendition}_\\d{1,6}\\.ts$`);
  const out: string[] = [];
  for (const raw of playlist.split(/\r?\n/)) {
    const line = raw.trim();
    if (line && !line.startsWith("#")) {
      if (!segment.test(line)) continue;
      out.push(await sign(line));
    } else {
      out.push(raw);
    }
  }
  return out.join("\n");
}
