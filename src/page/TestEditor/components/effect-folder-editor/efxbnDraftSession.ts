import type {
  EfxbnControlLookupEntry,
  EfxbnControlReferenceSummary,
  EfxbnEffectSummary,
  EfxbnSummary,
} from "@/services/effectFolder/effectFolderService";

/** Color lanes authored in Phase A of the live author UI. */
export const EFXBN_COLOR_CONTROL_NAMES = ["colorR", "colorG", "colorB", "colorA"] as const;
export type EfxbnColorControlName = (typeof EFXBN_COLOR_CONTROL_NAMES)[number];

export type EfxbnDirtyKey = `${number}:${string}`;

export type EfxbnControlConstantPatch = {
  lookupIndex: number;
  value: number;
};

/**
 * In-memory overlay of an EFXBN's curve-key value floats.
 *
 * Structural fields stay on the inventory summary; only `controlLookupEntries`
 * values are drafted so the preview can update without remounting models.
 */
export type EfxbnDraftSession = {
  path: string;
  controlLookupRegionOffset: number;
  controlLookupEntries: readonly EfxbnControlLookupEntry[];
  /** Original value per lookup index at draft creation (or last successful write). */
  baselineValues: ReadonlyMap<number, number>;
  dirtyKeys: ReadonlySet<EfxbnDirtyKey>;
  effects: readonly EfxbnEffectSummary[];
};

function float32BitsLe(value: number): number {
  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);
  view.setFloat32(0, value, true);
  return view.getUint32(0, true);
}

function cloneEntry(
  entry: EfxbnControlLookupEntry,
  value: number,
): EfxbnControlLookupEntry {
  return {
    ...entry,
    value,
    valueF32Bits: float32BitsLe(value),
  };
}

function dirtyKey(blockIndex: number, name: string): EfxbnDirtyKey {
  return `${blockIndex}:${name}`;
}

function nearlyEqual(left: number, right: number): boolean {
  return Math.abs(left - right) <= 1e-6;
}

function findControlReference(
  effects: readonly EfxbnEffectSummary[],
  blockIndex: number,
  name: string,
): EfxbnControlReferenceSummary {
  const block = effects.find((effect) => effect.index === blockIndex);
  if (!block) {
    throw new Error(`EFXBN draft has no block at index ${blockIndex}.`);
  }
  const reference = block.controlReferences.find((entry) => entry.name === name);
  if (!reference) {
    throw new Error(`EFXBN block ${blockIndex} has no control lane "${name}".`);
  }
  return reference;
}

/** Compare efxbn file paths without being tripped by slash/case differences on Windows. */
export function sameEfxbnPath(left: string | null | undefined, right: string | null | undefined): boolean {
  const a = (left ?? "").trim().replace(/\\/g, "/").replace(/\/+$/g, "").toLowerCase();
  const b = (right ?? "").trim().replace(/\\/g, "/").replace(/\/+$/g, "").toLowerCase();
  return a.length > 0 && a === b;
}

/**
 * Create a live draft from a parsed summary. Entries are cloned so inventory state
 * is never mutated in place.
 *
 * Prefer `filePath` from the inventory file item when available — that is the path the
 * write IPC must hit. `summary.path` can differ in separators or lag behind renames.
 */
export function createEfxbnDraft(
  summary: EfxbnSummary,
  filePath?: string | null,
): EfxbnDraftSession {
  const controlLookupEntries = summary.controlLookupEntries.map((entry) => ({ ...entry }));
  const baselineValues = new Map<number, number>();
  for (const entry of controlLookupEntries) {
    baselineValues.set(entry.index, entry.value);
  }
  const path = (filePath?.trim() || summary.path || "").trim();
  if (!path) {
    throw new Error("Cannot create EFXBN draft without a file path.");
  }
  return {
    path,
    controlLookupRegionOffset: summary.controlLookupRegionOffset,
    controlLookupEntries,
    baselineValues,
    dirtyKeys: new Set(),
    effects: summary.effects,
  };
}

export function isEfxbnDraftDirty(draft: EfxbnDraftSession): boolean {
  return draft.dirtyKeys.size > 0;
}

export function efxbnDraftDirtyCount(draft: EfxbnDraftSession): number {
  return draft.dirtyKeys.size;
}

export function isEfxbnBlockDirty(draft: EfxbnDraftSession, blockIndex: number): boolean {
  for (const key of draft.dirtyKeys) {
    const separator = key.indexOf(":");
    if (separator < 0) continue;
    if (Number(key.slice(0, separator)) === blockIndex) return true;
  }
  return false;
}

/**
 * Read a constant control lane value, or `null` when the lane is unused or a curve.
 * Prefer this for mixed-mode UI; use `getControlConstant` when a constant is required.
 */
export function tryGetControlConstant(
  draft: EfxbnDraftSession,
  blockIndex: number,
  name: string,
): number | null {
  const block = draft.effects.find((effect) => effect.index === blockIndex);
  if (!block) return null;
  const reference = block.controlReferences.find((entry) => entry.name === name);
  if (!reference || reference.selector !== 1) return null;
  const entry = draft.controlLookupEntries[reference.lookupIndex];
  return entry ? entry.value : null;
}

export function getControlConstant(
  draft: EfxbnDraftSession,
  blockIndex: number,
  name: string,
): number {
  const reference = findControlReference(draft.effects, blockIndex, name);
  if (reference.selector === 0) return 0;
  if (reference.selector !== 1) {
    throw new Error(
      `Control "${name}" on block ${blockIndex} is a curve (selector=${reference.selector}); constant edit is not supported.`,
    );
  }
  const entry = draft.controlLookupEntries[reference.lookupIndex];
  if (!entry) {
    throw new Error(
      `Control "${name}" on block ${blockIndex} points to missing lookup index ${reference.lookupIndex}.`,
    );
  }
  return entry.value;
}

/**
 * Patch a constant control lane (`selector === 1`). Returns a new draft.
 * Curve lanes (selector > 1) and unused lanes (selector === 0) throw.
 */
export function patchControlConstant(
  draft: EfxbnDraftSession,
  blockIndex: number,
  name: string,
  value: number,
): EfxbnDraftSession {
  if (!Number.isFinite(value)) {
    throw new Error(`Control "${name}" value must be a finite number.`);
  }
  const reference = findControlReference(draft.effects, blockIndex, name);
  if (reference.selector === 0) {
    throw new Error(`Control "${name}" on block ${blockIndex} is unused (selector=0).`);
  }
  if (reference.selector !== 1) {
    throw new Error(
      `Control "${name}" on block ${blockIndex} is a curve (selector=${reference.selector}); constant edit is not supported.`,
    );
  }
  const lookupIndex = reference.lookupIndex;
  const existing = draft.controlLookupEntries[lookupIndex];
  if (!existing) {
    throw new Error(
      `Control "${name}" on block ${blockIndex} points to missing lookup index ${lookupIndex}.`,
    );
  }

  // Only clone the touched entry — full .map() was O(curveKeyCount) per slider tick.
  if (nearlyEqual(existing.value, value)) {
    return draft;
  }
  const nextEntries = draft.controlLookupEntries.slice();
  nextEntries[lookupIndex] = cloneEntry(existing, value);
  const nextDirty = new Set(draft.dirtyKeys);
  const key = dirtyKey(blockIndex, name);
  const baseline = draft.baselineValues.get(lookupIndex);
  if (baseline !== undefined && nearlyEqual(baseline, value)) {
    nextDirty.delete(key);
  } else {
    nextDirty.add(key);
  }

  return {
    ...draft,
    controlLookupEntries: nextEntries,
    dirtyKeys: nextDirty,
  };
}

/** Restore all constant values to the baseline captured at draft creation / last write. */
export function revertEfxbnDraft(draft: EfxbnDraftSession): EfxbnDraftSession {
  if (draft.dirtyKeys.size === 0) return draft;
  const nextEntries = draft.controlLookupEntries.map((entry) => {
    const baseline = draft.baselineValues.get(entry.index);
    if (baseline === undefined || nearlyEqual(baseline, entry.value)) return entry;
    return cloneEntry(entry, baseline);
  });
  return {
    ...draft,
    controlLookupEntries: nextEntries,
    dirtyKeys: new Set(),
  };
}

/**
 * Unique lookup-index patches for write-back. Last dirty key wins if two lanes
 * somehow shared an index (corpus constants do not).
 */
export function listControlConstantPatches(
  draft: EfxbnDraftSession,
): EfxbnControlConstantPatch[] {
  const byIndex = new Map<number, number>();
  for (const key of draft.dirtyKeys) {
    const separator = key.indexOf(":");
    if (separator < 0) {
      throw new Error(`Malformed draft dirty key "${key}".`);
    }
    const blockIndex = Number(key.slice(0, separator));
    const name = key.slice(separator + 1);
    if (!Number.isInteger(blockIndex) || name.length === 0) {
      throw new Error(`Malformed draft dirty key "${key}".`);
    }
    const reference = findControlReference(draft.effects, blockIndex, name);
    if (reference.selector !== 1) {
      throw new Error(
        `Dirty key "${key}" is not a constant lane (selector=${reference.selector}).`,
      );
    }
    const entry = draft.controlLookupEntries[reference.lookupIndex];
    if (!entry) {
      throw new Error(
        `Dirty key "${key}" points to missing lookup index ${reference.lookupIndex}.`,
      );
    }
    byIndex.set(reference.lookupIndex, entry.value);
  }
  return [...byIndex.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([lookupIndex, value]) => ({ lookupIndex, value }));
}

/**
 * After a successful disk write of specific constant patches, re-baseline only the
 * written lookup indices. Live entry values are left alone so concurrent edits made
 * during the write stay in the draft and remain dirty when they differ from disk.
 */
export function acceptWrittenPatches(
  draft: EfxbnDraftSession,
  patches: readonly EfxbnControlConstantPatch[],
): EfxbnDraftSession {
  if (patches.length === 0) return draft;
  const baselineValues = new Map(draft.baselineValues);
  for (const patch of patches) {
    if (!Number.isFinite(patch.value)) {
      throw new Error(`Written patch value for lookup index ${patch.lookupIndex} is not finite.`);
    }
    baselineValues.set(patch.lookupIndex, patch.value);
  }

  const nextDirty = new Set<EfxbnDirtyKey>();
  for (const key of draft.dirtyKeys) {
    const separator = key.indexOf(":");
    if (separator < 0) {
      throw new Error(`Malformed draft dirty key "${key}".`);
    }
    const blockIndex = Number(key.slice(0, separator));
    const name = key.slice(separator + 1);
    if (!Number.isInteger(blockIndex) || name.length === 0) {
      throw new Error(`Malformed draft dirty key "${key}".`);
    }
    const reference = findControlReference(draft.effects, blockIndex, name);
    if (reference.selector !== 1) {
      throw new Error(
        `Dirty key "${key}" is not a constant lane (selector=${reference.selector}).`,
      );
    }
    const entry = draft.controlLookupEntries[reference.lookupIndex];
    if (!entry) {
      throw new Error(`Dirty key "${key}" points to missing lookup index ${reference.lookupIndex}.`);
    }
    const baseline = baselineValues.get(reference.lookupIndex);
    if (baseline === undefined || !nearlyEqual(baseline, entry.value)) {
      nextDirty.add(key);
    }
  }

  return {
    ...draft,
    baselineValues,
    dirtyKeys: nextDirty,
  };
}

/** After a successful full write of the entire dirty set, re-baseline every entry. */
export function acceptEfxbnDraftWrite(draft: EfxbnDraftSession): EfxbnDraftSession {
  const baselineValues = new Map<number, number>();
  for (const entry of draft.controlLookupEntries) {
    baselineValues.set(entry.index, entry.value);
  }
  return {
    ...draft,
    baselineValues,
    dirtyKeys: new Set(),
  };
}

export function readColorConstants(
  draft: EfxbnDraftSession,
  blockIndex: number,
): { r: number; g: number; b: number; a: number } {
  return {
    r: getControlConstant(draft, blockIndex, "colorR"),
    g: getControlConstant(draft, blockIndex, "colorG"),
    b: getControlConstant(draft, blockIndex, "colorB"),
    a: getControlConstant(draft, blockIndex, "colorA"),
  };
}

export function patchColorConstants(
  draft: EfxbnDraftSession,
  blockIndex: number,
  color: { r?: number; g?: number; b?: number; a?: number },
): EfxbnDraftSession {
  let next = draft;
  if (color.r !== undefined) next = patchControlConstant(next, blockIndex, "colorR", color.r);
  if (color.g !== undefined) next = patchControlConstant(next, blockIndex, "colorG", color.g);
  if (color.b !== undefined) next = patchControlConstant(next, blockIndex, "colorB", color.b);
  if (color.a !== undefined) next = patchControlConstant(next, blockIndex, "colorA", color.a);
  return next;
}
