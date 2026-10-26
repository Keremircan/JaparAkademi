import { PgBoss } from "pg-boss";
import { PGBOSS_SCHEMA } from "@/server/db/migrate";
import { logger } from "@/server/logger";

/**
 * pg-boss örneği. Şema `npm run db:migrate` ile kurulur; burada migration ve şema oluşturma kapalıdır
 * (uygulama kullanıcısı yalnızca kendi pgboss şemasında çalışır).
 */
export function createBoss(connectionString: string, opts: { schedule?: boolean; supervise?: boolean } = {}) {
  const boss = new PgBoss({
    connectionString,
    schema: PGBOSS_SCHEMA,
    createSchema: false,
    migrate: false,
    schedule: opts.schedule ?? false,
    supervise: opts.supervise ?? false,
    application_name: "japar-akademi-jobs",
  });
  boss.on("error", (err) => logger.error({ err }, "pg-boss hatası"));
  return boss;
}
