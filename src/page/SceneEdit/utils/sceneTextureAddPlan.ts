/**
 * Texture Add Plan — duplicate-detection for the batch "Add texture" flow.
 *
 * Textures are considered duplicates by NAME, ignoring file extension. Two
 * identity keys are compared:
 *   1. The file's base name (filename without its extension).
 *   2. For .nutexb files, the internal texture name stored inside the container
 *      (read via the `nutexb_read_info` command). The internal name can differ
 *      from the file name, so both must be checked.
 *
 * Existing stage textures are indexed authoritatively: every existing .nutexb
 * entry's internal name is read so a candidate cannot collide with a texture
 * whose file was renamed away from its internal name.
 */
import { invoke } from "@tauri-apps/api/core";
import type { TextureManagerEntry } from "../store/sceneTextureManagerStore";

const INTERNAL_NAME_READ_CONCURRENCY = 8;

export interface RawAddFile {
  sourcePath: string;
  filename: string;
}

export type DuplicateReason = "filename" | "internal-name" | "batch-duplicate";

export interface AnalyzedAddCandidate {
  /** Stable id for UI keys — the absolute source path. */
  id: string;
  sourcePath: string;
  filename: string;
  /** Target nutexb filename inside the stage (`<base>.nutexb`). */
  nutexbFilename: string;
  isNutexb: boolean;
  /** Internal nutexb name when the candidate is a .nutexb file, else null. */
  internalName: string | null;
  duplicate: boolean;
  duplicateReason: DuplicateReason | null;
  /** The existing/earlier texture name this candidate collides with. */
  duplicateOf: string | null;
}

export type InternalNameReader = (path: string) => Promise<string | null>;

const internalNameCache = new Map<string, string | null>();

/** Normalize a file or internal texture name to its comparison key. */
export function normalizeTextureNameKey(name: string): string {
  const base = name.trim().replace(/\\/g, "/").split("/").pop() ?? "";
  return base.replace(/\.[^.]+$/, "").toLowerCase();
}

function isNutexbName(filename: string): boolean {
  return filename.toLowerCase().endsWith(".nutexb");
}

/** Read a nutexb's internal name via the Rust command, memoized per path. */
export async function readNutexbInternalName(path: string): Promise<string | null> {
  if (internalNameCache.has(path)) return internalNameCache.get(path) ?? null;
  let name: string | null = null;
  try {
    const info = await invoke<{ name: string }>("nutexb_read_info", {
      inputPath: path,
    });
    name = info?.name?.trim() ? info.name.trim() : null;
  } catch {
    name = null;
  }
  internalNameCache.set(path, name);
  return name;
}

/** Drop a cache entry so a re-encoded/replaced file is re-read. */
export function invalidateNutexbInternalName(path: string): void {
  internalNameCache.delete(path);
}

async function runBounded<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await worker(items[index]);
    }
  });
  await Promise.all(runners);
}

/**
 * Build the set of identity keys for the textures already present in the manager.
 * Returns a map of key → a representative display filename (for messaging).
 */
export async function buildExistingTextureKeys(
  entries: readonly TextureManagerEntry[],
  reader: InternalNameReader = readNutexbInternalName,
): Promise<Map<string, string>> {
  const keys = new Map<string, string>();
  const readable: TextureManagerEntry[] = [];

  for (const entry of entries) {
    const fileKey = normalizeTextureNameKey(entry.filename);
    if (fileKey && !keys.has(fileKey)) keys.set(fileKey, entry.filename);
    if (entry.nutexbPath && isNutexbName(entry.filename)) readable.push(entry);
  }

  await runBounded(readable, INTERNAL_NAME_READ_CONCURRENCY, async (entry) => {
    const internal = await reader(entry.nutexbPath as string);
    if (!internal) return;
    const key = normalizeTextureNameKey(internal);
    if (key && !keys.has(key)) keys.set(key, entry.filename);
  });

  return keys;
}

/**
 * Analyze the selected files against the current manager entries, flagging any
 * candidate that would duplicate an existing texture or an earlier candidate in
 * the same batch.
 */
export async function analyzeTextureAddCandidates(
  files: readonly RawAddFile[],
  entries: readonly TextureManagerEntry[],
  reader: InternalNameReader = readNutexbInternalName,
): Promise<AnalyzedAddCandidate[]> {
  const existingKeys = await buildExistingTextureKeys(entries, reader);
  const acceptedKeys = new Map<string, string>();
  const result: AnalyzedAddCandidate[] = [];

  for (const file of files) {
    const isNutexb = isNutexbName(file.filename);
    const baseKey = normalizeTextureNameKey(file.filename);
    const internalName = isNutexb ? await reader(file.sourcePath) : null;

    const candidateKeys = [baseKey];
    if (internalName) {
      const internalKey = normalizeTextureNameKey(internalName);
      if (internalKey && internalKey !== baseKey) candidateKeys.push(internalKey);
    }

    let duplicate = false;
    let duplicateReason: DuplicateReason | null = null;
    let duplicateOf: string | null = null;

    for (const key of candidateKeys) {
      if (existingKeys.has(key)) {
        duplicate = true;
        duplicateReason = key === baseKey ? "filename" : "internal-name";
        duplicateOf = existingKeys.get(key) ?? null;
        break;
      }
      if (acceptedKeys.has(key)) {
        duplicate = true;
        duplicateReason = "batch-duplicate";
        duplicateOf = acceptedKeys.get(key) ?? null;
        break;
      }
    }

    if (!duplicate) {
      for (const key of candidateKeys) {
        if (key) acceptedKeys.set(key, file.filename);
      }
    }

    result.push({
      id: file.sourcePath,
      sourcePath: file.sourcePath,
      filename: file.filename,
      nutexbFilename: file.filename.replace(/\.[^.]+$/, ".nutexb"),
      isNutexb,
      internalName,
      duplicate,
      duplicateReason,
      duplicateOf,
    });
  }

  return result;
}

/** Human-readable explanation for a duplicate candidate. */
export function describeDuplicate(candidate: AnalyzedAddCandidate): string {
  if (!candidate.duplicate) return "";
  const target = candidate.duplicateOf ?? "an existing texture";
  switch (candidate.duplicateReason) {
    case "internal-name":
      return `Internal name matches ${target}`;
    case "batch-duplicate":
      return `Duplicate of ${target} in this batch`;
    case "filename":
    default:
      return `Same name as ${target}`;
  }
}
