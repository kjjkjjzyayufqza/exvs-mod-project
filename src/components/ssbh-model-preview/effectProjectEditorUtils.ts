import { Buffer } from "buffer";
import {
  type EffectProjectEntrySnapshot,
  buildCharacterEffectProjectBuffer,
  effectProjectEntryToSnapshot,
  type CharacterEffectProject,
} from "@/models/characterEffectProject";
import { CommandsData } from "@/models/commandsData";

export type EffectProjectEditorDocument = {
  magic: string;
  fileSize: number;
  effectProjectCount: number;
  commandsCount: number;
  eachEffectProjectSize: number;
  commandIds: number[];
  /** Each command block is exactly 0xc bytes. */
  commandPayloads: Uint8Array[];
  effectProjectIds: number[];
  entries: EffectProjectEntrySnapshot[];
};

export function documentFromCharacterEffectProject(parsed: CharacterEffectProject): EffectProjectEditorDocument {
  const commandIds: number[] = [];
  const commandPayloads: Uint8Array[] = [];
  for (let i = 0; i < parsed.CommandsCount; i++) {
    commandIds.push(parsed.CommandsData.CommandsId[i]!.readInt32LE(0));
    commandPayloads.push(new Uint8Array(parsed.CommandsData.CommandsData[i]!));
  }
  return {
    magic: parsed.Magic,
    fileSize: parsed.FileSize,
    effectProjectCount: parsed.EffectProjectCount,
    commandsCount: parsed.CommandsCount,
    eachEffectProjectSize: parsed.EachEffectProjectSize,
    commandIds,
    commandPayloads,
    effectProjectIds: parsed.EffectProjectData.map((e) => e.EffectProjectId),
    entries: parsed.EffectProjectData.map((e) => effectProjectEntryToSnapshot(e)),
  };
}

function buildCommandsData(ids: number[], payloads: Uint8Array[]): CommandsData {
  const n = ids.length;
  if (payloads.length !== n) {
    throw new Error("commandIds and commandPayloads length mismatch");
  }
  const buf = Buffer.alloc(n * 0x4 + n * 0xc);
  for (let i = 0; i < n; i++) {
    buf.writeInt32LE(ids[i]!, i * 0x4);
  }
  for (let i = 0; i < n; i++) {
    const p = payloads[i]!;
    if (p.byteLength !== 0xc) {
      throw new Error(`Command payload ${i} must be 0xc bytes, got ${p.byteLength}`);
    }
    Buffer.from(p).copy(buf, n * 0x4 + i * 0xc);
  }
  return new CommandsData(buf, n);
}

export function bufferFromEditorDocument(doc: EffectProjectEditorDocument): Buffer {
  const cmds = buildCommandsData(doc.commandIds, doc.commandPayloads);
  const ec = doc.effectProjectIds.length;
  const cc = doc.commandIds.length;
  if (ec !== doc.entries.length) {
    throw new Error("effectProjectIds length does not match entries length");
  }
  return buildCharacterEffectProjectBuffer({
    Magic: doc.magic,
    CommandsData: cmds,
    EffectProjectCount: ec,
    CommandsCount: cc,
    EffectProjectData: doc.entries,
  });
}

/** Keep header counts, file size, and id table aligned after row edits (mutates `d`). */
/**
 * Next EffectProjectId for Add / Copy as new: max(existing) + 1, then advance while taken.
 * Does not reorder the document; save path sorts by signed id.
 */
export function nextEffectProjectIdMaxPlusOneUnique(existingIds: number[]): number {
  if (existingIds.length === 0) {
    return 0;
  }
  const inUse = new Set(existingIds);
  let candidate = Math.max(...existingIds) + 1;
  while (inUse.has(candidate)) {
    candidate += 1;
    if (candidate > 0x7fff_ffff) {
      throw new Error("No free EffectProjectId in int32 range");
    }
  }
  return candidate | 0;
}

/**
 * Reorder effect_project rows for save: ascending **uint32** order of raw int32 LE EffectProjectId
 * (same order as consecutive id bytes in the id table: low 32-bit value to high).
 * Stable when duplicate ids exist (tie-break: original index) — duplicates are rejected by assert before save.
 */
export function sortEffectProjectRowsByEffectProjectIdAscending(
  doc: EffectProjectEditorDocument,
): EffectProjectEditorDocument {
  const out = cloneEffectProjectDocument(doc);
  const indexed = out.entries.map((e, i) => ({ e, i }));
  indexed.sort((a, b) => {
    const ua = a.e.EffectProjectId >>> 0;
    const ub = b.e.EffectProjectId >>> 0;
    if (ua < ub) return -1;
    if (ua > ub) return 1;
    return a.i - b.i;
  });
  out.entries = indexed.map((x) => x.e);
  reconcileEffectProjectDerivedFields(out);
  return out;
}

export function reconcileEffectProjectDerivedFields(d: EffectProjectEditorDocument): void {
  for (let i = 0; i < d.entries.length; i++) {
    d.effectProjectIds[i] = d.entries[i]!.EffectProjectId;
  }
  d.effectProjectCount = d.entries.length;
  d.commandsCount = d.commandIds.length;
  d.fileSize = computeEffectProjectFileSize(d);
}

export function cloneEffectProjectDocument(doc: EffectProjectEditorDocument): EffectProjectEditorDocument {
  return {
    magic: doc.magic,
    fileSize: doc.fileSize,
    effectProjectCount: doc.effectProjectCount,
    commandsCount: doc.commandsCount,
    eachEffectProjectSize: doc.eachEffectProjectSize,
    commandIds: [...doc.commandIds],
    commandPayloads: doc.commandPayloads.map((p) => Uint8Array.from(p)),
    effectProjectIds: [...doc.effectProjectIds],
    entries: doc.entries.map((e) => ({ ...e })),
  };
}

export function isEffectProjectDocumentDirty(
  base: EffectProjectEditorDocument | null,
  draft: EffectProjectEditorDocument | null,
): boolean {
  if (!base || !draft) return false;
  return JSON.stringify(serializeForCompare(base)) !== JSON.stringify(serializeForCompare(draft));
}

export function computeNextEffectProjectDirtyState(input: {
  base: EffectProjectEditorDocument | null;
  draft: EffectProjectEditorDocument | null;
}): boolean {
  return isEffectProjectDocumentDirty(input.base, input.draft);
}

export function computeEffectProjectFileSize(doc: {
  commandsCount: number;
  effectProjectCount: number;
}): number {
  const commandsTotal = doc.commandsCount * 0x4 + doc.commandsCount * 0xc;
  return 0x20 + commandsTotal + doc.effectProjectCount * 0x4 + doc.effectProjectCount * 0x90;
}

export function int32LeBytesToBeInterpretation(le: number): number {
  const b = Buffer.alloc(4);
  b.writeInt32LE(le, 0);
  return b.readInt32BE(0);
}

/** Inverse of int32LeBytesToBeInterpretation: same 4-byte pattern, int32 BE → int32 LE. */
export function int32BeBytesToLeInterpretation(be: number): number {
  const b = Buffer.alloc(4);
  b.writeInt32BE(be, 0);
  return b.readInt32LE(0);
}

export function assertEffectProjectValidForSave(doc: EffectProjectEditorDocument): void {
  if (doc.commandIds.length !== doc.commandsCount) {
    throw new Error("commandsCount does not match commandIds length");
  }
  if (doc.commandPayloads.length !== doc.commandsCount) {
    throw new Error("commandsCount does not match commandPayloads length");
  }
  for (let i = 0; i < doc.commandPayloads.length; i++) {
    if (doc.commandPayloads[i]!.byteLength !== 0xc) {
      throw new Error(`Command payload ${i} must be 0xc bytes`);
    }
  }
  if (doc.effectProjectIds.length !== doc.effectProjectCount) {
    throw new Error("effectProjectCount does not match effectProjectIds length");
  }
  if (doc.entries.length !== doc.effectProjectCount) {
    throw new Error("effectProjectCount does not match entries length");
  }
  for (let i = 0; i < doc.entries.length; i++) {
    if (doc.entries[i]!.EffectProjectId !== doc.effectProjectIds[i]) {
      throw new Error(`EffectProjectId mismatch at row ${i}`);
    }
  }
  const projectIds = doc.entries.map((e) => e.EffectProjectId);
  const unique = new Set(projectIds);
  if (unique.size !== projectIds.length) {
    throw new Error("Duplicate EffectProjectId values are not allowed");
  }
  if (doc.eachEffectProjectSize !== 0x90) {
    throw new Error("eachEffectProjectSize must be 0x90");
  }
}

function serializeForCompare(doc: EffectProjectEditorDocument): unknown {
  return {
    magic: doc.magic,
    fileSize: doc.fileSize,
    effectProjectCount: doc.effectProjectCount,
    commandsCount: doc.commandsCount,
    eachEffectProjectSize: doc.eachEffectProjectSize,
    commandIds: doc.commandIds,
    commandPayloads: doc.commandPayloads.map((p) => Buffer.from(p).toString("hex")),
    effectProjectIds: doc.effectProjectIds,
    entries: doc.entries,
  };
}
