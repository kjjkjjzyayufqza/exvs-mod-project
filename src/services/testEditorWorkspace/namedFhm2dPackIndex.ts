import { join } from "@tauri-apps/api/path";
import {
  exists,
  readDir,
  readTextFile,
  remove,
  writeTextFile,
} from "@tauri-apps/plugin-fs";
import { normalizeFhm2dHashName } from "@/utils/fhm2dStructureMetadata";

/** Sidecar index beside a route root (e.g. 006effect/.exvs2_fhm2d_pack_index.v1.json). */
export const NAMED_FHM2D_PACK_INDEX_FILE = ".exvs2_fhm2d_pack_index.v1.json";

/** Parallel structure-json reads while building the custom-name index. */
const CUSTOM_NAME_READ_CONCURRENCY = 24;

export interface NamedFhm2dPackCandidate {
  stem: string;
  folderPath: string;
  structureJsonPath: string;
}

export type NamedFhm2dPackIndex = Map<string, NamedFhm2dPackCandidate[]>;

interface DiskIndexPayload {
  version: 1;
  namesFingerprint: string;
  structureCount: number;
  /** hashHex -> folder stems (custom or hash-named). */
  byHash: Record<string, string[]>;
}

interface IndexRuntimeState {
  map: NamedFhm2dPackIndex;
  complete: boolean;
  buildPromise: Promise<void> | null;
  /** Waiters for a specific hash: resolved when that hash is indexed or build ends. */
  hashWaiters: Map<string, Array<() => void>>;
}

const runtimeStates = new Map<string, IndexRuntimeState>();

function normalizeCachePath(path: string): string {
  return path.trim().replace(/\\/g, "/").toLowerCase();
}

function stripStructureJsonSuffix(fileName: string): string | null {
  const suffix = "_structure.json";
  if (!fileName.toLowerCase().endsWith(suffix)) return null;
  const stem = fileName.slice(0, fileName.length - suffix.length);
  return stem || null;
}

/**
 * Extract top-level HashName without JSON.parse.
 * Structure files can be multi-MB; full parse was the main cost at scale.
 */
export function extractHashNameFromStructureText(text: string): string | null {
  // Prefer the first HashName near the file head (written as top-level metadata).
  const head = text.length > 8192 ? text.slice(0, 8192) : text;
  const match =
    /"HashName"\s*:\s*"([^"]+)"/.exec(head) ??
    /"HashName"\s*:\s*"([^"]+)"/.exec(text);
  if (!match?.[1]) return null;
  return normalizeFhm2dHashName(match[1]);
}

/** Stable fingerprint of structure file names (order-independent). */
export function fingerprintStructureNames(structureNames: string[]): string {
  const sorted = [...structureNames].sort((a, b) => a.localeCompare(b));
  // FNV-1a 32-bit — fast, good enough for cache invalidation.
  let hash = 0x811c9dc5;
  for (const name of sorted) {
    for (let i = 0; i < name.length; i++) {
      hash ^= name.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    hash ^= 10; // newline separator
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function getOrCreateState(cacheKey: string): IndexRuntimeState {
  let state = runtimeStates.get(cacheKey);
  if (!state) {
    state = {
      map: new Map(),
      complete: false,
      buildPromise: null,
      hashWaiters: new Map(),
    };
    runtimeStates.set(cacheKey, state);
  }
  return state;
}

function addCandidate(
  state: IndexRuntimeState,
  hashHex: string,
  candidate: NamedFhm2dPackCandidate,
): void {
  const list = state.map.get(hashHex);
  if (list) {
    if (!list.some((c) => c.stem === candidate.stem)) {
      list.push(candidate);
    }
  } else {
    state.map.set(hashHex, [candidate]);
  }
  const waiters = state.hashWaiters.get(hashHex);
  if (waiters?.length) {
    state.hashWaiters.delete(hashHex);
    for (const wake of waiters) wake();
  }
}

function wakeAllHashWaiters(state: IndexRuntimeState): void {
  for (const waiters of state.hashWaiters.values()) {
    for (const wake of waiters) wake();
  }
  state.hashWaiters.clear();
}

function waitForHashOrComplete(state: IndexRuntimeState, hashHex: string): Promise<void> {
  if (state.complete || state.map.has(hashHex)) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const list = state.hashWaiters.get(hashHex);
    if (list) list.push(resolve);
    else state.hashWaiters.set(hashHex, [resolve]);
  });
}

async function mapPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;
  let next = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      await worker(items[index]!);
    }
  });
  await Promise.all(runners);
}

async function listStructureFileNames(routeRootPath: string): Promise<string[] | null> {
  let entries: Awaited<ReturnType<typeof readDir>>;
  try {
    entries = await readDir(routeRootPath);
  } catch {
    return null;
  }
  return entries
    .map((entry) => entry.name)
    .filter((name): name is string => typeof name === "string")
    .filter((name) => Boolean(stripStructureJsonSuffix(name)));
}

async function tryLoadDiskCache(
  routeRootPath: string,
  state: IndexRuntimeState,
  structureNames: string[],
  fingerprint: string,
): Promise<boolean> {
  const indexPath = await join(routeRootPath, NAMED_FHM2D_PACK_INDEX_FILE);
  let raw: string;
  try {
    raw = await readTextFile(indexPath);
  } catch {
    return false;
  }

  let payload: DiskIndexPayload;
  try {
    payload = JSON.parse(raw) as DiskIndexPayload;
  } catch {
    return false;
  }

  if (
    payload?.version !== 1 ||
    payload.namesFingerprint !== fingerprint ||
    payload.structureCount !== structureNames.length ||
    !payload.byHash ||
    typeof payload.byHash !== "object"
  ) {
    return false;
  }

  for (const [hashHex, stems] of Object.entries(payload.byHash)) {
    if (!Array.isArray(stems)) continue;
    for (const stem of stems) {
      if (typeof stem !== "string" || !stem) continue;
      addCandidate(state, hashHex, {
        stem,
        folderPath: await join(routeRootPath, stem),
        structureJsonPath: await join(routeRootPath, `${stem}_structure.json`),
      });
    }
  }
  return true;
}

async function saveDiskCache(
  routeRootPath: string,
  state: IndexRuntimeState,
  structureNames: string[],
  fingerprint: string,
): Promise<void> {
  const byHash: Record<string, string[]> = {};
  for (const [hashHex, candidates] of state.map) {
    byHash[hashHex] = candidates.map((c) => c.stem);
  }
  const payload: DiskIndexPayload = {
    version: 1,
    namesFingerprint: fingerprint,
    structureCount: structureNames.length,
    byHash,
  };
  try {
    const indexPath = await join(routeRootPath, NAMED_FHM2D_PACK_INDEX_FILE);
    await writeTextFile(indexPath, JSON.stringify(payload));
  } catch {
    // Cache is best-effort; resolution still works without it.
  }
}

async function removeDiskCache(routeRootPath: string): Promise<void> {
  try {
    const indexPath = await join(routeRootPath, NAMED_FHM2D_PACK_INDEX_FILE);
    await remove(indexPath);
  } catch {
    // ignore missing/unwritable
  }
}

async function buildNamedPackIndex(routeRootPath: string, state: IndexRuntimeState): Promise<void> {
  const structureNames = await listStructureFileNames(routeRootPath);
  if (!structureNames) {
    state.complete = true;
    wakeAllHashWaiters(state);
    return;
  }

  const fingerprint = fingerprintStructureNames(structureNames);
  if (await tryLoadDiskCache(routeRootPath, state, structureNames, fingerprint)) {
    state.complete = true;
    wakeAllHashWaiters(state);
    return;
  }

  // Phase 1: hash-stem packs — index from file name only (no content IO).
  // Custom-name packs need HashName from structure JSON (phase 2).
  const customStructureNames: string[] = [];
  for (const structureName of structureNames) {
    const stem = stripStructureJsonSuffix(structureName);
    if (!stem) continue;
    const stemHash = normalizeFhm2dHashName(stem);
    if (stemHash) {
      addCandidate(state, stemHash, {
        stem,
        folderPath: await join(routeRootPath, stem),
        structureJsonPath: await join(routeRootPath, structureName),
      });
    } else {
      customStructureNames.push(structureName);
    }
  }

  // Phase 2: only custom-named structure files need content reads.
  await mapPool(customStructureNames, CUSTOM_NAME_READ_CONCURRENCY, async (structureName) => {
    const stem = stripStructureJsonSuffix(structureName);
    if (!stem) return;
    const structureJsonPath = await join(routeRootPath, structureName);
    let hashName: string | null = null;
    try {
      const raw = await readTextFile(structureJsonPath);
      hashName = extractHashNameFromStructureText(raw);
    } catch {
      return;
    }
    if (!hashName) return;
    addCandidate(state, hashName, {
      stem,
      folderPath: await join(routeRootPath, stem),
      structureJsonPath,
    });
  });

  state.complete = true;
  wakeAllHashWaiters(state);
  await saveDiskCache(routeRootPath, state, structureNames, fingerprint);
}

/**
 * Resolve a custom-named (or hash-stem) pack under routeRoot by game HashName.
 * Uses a shared progressive index: concurrent lookups share one scan; a hit can
 * return before the full directory scan finishes.
 */
export async function lookupNamedFhm2dPackCandidates(
  routeRootPath: string,
  hashHex: string,
): Promise<NamedFhm2dPackCandidate[]> {
  const normalizedHashHex = hashHex.trim().replace(/^0x/i, "");
  if (!normalizedHashHex) return [];
  const keyHash = `0x${normalizedHashHex.toUpperCase()}`;
  const cacheKey = normalizeCachePath(routeRootPath);
  const state = getOrCreateState(cacheKey);

  if (state.map.has(keyHash)) {
    return state.map.get(keyHash) ?? [];
  }
  if (state.complete) {
    return [];
  }

  if (!state.buildPromise) {
    state.buildPromise = buildNamedPackIndex(routeRootPath, state).catch((error) => {
      runtimeStates.delete(cacheKey);
      throw error;
    });
  }

  await Promise.race([state.buildPromise, waitForHashOrComplete(state, keyHash)]);
  return state.map.get(keyHash) ?? [];
}

export function clearNamedFhm2dPackIndexCache(routeRootPath?: string): void {
  if (!routeRootPath) {
    runtimeStates.clear();
    return;
  }
  const cacheKey = normalizeCachePath(routeRootPath);
  runtimeStates.delete(cacheKey);
  void removeDiskCache(routeRootPath);
}
