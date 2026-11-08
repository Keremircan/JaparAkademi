import type { DeleteKind, DeletionCheck } from "@/lib/deletion";
import type { Actor } from "@/server/authz/actor";
import { assertUser } from "@/server/authz/policy";
import type { Tx } from "@/server/db/client";
import { withActor } from "@/server/db/with-actor";
import { ValidationError } from "@/server/errors";
import { blockersOf, tryRemove, type Deletable } from "./core";
import { REGISTRY } from "./registry";

/**
 * Kayıt silme (iş paketi 3.14, kararlar #283–288).
 *
 * Her kayıt türü bir `Deletable` tanımıyla gelir (`core.ts`): yetki + yükleme, önce silinmesi gereken bağlı kayıtlar
 * ve kaydı (yalnızca kendisine ait satırlarla birlikte) silen `remove`. Silme bir ara kayıt noktasında denenir:
 * yabancı anahtar ihlali (23503) ya da değiştirilemez kayıt kilidi (JA001) kaydın geçmiş eğitim/sınav/onay
 * kayıtlarında kullanıldığını gösterir; bu durumda hiçbir şey silinmez ve arşivleme önerilir. Hangi geçmiş kayıtların
 * bağlı olduğunu veritabanı söyler; yeni bir tablo eklendiğinde de geçmiş kayıt yanlışlıkla silinmez.
 */

/** Deneme silmeyi geri almak için fırlatılır. */
class DryRun extends Error {}

async function evaluate<R>(tx: Tx, def: Deletable<R>, row: R): Promise<DeletionCheck> {
  const blockers = blockersOf((await def.blockers?.(tx, row)) ?? []);
  if (blockers.length > 0) return { state: "blocked", blockers };
  if (await def.inHistory?.(tx, row)) return { state: "history" };
  return (await tryRemove(tx, (sp) => def.remove(sp, row))) ? { state: "ok" } : { state: "history" };
}

function definition(kind: DeleteKind): Deletable<unknown> {
  return REGISTRY[kind];
}

/**
 * Silme penceresi için durum: silmeyi gerçekten dener ve geri alır. "ok" dönen kayıt, arada başka bir değişiklik
 * olmadıkça silinebilir; `deleteRecord` aynı denetimi yeniden yapar.
 */
export async function checkDeletion(actor: Actor, kind: DeleteKind, id: string): Promise<DeletionCheck> {
  assertUser(actor);
  const def = definition(kind);
  let result: DeletionCheck | undefined;
  try {
    await withActor(actor, async (tx) => {
      const row = await def.load(tx, actor, id);
      result = await evaluate(tx, def, row);
      throw new DryRun();
    });
  } catch (err) {
    if (!(err instanceof DryRun)) throw err;
  }
  return result!;
}

/**
 * Kaydı siler. Bağlı kayıt varsa `delete_blocked` (ayrıntı: bağlar), geçmiş kaydı varsa `delete_in_history`.
 * Silinen satırlar denetim kaydına (audit_log) eski hâliyle yazılır.
 */
export async function deleteRecord(actor: Actor, kind: DeleteKind, id: string): Promise<void> {
  assertUser(actor);
  const def = definition(kind);
  const row = await withActor(actor, async (tx) => {
    const loaded = await def.load(tx, actor, id);
    const result = await evaluate(tx, def, loaded);
    if (result.state === "blocked") throw new ValidationError("delete_blocked", result.blockers);
    if (result.state === "history") throw new ValidationError("delete_in_history");
    return loaded;
  });
  await def.afterCommit?.(row);
}
