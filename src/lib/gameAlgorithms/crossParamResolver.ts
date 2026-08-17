/**
 * Cross-param hash reference resolver.
 * Resolves hash references between different param types.
 *
 * Reference chain from game analysis:
 *   bulletparam.interaction_hash  → interactionid entry
 *   bulletparam.hitgroup_hash     → hitgroupiddef entry
 *   bulletparam.bullet_resource_hash → projectile_depiction_table entry
 *   bulletparam.child_bullet_hash → another bulletparam entry
 *
 * The game resolves these at runtime via sub_1405B2870 (FNV-1a hash lookup).
 */

import type { TypedParamEntry, TypedParamFile } from "@/page/TestEditor/components/param-editor/typedParamTypes";
import { readTypedEntryId } from "@/page/TestEditor/components/param-editor/paramEntryUtils";

export type ParamKind =
  | "bulletparam"
  | "characterparam"
  | "armsparam"
  | "speedparam"
  | "grapparam"
  | "interactionid"
  | "hitgroupiddef"
  | "chrsysparam"
  | "projectileDepictionTable";

export interface CrossReference {
  sourceKind: ParamKind;
  sourceEntryId: number;
  sourceField: string;
  targetKind: ParamKind;
  targetHash: number;
  targetEntry: TypedParamEntry | undefined;
}

export interface CrossReferenceMap {
  sourceField: string;
  targetKind: ParamKind;
}

export const BULLET_CROSS_REFERENCES: CrossReferenceMap[] = [
  { sourceField: "hitEffectHash", targetKind: "interactionid" },
  { sourceField: "hitgroupHash", targetKind: "hitgroupiddef" },
  { sourceField: "bulletResourceHash", targetKind: "projectileDepictionTable" },
  { sourceField: "childBulletHash", targetKind: "bulletparam" },
  { sourceField: "bulletActionHash", targetKind: "bulletparam" },
  { sourceField: "onExpireHash", targetKind: "bulletparam" },
  { sourceField: "secondaryEffectHash", targetKind: "interactionid" },
  { sourceField: "spawnPatternHash", targetKind: "bulletparam" },
  { sourceField: "bulletEffectHash", targetKind: "projectileDepictionTable" },
  { sourceField: "trailEffectHash", targetKind: "projectileDepictionTable" },
  { sourceField: "muzzleFlashHash", targetKind: "projectileDepictionTable" },
];

// Binary-proven (docs/hitbox-research/01 §2, 02 §6): hitgroupiddef 0xC3656A99
// ("interactionId") is a foreign key to interactionid.entryId. "boneId" is a
// skeleton bone id and "modelHash" an actor/model selector — neither references
// another param table, so they are not cross-references.
export const HITGROUP_CROSS_REFERENCES: CrossReferenceMap[] = [
  { sourceField: "interactionId", targetKind: "interactionid" },
];

// interactTargetHash is a subsystem selector (docs/hitbox-research/01 §3.5),
// not a reference into interactionid, so it is not listed here.
export const INTERACTION_CROSS_REFERENCES: CrossReferenceMap[] = [
  { sourceField: "seHash", targetKind: "projectileDepictionTable" },
];

function getFieldValue(entry: TypedParamEntry, key: string): number {
  const v = entry[key];
  return typeof v === "number" ? v : 0;
}

export function findEntryByHash(
  entries: TypedParamEntry[],
  hash: number,
): TypedParamEntry | undefined {
  if (hash === 0) return undefined;
  return entries.find((entry, index) => {
    return readTypedEntryId(entry, index) === (hash >>> 0);
  });
}

export function findEntryById(
  entries: TypedParamEntry[],
  entryId: number,
): TypedParamEntry | undefined {
  return entries.find((entry, index) => {
    return readTypedEntryId(entry, index) === (entryId >>> 0);
  });
}

/**
 * Resolves all cross-references from a bulletparam entry.
 * Returns an array of CrossReference objects, each pointing to the target entry if found.
 */
export function resolveBulletCrossReferences(
  bulletEntry: TypedParamEntry,
  paramFiles: Partial<Record<ParamKind, TypedParamEntry[]>>,
): CrossReference[] {
  const results: CrossReference[] = [];
  const sourceId = readTypedEntryId(bulletEntry, 0);

  for (const ref of BULLET_CROSS_REFERENCES) {
    const targetHash = getFieldValue(bulletEntry, ref.sourceField);
    if (targetHash === 0) continue;

    const targetEntries = paramFiles[ref.targetKind];
    const targetEntry = targetEntries ? findEntryByHash(targetEntries, targetHash) : undefined;

    results.push({
      sourceKind: "bulletparam",
      sourceEntryId: sourceId,
      sourceField: ref.sourceField,
      targetKind: ref.targetKind,
      targetHash,
      targetEntry,
    });
  }

  return results;
}

/**
 * Resolves a single cross-reference field from any entry.
 */
export function resolveSingleReference(
  entry: TypedParamEntry,
  sourceKind: ParamKind,
  sourceField: string,
  targetKind: ParamKind,
  targetEntries: TypedParamEntry[],
): CrossReference {
  const sourceId = readTypedEntryId(entry, 0);
  const targetHash = getFieldValue(entry, sourceField);
  const targetEntry = targetHash !== 0 ? findEntryByHash(targetEntries, targetHash) : undefined;

  return {
    sourceKind,
    sourceEntryId: sourceId,
    sourceField,
    targetKind,
    targetHash,
    targetEntry,
  };
}

/**
 * Finds all entries in a param file that reference a given hash value.
 * Used for reverse lookups: "which bulletparam entries use this interactionid?"
 */
export function findReferencingEntries(
  entries: TypedParamEntry[],
  referenceField: string,
  targetHash: number,
): Array<{ index: number; entry: TypedParamEntry }> {
  if (targetHash === 0) return [];

  return entries
    .map((entry, index) => ({ index, entry }))
    .filter(({ entry }) => getFieldValue(entry, referenceField) === targetHash);
}

/**
 * Builds a complete reverse reference map for a target param type.
 * Returns a Map from target entry hash → list of source entries that reference it.
 */
export function buildReverseReferenceMap(
  sourceEntries: TypedParamEntry[],
  referenceField: string,
): Map<number, Array<{ index: number; entryId: number }>> {
  const map = new Map<number, Array<{ index: number; entryId: number }>>();

  sourceEntries.forEach((entry, index) => {
    const targetHash = getFieldValue(entry, referenceField);
    if (targetHash === 0) return;

    if (!map.has(targetHash)) {
      map.set(targetHash, []);
    }
    map.get(targetHash)!.push({
      index,
      entryId: readTypedEntryId(entry, index),
    });
  });

  return map;
}

/**
 * Follows the child_bullet_hash chain from a bulletparam entry.
 * Returns the chain of entries (up to maxDepth to prevent cycles).
 */
export function followChildBulletChain(
  startEntry: TypedParamEntry,
  allBulletEntries: TypedParamEntry[],
  maxDepth: number = 8,
): Array<{ depth: number; hash: number; entry: TypedParamEntry | undefined }> {
  const chain: Array<{ depth: number; hash: number; entry: TypedParamEntry | undefined }> = [];
  const visited = new Set<number>();
  let currentEntry: TypedParamEntry | undefined = startEntry;

  for (let depth = 0; depth < maxDepth && currentEntry; depth++) {
    const childHash = getFieldValue(currentEntry, "childBulletHash");
    if (childHash === 0 || visited.has(childHash)) break;
    visited.add(childHash);

    const childEntry = findEntryByHash(allBulletEntries, childHash);
    chain.push({ depth: depth + 1, hash: childHash, entry: childEntry });
    currentEntry = childEntry;
  }

  return chain;
}

export const PARAM_KIND_LABELS: Record<ParamKind, string> = {
  bulletparam: "Bullet Param",
  characterparam: "Character Param",
  armsparam: "Arms Param",
  speedparam: "Speed Param",
  grapparam: "Grap Param",
  interactionid: "Interaction ID",
  hitgroupiddef: "Hit Group ID Def",
  chrsysparam: "Chr Sys Param",
  projectileDepictionTable: "Projectile Depiction",
};
