/**
 * Arka plan işleri süreci (pg-boss). Web uygulamasından ayrı çalışır: `npm run worker`
 * Video dönüştürme, PDF üretimi, bildirimler ve zamanlanmış işler burada işlenir.
 */
import { closeDb } from "@/server/db/client";
import { env } from "@/server/env";
import { createBoss } from "@/server/jobs/boss";
import { registerJobs } from "@/server/jobs/registry";
import { logger } from "@/server/logger";

async function main() {
  const boss = createBoss(env().DATABASE_URL, { schedule: true, supervise: true });
  await boss.start();
  await registerJobs(boss);
  logger.info("Worker başladı");

  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    logger.info({ signal }, "Worker kapanıyor");
    try {
      await boss.stop({ graceful: true, timeout: 30_000 });
      await closeDb();
    } finally {
      process.exit(0);
    }
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.fatal({ err }, "Worker başlatılamadı");
  process.exit(1);
});
