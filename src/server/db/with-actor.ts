import { sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import type { Actor } from "@/server/authz/actor";
import { db, type Tx } from "./client";

/**
 * Transaction başlatır ve denetim kaydı için aktör/istek kimliğini ayarlar.
 * Veri değiştiren tüm servis işlemleri bu fonksiyon içinde çalışmalıdır.
 */
export async function withActor<T>(
  actor: Actor,
  fn: (tx: Tx) => Promise<T>,
  options: { requestId?: string } = {},
): Promise<T> {
  const actorId = actor.kind === "user" ? actor.userId : "";
  const requestId =
    options.requestId ?? (actor.kind === "system" ? `system:${actor.name}` : uuidv7());

  return db().transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.actor_id', ${actorId}, true), set_config('app.request_id', ${requestId}, true)`,
    );
    return fn(tx);
  });
}
