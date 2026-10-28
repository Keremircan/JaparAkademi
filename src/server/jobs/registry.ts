import type { PgBoss } from "pg-boss";
import { sql } from "drizzle-orm";
import { systemActor } from "@/server/authz/actor";
import { db } from "@/server/db/client";
import { logger } from "@/server/logger";
import { cleanupStaleImports } from "@/server/services/imports";
import { processMediaAsset } from "@/server/services/media/process";
import { finalizeExpiredAttempt } from "@/server/services/exams";
import { renderCertificate } from "@/server/services/certificates/render";
import { dispatchEmails } from "@/server/services/notifications/dispatch";
import { purgeOldNotifications } from "@/server/services/notifications";
import { runRetention } from "@/server/services/retention";
import { env } from "@/server/env";
import { QUEUE_OPTIONS, QUEUES } from "./queues";

/**
 * Kuyruklar ve işleyicileri. Her iş paketi kendi işlerini buraya ekler
 * (ör. 1.2: video dönüştürme, 1.7: sertifika PDF, 1.8: bildirimler).
 * Zamanlamalar Europe/Istanbul saat dilimine göredir.
 */
export { QUEUES };

export async function registerJobs(boss: PgBoss) {
  // Süresi dolan sınav: verilen cevaplarla teslim (kullanıcı sayfayı kapatmış olsa da)
  await boss.work<{ attemptId: string }>(QUEUES.examTimeout, async ([job]) => {
    if (job) await finalizeExpiredAttempt(job.data.attemptId);
  });

  // Sertifika / katılım belgesi PDF'i (FG-7.2)
  await boss.work<{ certificateId: string }>(QUEUES.certificateRender, { batchSize: 1 }, async ([job]) => {
    if (job) await renderCertificate(job.data.certificateId);
  });

  // E-posta kuyruğu (dakikada bir) ve bildirim saklama süresi (her gece)
  if (env().MAIL_TRANSPORT === "log") logger.warn("MAIL_TRANSPORT=log: e-postalar gönderilmiyor, yalnızca loga yazılıyor");
  await boss.work(QUEUES.mailDispatch, { batchSize: 1 }, async () => {
    const r = await dispatchEmails();
    if (r.sent || r.failed) logger.info(r, "E-posta kuyruğu işlendi");
  });
  await boss.schedule(QUEUES.mailDispatch, "* * * * *", null, { tz: "Europe/Istanbul" });
  await boss.work(QUEUES.notificationsPurge, async () => {
    const n = await purgeOldNotifications(systemActor("worker:notifications.purge"));
    if (n > 0) logger.info({ notifications: n }, "Eski bildirimler silindi");
  });
  await boss.schedule(QUEUES.notificationsPurge, "30 3 * * *", null, { tz: "Europe/Istanbul" });

  // Saklama süreleri (karar #120–125): bildirim temizliğinden sonra
  await boss.work(QUEUES.retention, { batchSize: 1 }, async () => {
    const r = await runRetention(systemActor("worker:retention"));
    if (r.anonymized || r.images || r.auditRows || r.visitors || r.blacklist) logger.info(r, "Saklama süresi işleri tamamlandı");
  });
  await boss.schedule(QUEUES.retention, "45 3 * * *", null, { tz: "Europe/Istanbul" });

  await boss.work(QUEUES.heartbeat, async () => {
    await db().execute(sql`select 1`);
    logger.debug("Worker heartbeat");
  });
  await boss.schedule(QUEUES.heartbeat, "*/5 * * * *", null, { tz: "Europe/Istanbul" });

  await boss.work(QUEUES.importsCleanup, async () => {
    const n = await cleanupStaleImports(systemActor("worker:imports.cleanup"));
    if (n > 0) logger.info({ batches: n }, "Onaylanmamış aktarımlar temizlendi");
  });
  await boss.schedule(QUEUES.importsCleanup, "15 * * * *", null, { tz: "Europe/Istanbul" });

  // Medya işleme: CPU yoğun (ffmpeg), aynı anda tek iş
  await boss.work<{ assetId: string }>(QUEUES.mediaProcess, { batchSize: 1 }, async ([job]) => {
    if (job) await processMediaAsset(job.data.assetId, { final: job.retryCount >= (QUEUE_OPTIONS[QUEUES.mediaProcess]?.retryLimit ?? 0) });
  });
}
