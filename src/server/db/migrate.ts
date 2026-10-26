import path from "node:path";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { PgBoss } from "pg-boss";
import { QUEUE_OPTIONS, QUEUES } from "@/server/jobs/queues";
import { createDb } from "./client";

export const PGBOSS_SCHEMA = "pgboss";

/** Drizzle migration'larını ve pg-boss şemasını uygular. Betikler ve entegrasyon testleri kullanır. */
export async function migrateDatabase(opts: {
  ownerUrl: string;
  appUrl: string;
  log?: (msg: string) => void;
}) {
  const log = opts.log ?? (() => {});

  const owner = createDb(opts.ownerUrl, { max: 1 });
  try {
    await migrate(owner.db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
    log("✓ Drizzle migration'ları uygulandı");
  } finally {
    await owner.client.end({ timeout: 5 });
  }

  // pg-boss şeması akademi_app'e aittir (0000_foundation); tabloları onun kullanıcısıyla kurulur.
  const boss = new PgBoss({
    connectionString: opts.appUrl,
    schema: PGBOSS_SCHEMA,
    createSchema: false,
    migrate: true,
    supervise: false,
    schedule: false,
  });
  boss.on("error", (err) => log(`pg-boss hata: ${String(err)}`));
  await boss.start();
  // Kuyruklar burada oluşturulur: uygulama, worker çalışmasa da iş gönderebilir
  for (const name of Object.values(QUEUES)) {
    const options = QUEUE_OPTIONS[name];
    if (!(await boss.getQueue(name))) await boss.createQueue(name, options ?? {});
    else if (options) await boss.updateQueue(name, options);
  }
  await boss.stop({ graceful: false });
  log("✓ pg-boss şeması ve kuyruklar hazır");
}
