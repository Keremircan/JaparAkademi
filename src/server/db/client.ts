import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/server/env";
import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
/** Hem doğrudan bağlantı hem transaction ile çalışan sorgular için. */
export type DbOrTx = Db | Tx;

export function createDb(url: string, options: { max?: number } = {}) {
  const client = postgres(url, {
    max: options.max ?? 10,
    onnotice: () => {},
    connection: { application_name: "japar-akademi" },
  });
  const db = drizzle({ client, schema, casing: "snake_case" });
  return { db, client };
}

// Geliştirmede hot reload sırasında bağlantı havuzunun çoğalmaması için global önbellek
const globalForDb = globalThis as unknown as { __akademiDb?: ReturnType<typeof createDb> };

export function db(): Db {
  globalForDb.__akademiDb ??= createDb(env().DATABASE_URL);
  return globalForDb.__akademiDb.db;
}

/** Testler ve betikler için: global bağlantıyı değiştirir/kapatır. */
export function setDb(instance: ReturnType<typeof createDb> | undefined) {
  globalForDb.__akademiDb = instance;
}

export async function closeDb() {
  await globalForDb.__akademiDb?.client.end({ timeout: 5 });
  globalForDb.__akademiDb = undefined;
}

export { schema };
