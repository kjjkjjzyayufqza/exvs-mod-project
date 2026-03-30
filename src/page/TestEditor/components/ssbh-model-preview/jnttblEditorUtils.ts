import type { JnttblEditorDocument, JnttblEntryRow, JnttblReadResult } from "./jnttblIoService";

/**
 * Header `bone_count` must match the skeleton bone count when nusktb names are available.
 * Use this value when serializing to disk so the file does not keep a stale count.
 */
export function resolveJnttblBoneCountForSave(d: JnttblEditorDocument): number {
  const n = d.nusktb.boneNames?.length ?? 0;
  if (n > 0) {
    return Math.min(0xffffffff, n) >>> 0;
  }
  return d.boneCount >>> 0;
}

export function readResultToEditorDocument(r: JnttblReadResult): JnttblEditorDocument {
  const boneNames = r.nusktb.boneNames ? [...r.nusktb.boneNames] : null;
  const boneCount =
    boneNames && boneNames.length > 0
      ? (Math.min(0xffffffff, boneNames.length) >>> 0)
      : r.boneCount;
  return {
    ...r,
    boneCount,
    entries: r.entries.map((e) => ({ ...e })),
    nusktb: {
      ...r.nusktb,
      boneNames,
    },
    nusktbPathOverride: null,
  };
}

export function cloneJnttblEditorDocument(d: JnttblEditorDocument): JnttblEditorDocument {
  return {
    ...d,
    entries: d.entries.map((e) => ({ ...e })),
    nusktb: {
      ...d.nusktb,
      boneNames: d.nusktb.boneNames ? [...d.nusktb.boneNames] : null,
    },
  };
}

function normalizeEntry(e: JnttblEntryRow): JnttblEntryRow {
  return { hashId: e.hashId >>> 0, boneIndex: e.boneIndex >>> 0 };
}

function entriesEqual(a: JnttblEntryRow[], b: JnttblEntryRow[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = normalizeEntry(a[i]);
    const y = normalizeEntry(b[i]);
    if (x.hashId !== y.hashId || x.boneIndex !== y.boneIndex) return false;
  }
  return true;
}

export function isJnttblDraftDirty(
  base: JnttblEditorDocument | null,
  draft: JnttblEditorDocument | null,
): boolean {
  if (!base || !draft) return false;
  if (base.version !== draft.version) return true;
  if (base.boneCount !== draft.boneCount) return true;
  if (base.flag !== draft.flag) return true;
  if (!entriesEqual(base.entries, draft.entries)) return true;
  return false;
}

function isU32(n: number): boolean {
  return Number.isFinite(n) && n === Math.trunc(n) && n >= 0 && n <= 0xffffffff;
}

function isI32(n: number): boolean {
  return Number.isFinite(n) && n === Math.trunc(n) && n >= -0x8000_0000 && n <= 0x7fff_ffff;
}

export function assertJnttblValidForSave(d: JnttblEditorDocument): void {
  if (!isU32(d.version)) {
    throw new Error("Invalid JNTT version (expected unsigned 32-bit integer)");
  }
  if (!isU32(d.boneCount)) {
    throw new Error("Invalid bone count (expected unsigned 32-bit integer)");
  }
  if (!isI32(d.flag)) {
    throw new Error("Invalid flag (expected signed 32-bit integer)");
  }
  if (d.entries.length > 0x1_0000_0000) {
    throw new Error("Too many JNTT entries");
  }
  for (let i = 0; i < d.entries.length; i++) {
    const e = d.entries[i];
    if (!isU32(e.hashId) || !isU32(e.boneIndex)) {
      throw new Error(`Invalid entry at row ${i + 1}: hash id and bone index must be u32`);
    }
    const names = d.nusktb.boneNames;
    if (names && names.length > 0 && e.boneIndex >= names.length) {
      throw new Error(
        `Entry row ${i + 1}: bone index ${e.boneIndex} is out of range for loaded skeleton (0..${names.length - 1})`,
      );
    }
  }
}
