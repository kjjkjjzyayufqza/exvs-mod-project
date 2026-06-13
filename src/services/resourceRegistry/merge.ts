import { crc32Ieee } from "@/utils/crc32Ieee";
import {
  createEmptyRegistryDocument,
  hashEntryKey,
  mergeEntryKey,
  type MergedRegistryEntry,
  type ResourceRegistryDocument,
  type ResourceRegistryEntry,
  type ValidationIssue,
} from "./types";

export function normalizeRegistryDocument(doc: ResourceRegistryDocument): ResourceRegistryDocument {
  return {
    version: 1,
    entries: doc.entries.map((entry) => ({ ...entry })),
  };
}

export function mergeRegistries(
  globalDoc: ResourceRegistryDocument,
  workspaceDoc: ResourceRegistryDocument,
): ResourceRegistryDocument {
  const global = normalizeRegistryDocument(globalDoc);
  const workspace = normalizeRegistryDocument(workspaceDoc);
  const mergedByKey = new Map<string, MergedRegistryEntry>();

  for (const entry of global.entries) {
    mergedByKey.set(mergeEntryKey(entry), { ...entry, sourceLayer: "global" });
  }
  for (const entry of workspace.entries) {
    mergedByKey.set(mergeEntryKey(entry), { ...entry, sourceLayer: "workspace" });
  }

  return {
    version: 1,
    entries: Array.from(mergedByKey.values()).map(({ sourceLayer: _layer, ...entry }) => entry),
  };
}

export function mergeRegistriesWithSource(
  globalDoc: ResourceRegistryDocument,
  workspaceDoc: ResourceRegistryDocument,
): MergedRegistryEntry[] {
  const global = normalizeRegistryDocument(globalDoc);
  const workspace = normalizeRegistryDocument(workspaceDoc);
  const mergedByKey = new Map<string, MergedRegistryEntry>();

  for (const entry of global.entries) {
    mergedByKey.set(mergeEntryKey(entry), { ...entry, sourceLayer: "global" });
  }
  for (const entry of workspace.entries) {
    mergedByKey.set(mergeEntryKey(entry), { ...entry, sourceLayer: "workspace" });
  }

  return Array.from(mergedByKey.values());
}

export function validateDocument(doc: ResourceRegistryDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (doc.version !== 1) {
    issues.push({
      code: "invalid_version",
      message: `Unsupported registry version: ${doc.version}`,
    });
  }

  const seedKeys = new Map<string, string>();
  const hashKeys = new Map<string, string>();

  for (const entry of doc.entries) {
    if (!entry.seed.trim()) {
      issues.push({
        code: "empty_seed",
        message: "Entry has empty seed",
        entryId: entry.id,
      });
      continue;
    }

    const recomputed = crc32Ieee(entry.seed);
    if (recomputed.hashInt32 !== entry.hashInt32 || recomputed.hashHex !== entry.hashHex) {
      issues.push({
        code: "hash_seed_mismatch",
        message: `Stored hash does not match seed "${entry.seed}"`,
        entryId: entry.id,
      });
    }

    const seedKey = mergeEntryKey(entry);
    const existingSeed = seedKeys.get(seedKey);
    if (existingSeed && existingSeed !== entry.id) {
      issues.push({
        code: "duplicate_seed",
        message: `Duplicate seed key (${entry.category}/${entry.slot}/${entry.seed})`,
        entryId: entry.id,
        relatedEntryId: existingSeed,
      });
    } else {
      seedKeys.set(seedKey, entry.id);
    }

    const hashKey = hashEntryKey(entry);
    const existingHash = hashKeys.get(hashKey);
    if (existingHash && existingHash !== entry.id) {
      issues.push({
        code: "duplicate_hash",
        message: `Duplicate hash for ${entry.category}/${entry.slot}`,
        entryId: entry.id,
        relatedEntryId: existingHash,
      });
    } else {
      hashKeys.set(hashKey, entry.id);
    }
  }

  return issues;
}

export function lookupBySeed(
  doc: ResourceRegistryDocument,
  category: ResourceRegistryEntry["category"],
  slot: string,
  seed: string,
): ResourceRegistryEntry | undefined {
  const trimmed = seed.trim();
  return doc.entries.find(
    (entry) => entry.category === category && entry.slot === slot && entry.seed === trimmed,
  );
}

export function lookupByHash(
  doc: ResourceRegistryDocument,
  category: ResourceRegistryEntry["category"],
  slot: string,
  hashInt32: number,
): ResourceRegistryEntry | undefined {
  return doc.entries.find(
    (entry) =>
      entry.category === category && entry.slot === slot && entry.hashInt32 === hashInt32,
  );
}

export function reverseLookupByHash(
  doc: ResourceRegistryDocument,
  hashInt32: number,
): ResourceRegistryEntry[] {
  return doc.entries.filter((entry) => entry.hashInt32 === hashInt32);
}

export function upsertWorkspaceEntry(
  workspaceDoc: ResourceRegistryDocument,
  entry: ResourceRegistryEntry,
): ResourceRegistryDocument {
  const next = normalizeRegistryDocument(workspaceDoc);
  const key = mergeEntryKey(entry);
  const index = next.entries.findIndex((row) => mergeEntryKey(row) === key);
  if (index >= 0) {
    next.entries[index] = { ...entry, updatedAt: new Date().toISOString() };
  } else {
    next.entries.push(entry);
  }
  return next;
}

export function removeWorkspaceEntry(
  workspaceDoc: ResourceRegistryDocument,
  entryId: string,
): ResourceRegistryDocument {
  const next = normalizeRegistryDocument(workspaceDoc);
  next.entries = next.entries.filter((entry) => entry.id !== entryId);
  return next;
}
