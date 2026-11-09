import { AsyncLocalStorage } from "node:async_hooks";
import { sql, type SQL } from "drizzle-orm";

/**
 * Örnek veri (kararlar #296–297).
 * Sessiz kip: yükleyici bütün işlemleri bu bağlamda çalıştırır; bildirim yalnızca örnek kişilere yazılır,
 * gerçek kişilere uygulama içi bildirim, e-posta ya da push gitmez.
 */
type SampleContext = { userIds: Set<string> };

const storage = new AsyncLocalStorage<SampleContext>();

export function runQuietly<T>(ctx: SampleContext, fn: () => Promise<T>): Promise<T> {
  return storage.run(ctx, fn);
}

/** Sessiz kipteyse alıcılardan örnek olmayanları çıkarır; değilse listeyi olduğu gibi döner. */
export function quietRecipients(userIds: readonly string[]): string[] {
  const ctx = storage.getStore();
  return ctx ? userIds.filter((id) => ctx.userIds.has(id)) : [...userIds];
}

/** Zamanlanmış işler örnek kişileri atlar: verilen kişi sütunu örnek kişi değilse doğru. */
export function notSamplePerson(userIdColumn: SQL): SQL {
  return sql`not exists (select 1 from sample_records sr where sr.table_name = 'users' and sr.record_id = ${userIdColumn})`;
}
