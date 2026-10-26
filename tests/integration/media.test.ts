import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { mediaAssets } from "@/server/db/schema";
import { stopJobSender } from "@/server/jobs/send";
import { createContent, saveDraft, submitForApproval } from "@/server/services/content";
import { completeUpload, getAssetForViewer, PART_SIZE, startUpload, type UploadPlan } from "@/server/services/media";
import { buildMasterPlaylist, rewriteMediaPlaylist, segmentTtlSeconds } from "@/server/services/media/hls";
import { ffmpegAvailable, generateTestVideo, processMediaAsset } from "@/server/services/media/process";
import { getObjectText, headObject, signedGetUrl } from "@/server/storage/client";
import { owner } from "../support/db";
import { seedContentPeople } from "../support/content";

const hasFfmpeg = await ffmpegAvailable();

afterAll(async () => {
  await stopJobSender();
});

async function putSingle(plan: UploadPlan, body: Uint8Array, mime: string) {
  if (plan.mode !== "single") throw new Error("single bekleniyordu");
  const res = await fetch(plan.url, { method: "PUT", body: new Uint8Array(body), headers: { "Content-Type": mime } });
  expect(res.ok).toBe(true);
}

async function upload(actor: Parameters<typeof startUpload>[0], kind: "image" | "pdf" | "video", mime: string, body: Uint8Array, fileName: string) {
  const plan = await startUpload(actor, { kind, mime, size: body.byteLength, fileName });
  await putSingle(plan, body, mime);
  await completeUpload(actor, { assetId: plan.assetId });
  return plan.assetId;
}

async function asset(id: string) {
  const [row] = await db().select().from(mediaAssets).where(eq(mediaAssets.id, id));
  return row!;
}

describe("FG-2.1 medya yükleme ve işleme", () => {
  it("görsel: WebP'ye çevrilir, en fazla 2000 px, EXIF/konum silinir, önizleme üretilir", async () => {
    const p = await seedContentPeople();
    const jpeg = await sharp({ create: { width: 3000, height: 1500, channels: 3, background: "#c33" } })
      .jpeg()
      .withExif({ IFD0: { Make: "Gizli Kamera", Model: "X" } })
      .toBuffer();
    expect((await sharp(jpeg).metadata()).exif).toBeDefined();

    const id = await upload(p.smUretim.actor, "image", "image/jpeg", jpeg, "foto.jpg");
    expect((await asset(id)).status).toBe("uploaded");
    // İş kuyruğa alındı
    const jobs = await db().execute<{ data: { assetId: string } }>(sql`select data from pgboss.job where name = 'media.process'`);
    expect(jobs.map((j) => j.data.assetId)).toContain(id);

    await processMediaAsset(id);
    const a = await asset(id);
    expect(a).toMatchObject({ status: "ready", width: 2000, height: 1000 });
    const download = async (key: string) => Buffer.from(await (await fetch(await signedGetUrl(key))).arrayBuffer());
    const meta = await sharp(await download(a.derived.webpKey!)).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.exif).toBeUndefined();
    expect(meta.width).toBe(2000);
    expect((await sharp(await download(a.derived.thumbKey!)).metadata()).width).toBe(480);
  });

  it("PDF: sayfa sayısı okunur", async () => {
    const p = await seedContentPeople();
    const doc = await PDFDocument.create();
    for (let i = 0; i < 3; i++) doc.addPage();
    const id = await upload(p.smUretim.actor, "pdf", "application/pdf", await doc.save(), "talimat.pdf");
    await processMediaAsset(id);
    expect(await asset(id)).toMatchObject({ status: "ready", pageCount: 3 });
  });

  it("bozuk dosya: son denemede 'failed' olur, öncesinde yeniden denenir", async () => {
    const p = await seedContentPeople();
    const id = await upload(p.smUretim.actor, "pdf", "application/pdf", new TextEncoder().encode("pdf değil"), "bozuk.pdf");
    await expect(processMediaAsset(id, { final: false })).rejects.toThrow();
    expect((await asset(id)).status).toBe("uploaded");
    await processMediaAsset(id, { final: true });
    const a = await asset(id);
    expect(a.status).toBe("failed");
    expect(a.error).toBeTruthy();
  });

  it("dosya türü ve boyut sınırları (settings) uygulanır; eksik yükleme tamamlanamaz", async () => {
    const p = await seedContentPeople();
    await expect(startUpload(p.smUretim.actor, { kind: "image", mime: "image/gif", size: 10, fileName: "a.gif" })).rejects.toMatchObject({ code: "file_type_not_allowed" });
    await owner()`insert into settings (key, value) values ('upload.max_image_mb', '1'::jsonb) on conflict (key) do update set value = excluded.value`;
    await expect(startUpload(p.smUretim.actor, { kind: "image", mime: "image/png", size: 2 * 1024 * 1024, fileName: "b.png" })).rejects.toMatchObject({ code: "upload_too_large" });
    await expect(startUpload(p.personnel.actor, { kind: "pdf", mime: "application/pdf", size: 10, fileName: "c.pdf" })).rejects.toMatchObject({ code: "forbidden" });

    const plan = await startUpload(p.smUretim.actor, { kind: "pdf", mime: "application/pdf", size: 100, fileName: "d.pdf" });
    await putSingle(plan, new Uint8Array(50), "application/pdf");
    await expect(completeUpload(p.smUretim.actor, { assetId: plan.assetId })).rejects.toMatchObject({ code: "upload_incomplete" });
    await expect(completeUpload(p.smKalite.actor, { assetId: plan.assetId })).rejects.toMatchObject({ code: "forbidden" });
  });

  it("büyük dosyalar 16 MB'lık parçalarla yüklenir", async () => {
    const p = await seedContentPeople();
    const size = 64 * 1024 * 1024 + 10;
    const plan = await startUpload(p.smUretim.actor, { kind: "video", mime: "video/mp4", size, fileName: "uzun.mp4" });
    expect(plan.mode).toBe("multipart");
    if (plan.mode !== "multipart") return;
    expect(plan.partUrls).toHaveLength(Math.ceil(size / PART_SIZE));
    const parts = [];
    for (const [i, url] of plan.partUrls.entries()) {
      const len = Math.min(PART_SIZE, size - i * PART_SIZE);
      const res = await fetch(url, { method: "PUT", body: new Uint8Array(len) });
      expect(res.ok).toBe(true);
      parts.push({ partNumber: i + 1, etag: res.headers.get("etag")! });
    }
    await completeUpload(p.smUretim.actor, { assetId: plan.assetId, parts });
    expect((await headObject((await asset(plan.assetId)).objectKey))?.size).toBe(size);
  });

  it("medyaya erişim: yükleyen veya medyanın kullanıldığı içeriği görebilen", async () => {
    const p = await seedContentPeople();
    const doc = await PDFDocument.create();
    doc.addPage();
    const id = await upload(p.smUretim.actor, "pdf", "application/pdf", await doc.save(), "pres.pdf");
    await processMediaAsset(id);
    expect(await getAssetForViewer(p.trainerPres.actor, id)).toBeNull();

    const c = await createContent(p.smUretim.actor, { type: "pdf", title: "Pres PDF", ownerOrgUnitId: p.org.units.pres, commonTarget: null, isOhs: false });
    // Başkasının yüklediği medya içeriğe eklenemez
    await expect(saveDraft(p.smKalite.actor, c.id, { title: "Başlık", body: { assetId: id }, tagIds: [] })).rejects.toMatchObject({ code: "not_found" });
    const common = await createContent(p.hr.actor, { type: "pdf", title: "Ortak", ownerOrgUnitId: null, commonTarget: "all", isOhs: false });
    await expect(saveDraft(p.hr.actor, common.id, { title: "Ortak", body: { assetId: id }, tagIds: [] })).rejects.toMatchObject({ code: "asset_invalid" });
    await saveDraft(p.smUretim.actor, c.id, { title: "Pres PDF", body: { assetId: id }, tagIds: [] });
    await submitForApproval(p.smUretim.actor, c.id, { changeNote: null, requireReread: false });

    expect(await getAssetForViewer(p.trainerPres.actor, id)).not.toBeNull();
    expect(await getAssetForViewer(p.trainerKalite.actor, id)).toBeNull();
    expect(await getAssetForViewer(p.hr.actor, id)).not.toBeNull();
    expect(await getAssetForViewer(p.sysadmin.actor, id)).toBeNull();
  });

  it("içerik tipine uymayan medya reddedilir; hazır olmayan medyayla onaya gönderilemez", async () => {
    const p = await seedContentPeople();
    const plan = await startUpload(p.smUretim.actor, { kind: "pdf", mime: "application/pdf", size: 10, fileName: "x.pdf" });
    const c = await createContent(p.smUretim.actor, { type: "video", title: "Video", ownerOrgUnitId: p.org.units.pres, commonTarget: null, isOhs: false });
    await expect(saveDraft(p.smUretim.actor, c.id, { title: "Video", body: { assetId: plan.assetId }, tagIds: [] })).rejects.toMatchObject({ code: "asset_kind_invalid" });

    const pdf = await createContent(p.smUretim.actor, { type: "pdf", title: "PDF", ownerOrgUnitId: p.org.units.pres, commonTarget: null, isOhs: false });
    await saveDraft(p.smUretim.actor, pdf.id, { title: "PDF", body: { assetId: plan.assetId }, tagIds: [] });
    await expect(submitForApproval(p.smUretim.actor, pdf.id, { changeNote: null, requireReread: false })).rejects.toMatchObject({ code: "assets_not_ready" });
  });

  it.runIf(hasFfmpeg)("video: HLS 360p + 720p, süre ve kapak üretilir; oynatma listesi imzalı segmentlerle yeniden yazılır", async () => {
    const p = await seedContentPeople();
    const dir = await mkdtemp(path.join(tmpdir(), "akademi-test-"));
    try {
      const file = path.join(dir, "test.mp4");
      await generateTestVideo(file, 3);
      const id = await upload(p.smUretim.actor, "video", "video/mp4", await readFile(file), "test.mp4");
      await processMediaAsset(id);
      const a = await asset(id);
      expect(a.status).toBe("ready");
      expect(a.durationSec).toBe(3);
      expect(a.derived.renditions?.map((r) => r.name)).toEqual(["360p", "720p"]);
      expect(a.derived.posterKey).toBeTruthy();

      const master = buildMasterPlaylist(a.derived.renditions!);
      expect(master).toContain("360p.m3u8");
      expect(master).toContain("RESOLUTION=1280x720");

      const raw = await getObjectText(`${a.derived.hlsPrefix}/720p.m3u8`);
      expect(raw).toMatch(/720p_0000\.ts/);
      const rewritten = await rewriteMediaPlaylist(raw!, "720p", (seg) => signedGetUrl(`${a.derived.hlsPrefix}/${seg}`, segmentTtlSeconds(a.durationSec)));
      const firstSegment = rewritten.split("\n").find((l) => l.startsWith("http"))!;
      expect(firstSegment).toContain("X-Amz-Expires=3600");
      const seg = await fetch(firstSegment);
      expect(seg.ok).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 120_000);
});
