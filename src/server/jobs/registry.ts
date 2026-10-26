import type { PgBoss } from "pg-boss";
import { sql } from "drizzle-orm";
import { systemActor } from "@/server/authz/actor";
import { db } from "@/server/db/client";
import { logger } from "@/server/logger";
import { cleanupStaleImports } from "@/server/services/imports";

/**
 * Kuyruklar ve işleyicileri. Her iş paketi kendi işlerini buraya ekler
 * (ör. 1.2: video dönüştürme, 1.7: sertifika PDF, 1.8: bildirimler).
 * Zamanlamalar Europe/Istanbul saat dilimine göredir.
 */
export const QUEUES = {
  /** Worker'ın ayakta olduğunu ve veritabanına eriştiğini doğrulayan periyodik iş. */
  heartbeat: "system.heartbeat",
  /** Onaylanmamış Excel aktarımlarının kişisel verisini 24 saat sonra siler (FG-1.4). */
  importsCleanup: "imports.cleanup",
} as const;

export async function registerJobs(boss: PgBoss) {
  await boss.createQueue(QUEUES.heartbeat);
  await boss.work(QUEUES.heartbeat, async () => {
    await db().execute(sql`select 1`);
    logger.debug("Worker heartbeat");
  });
  await boss.schedule(QUEUES.heartbeat, "*/5 * * * *", null, { tz: "Europe/Istanbul" });

  await boss.createQueue(QUEUES.importsCleanup);
  await boss.work(QUEUES.importsCleanup, async () => {
    const n = await cleanupStaleImports(systemActor("worker:imports.cleanup"));
    if (n > 0) logger.info({ batches: n }, "Onaylanmamış aktarımlar temizlendi");
  });
  await boss.schedule(QUEUES.importsCleanup, "15 * * * *", null, { tz: "Europe/Istanbul" });
}
