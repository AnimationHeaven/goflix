/**
 * Tiny dependency-free IndexedDB helper backing the thumbnail/duration
 * caches — lets a folder you've already browsed reopen without redoing
 * frame-capture/metadata-probe work. Degrades silently (no-ops / empty
 * reads) if IndexedDB is unavailable, since this is a nice-to-have cache,
 * never a requirement for the app to function.
 */
const DB_NAME = 'goflix-cache';
const DB_VERSION = 2;
const STORES = ['thumbnails', 'durations', 'resolutions'] as const;
export type StoreName = (typeof STORES)[number];
const MAX_ENTRIES_PER_STORE = 3000;
const PRUNE_EVERY_N_WRITES = 25;

interface StoredEntry<T> {
  value: T;
  savedAt: number;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const store of STORES) {
        if (!db.objectStoreNames.contains(store)) {
          db.createObjectStore(store).createIndex('savedAt', 'savedAt');
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
  return dbPromise;
}

/** Bulk-reads every entry from a store — used once at startup to hydrate the in-memory cache. */
export async function idbGetAll<T>(store: StoreName): Promise<Array<[string, T]>> {
  const db = await openDb();
  if (!db) return [];
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(store, 'readonly');
      const req = tx.objectStore(store).openCursor();
      const out: Array<[string, T]> = [];
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) {
          resolve(out);
          return;
        }
        const entry = cursor.value as StoredEntry<T>;
        out.push([String(cursor.key), entry.value]);
        cursor.continue();
      };
      req.onerror = () => resolve(out);
    } catch {
      resolve([]);
    }
  });
}

let writeCount = 0;

/** Fire-and-forget write; periodically prunes the oldest entries past MAX_ENTRIES_PER_STORE. */
export function idbPut<T>(store: StoreName, key: string, value: T): void {
  void openDb().then((db) => {
    if (!db) return;
    try {
      const tx = db.transaction(store, 'readwrite');
      const entry: StoredEntry<T> = { value, savedAt: Date.now() };
      tx.objectStore(store).put(entry, key);
    } catch {
      /* ignore */
    }
  });

  writeCount += 1;
  if (writeCount % PRUNE_EVERY_N_WRITES === 0) void prune(store);
}

async function prune(store: StoreName): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    const tx = db.transaction(store, 'readwrite');
    const os = tx.objectStore(store);
    const countReq = os.count();
    countReq.onsuccess = () => {
      const excess = countReq.result - MAX_ENTRIES_PER_STORE;
      if (excess <= 0) return;
      const cursorReq = os.index('savedAt').openCursor();
      let deleted = 0;
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor || deleted >= excess) return;
        cursor.delete();
        deleted += 1;
        cursor.continue();
      };
    };
  } catch {
    /* ignore */
  }
}
