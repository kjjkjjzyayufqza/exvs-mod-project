/**
 * Tiered cache for nutexb → PNG preview blobs:
 * L1: in-memory LRU of blob URLs (fast reuse within session)
 * L2: IndexedDB of PNG bytes keyed by industrial version id (path + nutexb byte size + IEEE CRC32 over raw file bytes)
 *
 * Version identity is computed in Rust (`nutexb_preview_file_identity`) so any content change alters CRC32 and misses stale cache entries.
 */

import { invoke } from "@tauri-apps/api/core";

const MEMORY_MAX_URLS = 512;
const IDB_NAME = "ssbh-nutexb-preview-cache-v3";
const IDB_STORE = "png";
const IDB_VERSION = 1;
/** Max persisted decoded textures; oldest by insertion time are removed. */
const IDB_MAX_ENTRIES = 1200;

export type NutexbPreviewFileIdentity = {
  nutexbSize: number;
  crc32: number;
};

type IdbRecord = {
  bytes: ArrayBuffer;
  storedAt: number;
};

const lru = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

let idbReady: Promise<IDBDatabase | null> | null = null;

export function normalizeNutexbCacheKey(path: string): string {
  return path.trim().replace(/\\/g, "/").toLowerCase();
}

/**
 * Stable cache key: normalized path + exact nutexb file size + CRC32 (IEEE, unsigned) as 8 hex digits.
 */
export function makeNutexbVersionId(diskPath: string, nutexbSize: number, crc32: number): string {
  const p = normalizeNutexbCacheKey(diskPath);
  const hex = (crc32 >>> 0).toString(16).padStart(8, "0");
  return `${p}|${nutexbSize}|${hex}`;
}

/**
 * Reads the file once in Rust and returns size + CRC32 over raw bytes (no PNG decode).
 */
export async function resolveNutexbVersionId(diskPath: string): Promise<{ versionId: string; persistEligible: boolean }> {
  const id = await invoke<NutexbPreviewFileIdentity>("nutexb_preview_file_identity", { path: diskPath });
  return {
    versionId: makeNutexbVersionId(diskPath, id.nutexbSize, id.crc32),
    persistEligible: true,
  };
}

function openIdb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") {
    return Promise.resolve(null);
  }
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(IDB_NAME, IDB_VERSION);
    open.onerror = () => {
      resolve(null);
    };
    open.onsuccess = () => resolve(open.result);
    open.onupgradeneeded = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
  });
}

function getIdb(): Promise<IDBDatabase | null> {
  if (!idbReady) {
    idbReady = openIdb();
  }
  return idbReady;
}

function idbGet(db: IDBDatabase, versionId: string): Promise<IdbRecord | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readonly");
    const store = tx.objectStore(IDB_STORE);
    const req = store.get(versionId);
    req.onsuccess = () => resolve(req.result as IdbRecord | undefined);
    req.onerror = () => reject(req.error);
  });
}

function idbCount(db: IDBDatabase): Promise<number> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readonly");
    const store = tx.objectStore(IDB_STORE);
    const req = store.count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbDeleteKeys(db: IDBDatabase, keys: string[]): Promise<void> {
  if (keys.length === 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    const store = tx.objectStore(IDB_STORE);
    for (const k of keys) {
      store.delete(k);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function idbCollectMeta(db: IDBDatabase): Promise<{ key: string; storedAt: number }[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readonly");
    const store = tx.objectStore(IDB_STORE);
    const out: { key: string; storedAt: number }[] = [];
    const req = store.openCursor();
    req.onsuccess = () => {
      const cur = req.result;
      if (!cur) {
        resolve(out);
        return;
      }
      const v = cur.value as IdbRecord;
      out.push({ key: String(cur.key), storedAt: v.storedAt });
      cur.continue();
    };
    req.onerror = () => reject(req.error);
  });
}

async function idbEvictOldestIfNeeded(db: IDBDatabase): Promise<void> {
  const n = await idbCount(db);
  if (n < IDB_MAX_ENTRIES) return;
  const removeCount = n - IDB_MAX_ENTRIES + 1;
  const meta = await idbCollectMeta(db);
  meta.sort((a, b) => a.storedAt - b.storedAt);
  const keys = meta.slice(0, removeCount).map((m) => m.key);
  await idbDeleteKeys(db, keys);
}

function idbPut(db: IDBDatabase, versionId: string, bytes: ArrayBuffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    const store = tx.objectStore(IDB_STORE);
    const rec: IdbRecord = { bytes, storedAt: Date.now() };
    const req = store.put(rec, versionId);
    req.onsuccess = () => undefined;
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbTryGetPngBytes(versionId: string): Promise<ArrayBuffer | null> {
  const db = await getIdb();
  if (!db) return null;
  try {
    const row = await idbGet(db, versionId);
    if (!row?.bytes) return null;
    return row.bytes.slice(0);
  } catch {
    return null;
  }
}

async function idbTryPutPngBytes(versionId: string, bytes: ArrayBuffer): Promise<void> {
  const db = await getIdb();
  if (!db) {
    return;
  }
  await idbEvictOldestIfNeeded(db);
  await idbPut(db, versionId, bytes.slice(0));
}

function getLru(versionId: string): string | undefined {
  const url = lru.get(versionId);
  if (url === undefined) return undefined;
  lru.delete(versionId);
  lru.set(versionId, url);
  return url;
}

function setLru(versionId: string, url: string) {
  if (lru.has(versionId)) {
    const old = lru.get(versionId)!;
    lru.delete(versionId);
    if (old !== url) {
      URL.revokeObjectURL(old);
    }
  }
  while (lru.size >= MEMORY_MAX_URLS) {
    const first = lru.keys().next().value as string | undefined;
    if (first === undefined) break;
    const evictUrl = lru.get(first)!;
    lru.delete(first);
    URL.revokeObjectURL(evictUrl);
  }
  lru.set(versionId, url);
}

function bufferToPngBlobUrl(raw: ArrayBuffer | Uint8Array): string {
  const u8 = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
  const ab = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
  const blob = new Blob([ab], { type: "image/png" });
  return URL.createObjectURL(blob);
}

/**
 * Returns a blob URL for decoded PNG bytes, using L1 → L2 → decode pipeline.
 * Caller must pass `versionId` / `persistEligible` from `resolveNutexbVersionId(diskPath)`.
 */
export async function getOrDecodeNutexbPngBlobUrl(
  versionId: string,
  persistEligible: boolean,
  decode: () => Promise<ArrayBuffer | Uint8Array>,
): Promise<string> {
  const cached = getLru(versionId);
  if (cached) {
    return cached;
  }

  const pending = inflight.get(versionId);
  if (pending) {
    return pending;
  }

  const p = (async () => {
    const idbBytes = persistEligible ? await idbTryGetPngBytes(versionId) : null;
    if (idbBytes) {
      const url = bufferToPngBlobUrl(idbBytes);
      setLru(versionId, url);
      return url;
    }

    const raw = await decode();
    const url = bufferToPngBlobUrl(raw);

    if (persistEligible) {
      const u8 = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
      const copy = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
      try {
        await idbTryPutPngBytes(versionId, copy);
      } catch (e) {
        URL.revokeObjectURL(url);
        throw e;
      }
    }

    setLru(versionId, url);
    return url;
  })().finally(() => {
    inflight.delete(versionId);
  });

  inflight.set(versionId, p);
  return p;
}

async function idbClearAllInternal(): Promise<void> {
  const db = await getIdb();
  if (!db) return;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    const store = tx.objectStore(IDB_STORE);
    store.clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Revokes in-memory blob URLs and clears IndexedDB entries. */
export function clearNutexbPreviewCache(): void {
  for (const url of lru.values()) {
    URL.revokeObjectURL(url);
  }
  lru.clear();
  inflight.clear();
  void idbClearAllInternal().catch(() => {});
}

export async function clearNutexbPreviewCacheAsync(): Promise<void> {
  for (const url of lru.values()) {
    URL.revokeObjectURL(url);
  }
  lru.clear();
  inflight.clear();
  await idbClearAllInternal();
}

export type NutexbPreviewCacheStats = {
  memoryEntries: number;
  idbEntries: number | null;
};

export async function getNutexbPreviewCacheStats(): Promise<NutexbPreviewCacheStats> {
  const db = await getIdb();
  if (!db) {
    return { memoryEntries: lru.size, idbEntries: null };
  }
  try {
    const n = await idbCount(db);
    return { memoryEntries: lru.size, idbEntries: n };
  } catch {
    return { memoryEntries: lru.size, idbEntries: null };
  }
}
