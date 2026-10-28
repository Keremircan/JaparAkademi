/**
 * Tahliye listesinin cihazdaki son kopyası (karar #160, SPEC 8.3 FG-8.1): yalnızca IndexedDB'de, tek kayıt.
 * Bağlantı kesilince çevrimdışı sayfası okur; 24 saatten eskisi gösterilmez; giriş sayfası açılınca (çıkışta) silinir.
 * Yalnızca tarayıcıda kullanılır.
 */
export type CachedPerson = { name: string; company: string | null; type: string; host: string; badge: string | null; checkedIn: string; safe: boolean };
export type EvacuationCache = { savedAt: string; rollcall: { kind: string; startedAt: string } | null; people: CachedPerson[] };

const DB = "japar-akademi";
const STORE = "kv";
const KEY = "evacuation";
export const EVACUATION_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function saveEvacuationCache(data: EvacuationCache): Promise<void> {
  try {
    await run("readwrite", (s) => s.put(data, KEY));
  } catch {
    // Özel tarama vb. durumlarda saklanamaz; ekran yine çalışır
  }
}

export async function readEvacuationCache(): Promise<EvacuationCache | null> {
  try {
    return ((await run("readonly", (s) => s.get(KEY))) as EvacuationCache | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function clearEvacuationCache(): Promise<void> {
  try {
    await run("readwrite", (s) => s.delete(KEY));
  } catch {
    // yok sayılır
  }
}
