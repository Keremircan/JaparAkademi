import { describe, expect, it } from "vitest";
import { bodyAssetIds, bodyText, parseBody } from "@/server/services/content/body";
import { buildMasterPlaylist, rewriteMediaPlaylist, segmentTtlSeconds } from "@/server/services/media/hls";

const id = "01900000-0000-7000-8000-000000000001";

describe("FG-2.1 içerik gövdeleri", () => {
  it("zengin metin yalnızca izinli düğüm ve işaretleri kabul eder", () => {
    const ok = { doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "a", marks: [{ type: "bold" }] }] }] } };
    expect(parseBody("text", ok, "strict").success).toBe(true);
    const script = { doc: { type: "doc", content: [{ type: "image", attrs: { src: "javascript:x" } }] } };
    expect(parseBody("text", script, "draft").success).toBe(false);
    const link = { doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "a", marks: [{ type: "link" }] }] }] } };
    expect(parseBody("text", link, "draft").success).toBe(false);
  });

  it("taslak eksik olabilir, onaya gönderim tam olmalı", () => {
    expect(parseBody("checklist", { items: [{ text: "" }] }, "draft").success).toBe(true);
    expect(parseBody("checklist", { items: [{ text: "" }] }, "strict").success).toBe(false);
    expect(parseBody("video", {}, "draft").success).toBe(true);
    expect(parseBody("video", {}, "strict").success).toBe(false);
    expect(parseBody("text", { doc: { type: "doc", content: [] } }, "strict").success).toBe(false);
  });

  it("medya kimlikleri ve arama metni çıkarılır", () => {
    expect(bodyAssetIds("instruction", { steps: [{ title: "a", assetId: id }, { title: "b" }] })).toEqual([id]);
    expect(bodyText("checklist", { items: [{ text: "Yağ" }, { text: "Hava" }] })).toBe("Yağ Hava");
  });
});

describe("HLS oynatma listeleri", () => {
  const renditions = [
    { name: "720p", height: 720, bandwidth: 2_596_000 },
    { name: "360p", height: 360, bandwidth: 896_000 },
  ];

  it("ana liste kaliteleri düşükten yükseğe sıralar", () => {
    const m = buildMasterPlaylist(renditions);
    expect(m.indexOf("360p.m3u8")).toBeLessThan(m.indexOf("720p.m3u8"));
    expect(m).toContain("RESOLUTION=640x360");
  });

  it("yalnızca beklenen segment adları imzalanır", async () => {
    const pl = "#EXTM3U\n#EXTINF:6.0,\n720p_0000.ts\n#EXTINF:6.0,\n../../gizli.ts\n#EXT-X-ENDLIST";
    const out = await rewriteMediaPlaylist(pl, "720p", async (s) => `https://imzali/${s}`);
    expect(out).toContain("https://imzali/720p_0000.ts");
    expect(out).not.toContain("gizli");
  });

  it("segment imza süresi en az 1 saat, uzun videoda süre × 2", () => {
    expect(segmentTtlSeconds(60)).toBe(3600);
    expect(segmentTtlSeconds(3000)).toBe(6000);
  });
});
