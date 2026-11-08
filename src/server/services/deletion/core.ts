import { count, type SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import type { Blocker } from "@/lib/deletion";
import type { UserActor } from "@/server/authz/actor";
import type { Tx } from "@/server/db/client";
import { IMMUTABLE_VIOLATION, pgErrorCode } from "@/server/errors";

/**
 * Silme tanımı (iş paketi 3.14). Alan servisleri (org, modüller, içerik…) kendi türlerini bu biçimde tanımlar;
 * akış `deletion/index.ts`'tedir. Bu dosya kayıt defterini içe aktarmaz (döngüsel içe aktarma olmasın).
 */
export type Deletable<R> = {
  /** Yetki denetler ve kaydı kilitleyerek okur. Yoksa NotFoundError, yetki yoksa ForbiddenError. */
  load(tx: Tx, actor: UserActor, id: string): Promise<R>;
  /** Önce silinmesi gereken (canlı) bağlı kayıtlar. */
  blockers?(tx: Tx, row: R): Promise<Blocker[]>;
  /** Kayıt kendiliğinden geçmiş sayılıyorsa (ör. onay kaydı olan oturum; çok biçimli bağlar FK ile yakalanmaz). */
  inHistory?(tx: Tx, row: R): Promise<boolean>;
  /** Kaydı ve yalnızca ona ait satırları siler (yalnızca veritabanı; depo işleri `afterCommit`'te). */
  remove(tx: Tx, row: R): Promise<void>;
  /** Gerçek silme işlendikten sonra (ör. depodaki dosyayı silme). Hata silmeyi geri almaz. */
  afterCommit?(row: R): Promise<void>;
};

/** Sayısı sıfır olan bağları atar (tanımlar sayıları doğrudan döndürebilir). */
export function blockersOf(items: { kind: Blocker["kind"]; count: number | string | null | undefined }[]): Blocker[] {
  return items.map((b) => ({ kind: b.kind, count: Number(b.count ?? 0) })).filter((b) => b.count > 0);
}

/** Koşula uyan satır sayısı (bağlı kayıt sayımı). */
export async function countRows(tx: Tx, table: PgTable, where: SQL | undefined): Promise<number> {
  const [row] = await tx.select({ n: count() }).from(table).where(where);
  return Number(row?.n ?? 0);
}

/** Geçmiş kaydı gösteren veritabanı hataları: yabancı anahtar ihlali ya da değiştirilemez kayıt kilidi. */
export function isHistoryError(err: unknown): boolean {
  const code = pgErrorCode(err);
  return code === "23503" || code === IMMUTABLE_VIOLATION;
}

/**
 * Ara kayıt noktasında (savepoint) silmeyi dener. Geçmiş kaydına takılırsa false döner ve yalnızca bu adım geri
 * alınır. Tanımlar "varsa sil" türündeki yan kayıtlar (ör. başka ziyareti olmayan ziyaretçi) için de kullanır.
 */
export async function tryRemove(tx: Tx, fn: (sp: Tx) => Promise<void>): Promise<boolean> {
  try {
    await tx.transaction(async (sp) => {
      await fn(sp);
    });
    return true;
  } catch (err) {
    if (isHistoryError(err)) return false;
    throw err;
  }
}
