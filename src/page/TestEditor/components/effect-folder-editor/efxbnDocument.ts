import type {
  EffectFolderHash,
  EfxbnControlLookupEntry,
  EfxbnControlReferenceSummary,
  EfxbnEffectSummary,
  EfxbnSummary,
} from "@/services/effectFolder/effectFolderService";
import {
  assertEfxbnRuntimeParity,
  deriveEfxbnRuntimeForAll,
} from "./efxbnRuntimeDerive";
import {
  efxbnFieldId,
  readEfxbnField,
  type EfxbnFieldDescriptor,
} from "./efxbnFieldSchema";

/**
 * The editable EFXBN document.
 *
 * One mutable state, one writer. Every edit is a named command producing a **new** document, which
 * is what gives undo, redo, a dirty ledger and a human-readable change list for free. Byte
 * patching is deliberately gone: resizing the curve key table, retopologising the block tree and
 * rebinding a model all change region lengths and header counts, which a byte patch cannot
 * express, and two write paths that can disagree is the worst failure mode this format has.
 *
 * `runtime` is derived, never authored — after every command it is recomputed from the authored
 * fields so the preview reflects what the game would load.
 */

export type EfxbnDocument = {
  readonly path: string;
  readonly effectRoot: string;
  /** Current state, with `runtime` re-derived. */
  readonly summary: EfxbnSummary;
  /** State as of the last successful save, for dirty comparison and revert. */
  readonly baseline: EfxbnSummary;
  readonly past: readonly EfxbnSummary[];
  readonly future: readonly EfxbnSummary[];
  /** Labels of applied commands, newest last, for the save dialog. */
  readonly changeLog: readonly string[];
};

const HISTORY_LIMIT = 200;

/** The 18 curve slots, in the order the block stores their control references. */
export const EFXBN_CONTROL_NAMES = [
  "spawnForm0",
  "spawnForm1",
  "spawnForm2",
  "spawnForm3",
  "spreadX",
  "spreadY",
  "speedBaseX",
  "speedBaseY",
  "speedBaseZ",
  "scaleBaseX",
  "scaleBaseY",
  "scaleBaseZ",
  "colorR",
  "colorG",
  "colorB",
  "colorA",
  "worldGravityAccel",
  "directionAccel",
] as const;

export type EfxbnControlName = (typeof EFXBN_CONTROL_NAMES)[number];

export type EfxbnCurveKey = { key: number; value: number };

/** Native progress values closer than this are indistinguishable to editor interactions. */
export const EFXBN_KEY_EPSILON = 1e-5;

export type EfxbnCurve = {
  name: EfxbnControlName;
  referenceIndex: number;
  /** `selector` is the key count and `lookupIndex` the first key index. */
  lookupIndex: number;
  keys: EfxbnCurveKey[];
};

// ---------------------------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------------------------

function requireBlock(summary: EfxbnSummary, blockIndex: number): EfxbnEffectSummary {
  const block = summary.effects[blockIndex];
  if (!block) {
    throw new Error(`EFXBN block ${blockIndex} does not exist (${summary.effects.length} blocks)`);
  }
  return block;
}

function requireReference(
  block: EfxbnEffectSummary,
  controlName: EfxbnControlName,
): { reference: EfxbnControlReferenceSummary; referenceIndex: number } {
  const referenceIndex = block.controlReferences.findIndex((entry) => entry.name === controlName);
  const reference = block.controlReferences[referenceIndex];
  if (!reference) {
    throw new Error(`EFXBN block ${block.index} has no control named ${controlName}`);
  }
  return { reference, referenceIndex };
}

/** The keys one control owns, resolved out of the shared key table. */
export function readEfxbnCurve(
  summary: EfxbnSummary,
  blockIndex: number,
  controlName: EfxbnControlName,
): EfxbnCurve {
  const block = requireBlock(summary, blockIndex);
  const { reference, referenceIndex } = requireReference(block, controlName);
  const end = reference.lookupIndex + reference.selector;
  if (end > summary.controlLookupEntries.length) {
    throw new Error(
      `EFXBN block ${blockIndex} control ${controlName} reads keys ` +
        `${reference.lookupIndex}..${end}, past curveKeyCount ${summary.controlLookupEntries.length}`,
    );
  }
  const keys = summary.controlLookupEntries
    .slice(reference.lookupIndex, end)
    .map((entry) => ({ key: entry.key, value: entry.value }));
  return { name: controlName, referenceIndex, lookupIndex: reference.lookupIndex, keys };
}

/** True when the control is a single key, i.e. a plain constant rather than an animated curve. */
export function isEfxbnCurveConstant(curve: EfxbnCurve): boolean {
  return curve.keys.length === 1;
}

/** The four colour channels, in the order the colour panel paints them. */
export const EFXBN_COLOR_CONTROL_NAMES = ["colorR", "colorG", "colorB", "colorA"] as const;

export type EfxbnColorControlName = (typeof EFXBN_COLOR_CONTROL_NAMES)[number];

/**
 * The value of a single-key control, or null when the control is animated.
 *
 * A caller that wants to paint a constant needs to know it is one: writing a colour into an
 * animated channel would silently discard every key but the first.
 */
export function tryReadEfxbnCurveConstant(
  summary: EfxbnSummary,
  blockIndex: number,
  controlName: EfxbnControlName,
): number | null {
  const curve = readEfxbnCurve(summary, blockIndex, controlName);
  return curve.keys.length === 1 ? (curve.keys[0]?.value ?? null) : null;
}

/** True when this block's authored state or any of its curves differs from the last save. */
export function isEfxbnBlockDirty(document: EfxbnDocument, blockIndex: number): boolean {
  return efxbnDirtyBlockIndexes(document).has(blockIndex);
}

// ---------------------------------------------------------------------------------------------
// Document lifecycle
// ---------------------------------------------------------------------------------------------

/**
 * Builds a document from a freshly parsed summary.
 *
 * Runs the runtime-mirror parity check, so a divergence between the TypeScript normalization and
 * the backend's own surfaces on the file that exposes it rather than as a quietly wrong preview.
 */
export function createEfxbnDocument(
  summary: EfxbnSummary,
  path: string,
  effectRoot: string,
): EfxbnDocument {
  const trimmedPath = path.trim();
  if (!trimmedPath) throw new Error("EFXBN document needs a file path");
  const trimmedRoot = effectRoot.trim();
  if (!trimmedRoot) throw new Error("EFXBN document needs an effect root");
  assertEfxbnRuntimeParity(summary.effects, summary.modelControls);
  const normalized = withDerivedRuntime(summary);
  return {
    path: trimmedPath,
    effectRoot: trimmedRoot,
    summary: normalized,
    baseline: normalized,
    past: [],
    future: [],
    changeLog: [],
  };
}

function withDerivedRuntime(summary: EfxbnSummary): EfxbnSummary {
  return { ...summary, effects: deriveEfxbnRuntimeForAll(summary.effects, summary.modelControls) };
}

/** Applies one command's result, pushing the previous state onto the undo stack. */
function commit(document: EfxbnDocument, next: EfxbnSummary, label: string): EfxbnDocument {
  const past = [...document.past, document.summary].slice(-HISTORY_LIMIT);
  return {
    ...document,
    summary: withDerivedRuntime(next),
    past,
    future: [],
    changeLog: [...document.changeLog, label].slice(-HISTORY_LIMIT),
  };
}

export function canUndoEfxbn(document: EfxbnDocument): boolean {
  return document.past.length > 0;
}

export function canRedoEfxbn(document: EfxbnDocument): boolean {
  return document.future.length > 0;
}

export function undoEfxbn(document: EfxbnDocument): EfxbnDocument {
  const previous = document.past[document.past.length - 1];
  if (!previous) return document;
  return {
    ...document,
    summary: previous,
    past: document.past.slice(0, -1),
    future: [document.summary, ...document.future].slice(0, HISTORY_LIMIT),
    changeLog: document.changeLog.slice(0, -1),
  };
}

export function redoEfxbn(document: EfxbnDocument): EfxbnDocument {
  const next = document.future[0];
  if (!next) return document;
  return {
    ...document,
    summary: next,
    past: [...document.past, document.summary].slice(-HISTORY_LIMIT),
    future: document.future.slice(1),
    changeLog: [...document.changeLog, "redo"].slice(-HISTORY_LIMIT),
  };
}

/** Drops every change back to the last saved state, keeping the history empty rather than stale. */
export function revertEfxbnDocument(document: EfxbnDocument): EfxbnDocument {
  return { ...document, summary: document.baseline, past: [], future: [], changeLog: [] };
}

/** Re-baselines after a successful write, so the document stops reading as dirty. */
export function acceptEfxbnDocumentWrite(
  document: EfxbnDocument,
  writtenSummary: EfxbnSummary,
): EfxbnDocument {
  const normalized = withDerivedRuntime(writtenSummary);
  return { ...document, summary: normalized, baseline: normalized, past: [], future: [], changeLog: [] };
}

// ---------------------------------------------------------------------------------------------
// Dirty tracking
// ---------------------------------------------------------------------------------------------

export function isEfxbnDocumentDirty(document: EfxbnDocument): boolean {
  return document.summary !== document.baseline;
}

/** Field ids that differ from the baseline for one block, for the dirty dot in the property rows. */
export function efxbnDirtyFieldIds(
  document: EfxbnDocument,
  blockIndex: number,
  fields: readonly EfxbnFieldDescriptor[],
): Set<string> {
  const current = document.summary.effects[blockIndex];
  const baseline = document.baseline.effects[blockIndex];
  const dirty = new Set<string>();
  if (!current || !baseline) return dirty;
  for (const field of fields) {
    if (readEfxbnField(current, field) !== readEfxbnField(baseline, field)) {
      dirty.add(efxbnFieldId(field));
    }
  }
  return dirty;
}

/** Block indices that differ from the baseline in any way, for the tree's dirty markers. */
export function efxbnDirtyBlockIndexes(document: EfxbnDocument): Set<number> {
  const dirty = new Set<number>();
  const count = Math.max(document.summary.effects.length, document.baseline.effects.length);
  for (let index = 0; index < count; index += 1) {
    const current = document.summary.effects[index];
    const baseline = document.baseline.effects[index];
    if (!current || !baseline) {
      dirty.add(index);
      continue;
    }
    if (!sameBlockAuthoredState(current, baseline, document, index)) dirty.add(index);
  }
  return dirty;
}

function sameBlockAuthoredState(
  current: EfxbnEffectSummary,
  baseline: EfxbnEffectSummary,
  document: EfxbnDocument,
  index: number,
): boolean {
  // `runtime` is derived, so comparing it would report a block as dirty because of an edit
  // somewhere else in the tree.
  const strip = ({ runtime: _runtime, ...rest }: EfxbnEffectSummary) => rest;
  if (JSON.stringify(strip(current)) !== JSON.stringify(strip(baseline))) return false;
  for (const name of EFXBN_CONTROL_NAMES) {
    const left = readEfxbnCurve(document.summary, index, name);
    const right = readEfxbnCurve(document.baseline, index, name);
    if (JSON.stringify(left.keys) !== JSON.stringify(right.keys)) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------------------------
// Commands — scalar fields
// ---------------------------------------------------------------------------------------------

function replaceBlock(
  summary: EfxbnSummary,
  blockIndex: number,
  update: (block: EfxbnEffectSummary) => EfxbnEffectSummary,
): EfxbnSummary {
  const effects = summary.effects.map((block, index) =>
    index === blockIndex ? update(block) : block,
  );
  return { ...summary, effects };
}

/** Writes one schema field. Vector components are replaced immutably, never mutated in place. */
export function setEfxbnField(
  document: EfxbnDocument,
  blockIndex: number,
  field: EfxbnFieldDescriptor,
  value: number,
): EfxbnDocument {
  if (!Number.isFinite(value)) {
    throw new Error(`EFXBN field ${efxbnFieldId(field)} rejects a non-finite value: ${value}`);
  }
  if (field.kind !== "float" && !Number.isInteger(value)) {
    throw new Error(`EFXBN field ${efxbnFieldId(field)} is integral, received ${value}`);
  }
  requireBlock(document.summary, blockIndex);
  const next = replaceBlock(document.summary, blockIndex, (block) => {
    if (field.component === undefined) {
      return { ...block, [field.key]: value } as EfxbnEffectSummary;
    }
    const vector = block[field.key];
    if (!Array.isArray(vector)) {
      throw new Error(`EFXBN field ${field.key} is not a vector`);
    }
    const updated = vector.map((entry, index) => (index === field.component ? value : entry));
    return { ...block, [field.key]: updated } as EfxbnEffectSummary;
  });
  return commit(document, next, `${field.label} = ${value}`);
}

// ---------------------------------------------------------------------------------------------
// Commands — resource binding
// ---------------------------------------------------------------------------------------------

function hashFromSigned(signed: number): EffectFolderHash {
  const unsigned = signed >>> 0;
  return { signed: signed | 0, unsigned, hex: `0x${unsigned.toString(16).toUpperCase().padStart(8, "0")}` };
}

/**
 * Points a block at a different model.
 *
 * `nudHandle`, `modelId` and `modelHash` are three views of one value; writing one without the
 * others produces a block whose inspector and renderer disagree.
 */
export function setEfxbnBlockModel(
  document: EfxbnDocument,
  blockIndex: number,
  modelHashSigned: number,
): EfxbnDocument {
  if (!Number.isInteger(modelHashSigned)) {
    throw new Error(`EFXBN model hash must be an integer, received ${modelHashSigned}`);
  }
  requireBlock(document.summary, blockIndex);
  const hash = hashFromSigned(modelHashSigned);
  const next = replaceBlock(document.summary, blockIndex, (block) => ({
    ...block,
    nudHandle: modelHashSigned,
    modelId: modelHashSigned,
    modelHash: hash,
  }));
  return commit(document, next, `Model = ${hash.hex}`);
}

export type EfxbnTextureSlotKey =
  | { field: "colorTextureParameterIndex"; component: 0 | 1 }
  | { field: "uvTextureParameterIndex"; component: 0 | 1 };

/**
 * Binds a texture-parameter slot, or clears it with `-1`.
 *
 * The index addresses `textureParameters`; an index past its end would make the renderer read a
 * slot that does not exist, so it is refused here rather than at draw time.
 */
export function setEfxbnBlockTextureSlot(
  document: EfxbnDocument,
  blockIndex: number,
  slot: EfxbnTextureSlotKey,
  parameterIndex: number,
): EfxbnDocument {
  if (!Number.isInteger(parameterIndex)) {
    throw new Error(`EFXBN texture parameter index must be an integer, received ${parameterIndex}`);
  }
  if (parameterIndex < -1) {
    throw new Error(`EFXBN texture parameter index must be -1 or positive, received ${parameterIndex}`);
  }
  if (parameterIndex >= 0 && parameterIndex >= document.summary.textureParameters.length) {
    throw new Error(
      `EFXBN texture parameter ${parameterIndex} is out of range ` +
        `(${document.summary.textureParameters.length} parameters)`,
    );
  }
  requireBlock(document.summary, blockIndex);
  const next = replaceBlock(document.summary, blockIndex, (block) => {
    const current = block[slot.field];
    const updated = current.map((entry, index) =>
      index === slot.component ? parameterIndex : entry,
    ) as [number, number];
    return { ...block, [slot.field]: updated } as EfxbnEffectSummary;
  });
  const label = slot.field === "colorTextureParameterIndex" ? "Colour map" : "UV offset map";
  return commit(document, next, `${label}${slot.component === 1 ? " (pass 2)" : ""} = ${parameterIndex}`);
}

// ---------------------------------------------------------------------------------------------
// Commands — curves
// ---------------------------------------------------------------------------------------------

function replaceCurveKeys(
  summary: EfxbnSummary,
  blockIndex: number,
  controlName: EfxbnControlName,
  keys: readonly EfxbnCurveKey[],
): EfxbnSummary {
  if (keys.length === 0) {
    throw new Error(`EFXBN curve ${controlName} must keep at least one key`);
  }
  const block = requireBlock(summary, blockIndex);
  const { reference } = requireReference(block, controlName);
  const before = summary.controlLookupEntries.slice(0, reference.lookupIndex);
  const after = summary.controlLookupEntries.slice(reference.lookupIndex + reference.selector);
  const inserted: EfxbnControlLookupEntry[] = keys.map((entry, offset) => ({
    index: reference.lookupIndex + offset,
    key: entry.key,
    value: entry.value,
    keyF32Bits: floatToBits(entry.key),
    valueF32Bits: floatToBits(entry.value),
  }));
  const shift = keys.length - reference.selector;
  const controlLookupEntries = [...before, ...inserted, ...after].map((entry, index) => ({
    ...entry,
    index,
  }));

  // Every reference that starts after the edited range moves by the size delta. Curves are never
  // shared (0 of 130,842 references in the shipped corpus alias another), so nothing else moves.
  const effects = summary.effects.map((candidate, index) => ({
    ...candidate,
    controlReferences: candidate.controlReferences.map((entry) => {
      if (index === blockIndex && entry.name === controlName) {
        return { ...entry, selector: keys.length };
      }
      if (entry.lookupIndex > reference.lookupIndex && shift !== 0) {
        return { ...entry, lookupIndex: entry.lookupIndex + shift };
      }
      return entry;
    }),
  }));

  return {
    ...summary,
    effects,
    controlLookupEntries,
    curveKeyCount: controlLookupEntries.length,
  };
}

function floatToBits(value: number): number {
  const buffer = new DataView(new ArrayBuffer(4));
  buffer.setFloat32(0, value, true);
  return buffer.getUint32(0, true);
}

/** Edits one key's time and/or value in place; the key count is unchanged. */
export type EfxbnCurveReplacement = {
  controlName: EfxbnControlName;
  keys: readonly EfxbnCurveKey[];
};

function validatedCurveKeys(
  controlName: EfxbnControlName,
  keys: readonly EfxbnCurveKey[],
): EfxbnCurveKey[] {
  if (keys.length === 0) {
    throw new Error(`EFXBN curve ${controlName} must keep at least one key`);
  }
  const ordered = keys
    .map((entry) => {
      if (!Number.isFinite(entry.key) || !Number.isFinite(entry.value)) {
        throw new Error(
          `EFXBN curve ${controlName} rejects a non-finite key (${entry.key}, ${entry.value})`,
        );
      }
      return { key: entry.key, value: entry.value };
    })
    .sort((left, right) => left.key - right.key);
  assertEfxbnCurveKeySequence(controlName, ordered);
  return ordered;
}

function assertEfxbnCurveKeySequence(
  controlName: string,
  keys: readonly EfxbnCurveKey[],
): void {
  if (keys.length === 0) {
    throw new Error(`EFXBN curve ${controlName} must keep at least one key`);
  }
  for (const entry of keys) {
    if (!Number.isFinite(entry.key) || !Number.isFinite(entry.value)) {
      throw new Error(
        `EFXBN curve ${controlName} rejects a non-finite key (${entry.key}, ${entry.value})`,
      );
    }
  }
  for (let index = 1; index < keys.length; index += 1) {
    const previous = keys[index - 1]!.key;
    const current = keys[index]!.key;
    if (current < previous) {
      throw new Error(`EFXBN curve ${controlName} keys are not sorted by progress`);
    }
    if (Math.abs(previous - current) <= EFXBN_KEY_EPSILON) {
      throw new Error(`EFXBN curve ${controlName} has duplicate progress ${current}`);
    }
  }
}

/** Replaces one or more curves as one undoable document command. */
export function replaceEfxbnCurves(
  document: EfxbnDocument,
  blockIndex: number,
  replacements: readonly EfxbnCurveReplacement[],
  label: string,
): EfxbnDocument {
  requireBlock(document.summary, blockIndex);
  if (replacements.length === 0) return document;
  const names = new Set<EfxbnControlName>();
  let next = document.summary;
  for (const replacement of replacements) {
    if (names.has(replacement.controlName)) {
      throw new Error(`EFXBN graph edit replaces ${replacement.controlName} more than once`);
    }
    names.add(replacement.controlName);
    next = replaceCurveKeys(
      next,
      blockIndex,
      replacement.controlName,
      validatedCurveKeys(replacement.controlName, replacement.keys),
    );
  }
  return commit(document, next, label.trim() || "Edit EFXBN curves");
}

/** Edits one key's time and/or value in place; the key count is unchanged. */
export function setEfxbnCurveKey(
  document: EfxbnDocument,
  blockIndex: number,
  controlName: EfxbnControlName,
  keyIndex: number,
  patch: { key?: number; value?: number },
): EfxbnDocument {
  const curve = readEfxbnCurve(document.summary, blockIndex, controlName);
  const existing = curve.keys[keyIndex];
  if (!existing) {
    throw new Error(`EFXBN curve ${controlName} has no key ${keyIndex}`);
  }
  const key = patch.key ?? existing.key;
  const value = patch.value ?? existing.value;
  if (!Number.isFinite(key) || !Number.isFinite(value)) {
    throw new Error(`EFXBN curve ${controlName} rejects a non-finite key (${key}, ${value})`);
  }
  const keys = curve.keys.map((entry, index) => (index === keyIndex ? { key, value } : entry));
  const label = curve.keys.length === 1 ? `${controlName} = ${value}` : `${controlName} key ${keyIndex}`;
  return replaceEfxbnCurves(document, blockIndex, [{ controlName, keys }], label);
}

/**
 * Adds a key, keeping the curve sorted by time.
 *
 * A duplicate time is refused: two keys at the same instant make the evaluated value depend on
 * key order, which is not something the authored data ever expresses.
 */
export function insertEfxbnCurveKey(
  document: EfxbnDocument,
  blockIndex: number,
  controlName: EfxbnControlName,
  key: number,
  value: number,
): EfxbnDocument {
  if (!Number.isFinite(key) || !Number.isFinite(value)) {
    throw new Error(`EFXBN curve ${controlName} rejects a non-finite key (${key}, ${value})`);
  }
  const curve = readEfxbnCurve(document.summary, blockIndex, controlName);
  if (curve.keys.some((entry) => Math.abs(entry.key - key) <= EFXBN_KEY_EPSILON)) {
    throw new Error(`EFXBN curve ${controlName} already has a key at time ${key}`);
  }
  const keys = [...curve.keys, { key, value }].sort((left, right) => left.key - right.key);
  return replaceEfxbnCurves(
    document,
    blockIndex,
    [{ controlName, keys }],
    `${controlName} + key @ ${key}`,
  );
}

/** Removes a key. The last remaining key cannot be removed — a control always evaluates. */
export function deleteEfxbnCurveKey(
  document: EfxbnDocument,
  blockIndex: number,
  controlName: EfxbnControlName,
  keyIndex: number,
): EfxbnDocument {
  const curve = readEfxbnCurve(document.summary, blockIndex, controlName);
  if (!curve.keys[keyIndex]) {
    throw new Error(`EFXBN curve ${controlName} has no key ${keyIndex}`);
  }
  if (curve.keys.length <= 1) {
    throw new Error(`EFXBN curve ${controlName} must keep at least one key`);
  }
  const keys = curve.keys.filter((_entry, index) => index !== keyIndex);
  return replaceEfxbnCurves(
    document,
    blockIndex,
    [{ controlName, keys }],
    `${controlName} - key ${keyIndex}`,
  );
}

// ---------------------------------------------------------------------------------------------
// Commands — topology
// ---------------------------------------------------------------------------------------------

export const EFXBN_MAX_CHILDREN = 8;

function childIndexes(block: EfxbnEffectSummary): number[] {
  return block.childIndexArray.slice(0, block.childIndexSize).filter((index) => index >= 0);
}

function withChildren(block: EfxbnEffectSummary, children: readonly number[]): EfxbnEffectSummary {
  if (children.length > EFXBN_MAX_CHILDREN) {
    throw new Error(
      `EFXBN block ${block.index} cannot take ${children.length} children; the array is ${EFXBN_MAX_CHILDREN} wide`,
    );
  }
  const array = Array.from({ length: EFXBN_MAX_CHILDREN }, (_entry, index) =>
    index < children.length ? (children[index] as number) : -1,
  ) as EfxbnEffectSummary["childIndexArray"];
  return {
    ...block,
    childIndexArray: array,
    childIndexSize: children.length,
    referencedEffectIndex: children.length > 0 ? (children[0] as number) : -1,
  };
}

/** Depth of every block, from the roots down. Blocks nothing references are roots. */
function computeLevels(blocks: readonly EfxbnEffectSummary[]): number[] {
  const parentOf = new Array<number>(blocks.length).fill(-1);
  blocks.forEach((block, index) => {
    for (const child of childIndexes(block)) {
      if (child >= 0 && child < blocks.length) parentOf[child] = index;
    }
  });
  const levels = new Array<number>(blocks.length).fill(0);
  for (let index = 0; index < blocks.length; index += 1) {
    let depth = 0;
    let cursor = parentOf[index] ?? -1;
    const seen = new Set<number>([index]);
    while (cursor >= 0) {
      if (seen.has(cursor)) {
        throw new Error(`EFXBN block tree has a cycle through block ${index}`);
      }
      seen.add(cursor);
      depth += 1;
      cursor = parentOf[cursor] ?? -1;
    }
    levels[index] = depth;
  }
  return levels;
}

function withRecomputedLevels(summary: EfxbnSummary): EfxbnSummary {
  const levels = computeLevels(summary.effects);
  return {
    ...summary,
    effects: summary.effects.map((block, index) => ({ ...block, level: levels[index] ?? 0 })),
  };
}

function blankBlockFrom(template: EfxbnEffectSummary, index: number, effectType: number): EfxbnEffectSummary {
  // Cloning a sibling rather than zeroing keeps every field the editor does not expose at a value
  // the engine already accepts, instead of inventing 145 defaults.
  return withChildren(
    {
      ...template,
      index,
      internalElementDataIndex: index,
      effectType,
      controlReferences: template.controlReferences.map((entry) => ({ ...entry })),
      childIndexArray: [...template.childIndexArray] as EfxbnEffectSummary["childIndexArray"],
      spawnFormLength: [...template.spawnFormLength],
      speedRandom: [...template.speedRandom],
      sizeBase: [...template.sizeBase],
      sizeRandom: [...template.sizeRandom],
      rotationBase: [...template.rotationBase],
      rotationRandom: [...template.rotationRandom],
      rotationSpeed: [...template.rotationSpeed],
      rotationSpeedRandom: [...template.rotationSpeedRandom],
      positionOffset: [...template.positionOffset],
      deleteEndScale: [...template.deleteEndScale],
      blurStartColor: [...template.blurStartColor],
      blurEndColor: [...template.blurEndColor],
      boundingSphereInfo: [...template.boundingSphereInfo],
      centerPivot: [...template.centerPivot],
      colorTextureParameterIndex: [...template.colorTextureParameterIndex],
      uvTextureParameterIndex: [...template.uvTextureParameterIndex],
      pad01: [...template.pad01],
      reserveArea: [...template.reserveArea],
    },
    [],
  );
}

/**
 * Appends a block, duplicating an existing one so every unexposed field stays engine-legal.
 *
 * The new block's curves are copies: each gets its own key range, because no curve in the shipped
 * corpus is ever shared and a duplicate that aliased its source would make editing one change both.
 */
export function addEfxbnBlock(
  document: EfxbnDocument,
  templateIndex: number,
  parentIndex: number | null,
  effectType: number,
): EfxbnDocument {
  const template = requireBlock(document.summary, templateIndex);
  if (parentIndex !== null) {
    const parent = requireBlock(document.summary, parentIndex);
    if (childIndexes(parent).length >= EFXBN_MAX_CHILDREN) {
      throw new Error(`EFXBN block ${parentIndex} already has ${EFXBN_MAX_CHILDREN} children`);
    }
  }

  const newIndex = document.summary.effects.length;
  let summary: EfxbnSummary = {
    ...document.summary,
    effects: [...document.summary.effects, blankBlockFrom(template, newIndex, effectType)],
    effectCount: document.summary.effects.length + 1,
  };

  // Give the clone its own keys, appended so no existing lookupIndex moves.
  let entries = [...summary.controlLookupEntries];
  const references = template.controlReferences.map((entry) => {
    const keys = summary.controlLookupEntries.slice(
      entry.lookupIndex,
      entry.lookupIndex + entry.selector,
    );
    const lookupIndex = entries.length;
    entries = [
      ...entries,
      ...keys.map((key, offset) => ({ ...key, index: lookupIndex + offset })),
    ];
    return { ...entry, lookupIndex };
  });
  summary = {
    ...summary,
    controlLookupEntries: entries,
    curveKeyCount: entries.length,
    effects: summary.effects.map((block, index) =>
      index === newIndex ? { ...block, controlReferences: references } : block,
    ),
  };

  if (parentIndex !== null) {
    summary = replaceBlock(summary, parentIndex, (parent) =>
      withChildren(parent, [...childIndexes(parent), newIndex]),
    );
  }

  return commit(document, withRecomputedLevels(summary), `Add block ${newIndex}`);
}

/**
 * Deletes a block and everything that referenced it.
 *
 * Removing a block renumbers every index past it, in every other block's child array — which is
 * why this is one command rather than a delete plus a fix-up the caller might forget.
 */
export function deleteEfxbnBlock(document: EfxbnDocument, blockIndex: number): EfxbnDocument {
  requireBlock(document.summary, blockIndex);
  if (document.summary.effects.length <= 1) {
    throw new Error("EFXBN file must keep at least one block");
  }

  const remap = new Map<number, number>();
  let cursor = 0;
  for (let index = 0; index < document.summary.effects.length; index += 1) {
    if (index === blockIndex) continue;
    remap.set(index, cursor);
    cursor += 1;
  }

  const removed = requireBlock(document.summary, blockIndex);
  const removedRanges = removed.controlReferences.map((entry) => ({
    start: entry.lookupIndex,
    end: entry.lookupIndex + entry.selector,
  }));
  const dropped = new Set<number>();
  for (const range of removedRanges) {
    for (let index = range.start; index < range.end; index += 1) dropped.add(index);
  }
  const keyRemap = new Map<number, number>();
  const keptEntries: EfxbnControlLookupEntry[] = [];
  for (let index = 0; index < document.summary.controlLookupEntries.length; index += 1) {
    if (dropped.has(index)) continue;
    keyRemap.set(index, keptEntries.length);
    const entry = document.summary.controlLookupEntries[index];
    if (entry) keptEntries.push({ ...entry, index: keptEntries.length });
  }

  const effects = document.summary.effects
    .filter((_block, index) => index !== blockIndex)
    .map((block) => {
      const children = childIndexes(block)
        .filter((child) => child !== blockIndex)
        .map((child) => remap.get(child) ?? -1)
        .filter((child) => child >= 0);
      const reindexed = withChildren(block, children);
      return {
        ...reindexed,
        index: remap.get(block.index) ?? block.index,
        internalElementDataIndex: remap.get(block.index) ?? block.index,
        controlReferences: block.controlReferences.map((entry) => {
          const mapped = keyRemap.get(entry.lookupIndex);
          if (mapped === undefined) {
            throw new Error(
              `EFXBN block ${block.index} control ${entry.name} points at a deleted key range`,
            );
          }
          return { ...entry, lookupIndex: mapped };
        }),
      };
    });

  const summary: EfxbnSummary = {
    ...document.summary,
    effects,
    effectCount: effects.length,
    controlLookupEntries: keptEntries,
    curveKeyCount: keptEntries.length,
  };
  return commit(document, withRecomputedLevels(summary), `Delete block ${blockIndex}`);
}

/** Moves a block under a different parent, or to the root when `parentIndex` is null. */
export function reparentEfxbnBlock(
  document: EfxbnDocument,
  blockIndex: number,
  parentIndex: number | null,
): EfxbnDocument {
  requireBlock(document.summary, blockIndex);
  if (parentIndex === blockIndex) {
    throw new Error(`EFXBN block ${blockIndex} cannot be its own parent`);
  }
  if (parentIndex !== null) {
    const parent = requireBlock(document.summary, parentIndex);
    const existing = childIndexes(parent);
    if (!existing.includes(blockIndex) && existing.length >= EFXBN_MAX_CHILDREN) {
      throw new Error(`EFXBN block ${parentIndex} already has ${EFXBN_MAX_CHILDREN} children`);
    }
    if (isEfxbnDescendant(document.summary.effects, blockIndex, parentIndex)) {
      throw new Error(
        `EFXBN block ${parentIndex} is inside block ${blockIndex}; reparenting would make a cycle`,
      );
    }
  }

  const summary = {
    ...document.summary,
    effects: document.summary.effects.map((block, index) => {
      const children = childIndexes(block).filter((child) => child !== blockIndex);
      if (index === parentIndex) children.push(blockIndex);
      return withChildren(block, children);
    }),
  };
  const label = parentIndex === null ? `Block ${blockIndex} → root` : `Block ${blockIndex} → ${parentIndex}`;
  return commit(document, withRecomputedLevels(summary), label);
}

/** True when `candidate` is inside `rootIndex`'s subtree. */
export function isEfxbnDescendant(
  blocks: readonly EfxbnEffectSummary[],
  rootIndex: number,
  candidate: number,
): boolean {
  const stack = [rootIndex];
  const seen = new Set<number>();
  while (stack.length > 0) {
    const current = stack.pop() as number;
    if (seen.has(current)) continue;
    seen.add(current);
    const block = blocks[current];
    if (!block) continue;
    for (const child of childIndexes(block)) {
      if (child === candidate) return true;
      stack.push(child);
    }
  }
  return false;
}

// ---------------------------------------------------------------------------------------------
// Save-time normalization
// ---------------------------------------------------------------------------------------------

/**
 * Rebuilds the curve key table so every curve's keys are contiguous and in block order, then
 * validates the invariants a written file must satisfy.
 *
 * Recompacting removes keys an edit orphaned and makes `lookupIndex` mechanical rather than a
 * value commands have to maintain. Every check below throws instead of repairing: a document that
 * violates one of these is a bug in a command, and writing a "fixed up" file would hide it.
 */
export function normalizeEfxbnSummaryForWrite(summary: EfxbnSummary): EfxbnSummary {
  const entries: EfxbnControlLookupEntry[] = [];
  const effects = summary.effects.map((block, blockIndex) => {
    if (block.index !== blockIndex) {
      throw new Error(`EFXBN block at position ${blockIndex} carries index ${block.index}`);
    }
    const controlReferences = block.controlReferences.map((reference) => {
      if (reference.selector < 1) {
        throw new Error(
          `EFXBN block ${blockIndex} control ${reference.name} has ${reference.selector} keys`,
        );
      }
      const end = reference.lookupIndex + reference.selector;
      if (end > summary.controlLookupEntries.length) {
        throw new Error(
          `EFXBN block ${blockIndex} control ${reference.name} reads keys ` +
            `${reference.lookupIndex}..${end}, past curveKeyCount ${summary.controlLookupEntries.length}`,
        );
      }
      const lookupIndex = entries.length;
      const ownedKeys: EfxbnCurveKey[] = [];
      for (let offset = 0; offset < reference.selector; offset += 1) {
        const entry = summary.controlLookupEntries[reference.lookupIndex + offset];
        if (!entry) {
          throw new Error(`EFXBN curve key ${reference.lookupIndex + offset} is missing`);
        }
        ownedKeys.push({ key: entry.key, value: entry.value });
      }
      assertEfxbnCurveKeySequence(reference.name, ownedKeys);
      for (let offset = 0; offset < reference.selector; offset += 1) {
        const entry = summary.controlLookupEntries[reference.lookupIndex + offset]!;
        entries.push({ ...entry, index: entries.length });
      }
      return { ...reference, lookupIndex };
    });
    return { ...block, controlReferences };
  });

  assertEfxbnTreeConsistency(effects);

  return {
    ...summary,
    effects,
    effectCount: effects.length,
    controlLookupEntries: entries,
    curveKeyCount: entries.length,
  };
}

/** `childIndexSize`, the child array, `level` and cycle-freedom must all agree before a write. */
export function assertEfxbnTreeConsistency(blocks: readonly EfxbnEffectSummary[]): void {
  blocks.forEach((block, index) => {
    const declared = block.childIndexSize;
    if (declared < 0 || declared > EFXBN_MAX_CHILDREN) {
      throw new Error(`EFXBN block ${index} declares ${declared} children`);
    }
    for (let slot = 0; slot < EFXBN_MAX_CHILDREN; slot += 1) {
      const child = block.childIndexArray[slot] as number;
      if (slot < declared) {
        if (child < 0 || child >= blocks.length) {
          throw new Error(`EFXBN block ${index} child slot ${slot} points at ${child}`);
        }
        if (child === index) {
          throw new Error(`EFXBN block ${index} lists itself as a child`);
        }
      } else if (child !== -1) {
        throw new Error(
          `EFXBN block ${index} child slot ${slot} holds ${child} past childIndexSize ${declared}`,
        );
      }
    }
  });

  const levels = computeLevels(blocks);
  blocks.forEach((block, index) => {
    if (block.level !== levels[index]) {
      throw new Error(
        `EFXBN block ${index} carries level ${block.level} but its depth is ${levels[index]}`,
      );
    }
  });
}

/**
 * Refuses a document where two control references share a key range.
 *
 * No shipped file does this — 0 of 130,842 references in `E:/XB/mod/006effect` alias another — and
 * the curve commands rely on it: an aliased range means editing one block's curve silently edits
 * another's. Asserting rather than assuming turns a violation into a refused save.
 */
export function assertEfxbnCurvesAreExclusive(summary: EfxbnSummary): void {
  const owner = new Map<number, string>();
  for (const block of summary.effects) {
    for (const reference of block.controlReferences) {
      for (let offset = 0; offset < reference.selector; offset += 1) {
        const keyIndex = reference.lookupIndex + offset;
        const existing = owner.get(keyIndex);
        const label = `block ${block.index} ${reference.name}`;
        if (existing) {
          throw new Error(
            `EFXBN curve key ${keyIndex} is claimed by both ${existing} and ${label}`,
          );
        }
        owner.set(keyIndex, label);
      }
    }
  }
}

/** The summary to hand to the writer: recompacted, validated, exclusivity proven. */
export function prepareEfxbnDocumentForWrite(document: EfxbnDocument): EfxbnSummary {
  assertEfxbnCurvesAreExclusive(document.summary);
  const normalized = normalizeEfxbnSummaryForWrite(document.summary);
  assertEfxbnCurvesAreExclusive(normalized);
  return normalized;
}
