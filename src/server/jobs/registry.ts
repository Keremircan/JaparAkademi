import type { PgBoss } from "pg-boss";
import { sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { logger } from "@/server/logger";

/**
 * Kuyruklar ve işleyicileri. Her iş paketi kendi işlerini buraya ekler
 * (ör. 1.2: video dönüştürme, 1.7: sertifika PDF, 1.8: bildirimler).
 */
export const QUEUES = {
  /** Worker'ın ayakta olduğunu ve veritabanına eriştiğini doğrulayan periyodik iş. */
  heartbeat: "system.heartbeat",
} as const;

export async function registerJobs(boss: PgBoss) {
  await boss.createQueue(QUEUES.heartbeat);
  await boss.work(QUEUES.heartbeat, async () => {
    await db().execute(sql`select 1`);
    logger.debug("Worker heartbeat");
  });
  // Her 5 dakikada bir (zamanlamalar Europe/Istanbul saat dilimine göre)
  await boss.schedule(QUEUES.heartbeat, "*/5 * * * *", null, { tz: "Europe/Istanbul" });
}
