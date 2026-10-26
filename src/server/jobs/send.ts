import type { PgBoss } from "pg-boss";
import { env } from "@/server/env";
import { createBoss } from "./boss";
import { QUEUE_OPTIONS, type QueueName } from "./queues";

/**
 * Uygulamadan (web) iş göndermek için pg-boss örneği. Yalnızca gönderir; işleri worker süreci işler.
 * İlk kullanımda başlatılır; geliştirmede hot reload sırasında tekrar oluşturulmaz.
 */
const globalForJobs = globalThis as unknown as { __akademiBoss?: Promise<PgBoss> };

function sender(): Promise<PgBoss> {
  globalForJobs.__akademiBoss ??= (async () => {
    const boss = createBoss(env().DATABASE_URL);
    await boss.start();
    return boss;
  })();
  return globalForJobs.__akademiBoss;
}

export async function enqueue(name: QueueName, data: object, opts: { startAfter?: Date } = {}): Promise<string | null> {
  const boss = await sender();
  return boss.send(name, data, { ...(QUEUE_OPTIONS[name] ?? {}), ...opts });
}

/** Testler ve kapanış için. */
export async function stopJobSender(): Promise<void> {
  const pending = globalForJobs.__akademiBoss;
  globalForJobs.__akademiBoss = undefined;
  if (pending) await (await pending).stop({ graceful: false });
}
