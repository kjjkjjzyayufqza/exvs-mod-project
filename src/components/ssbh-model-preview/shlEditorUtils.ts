import type { ShlFileData, ShlRecord } from "./shlIoService";

/** Known SHL model-slot types. Other u32 values are kept and shown as "Unknown (n)". */
export const SHL_MODEL_TYPE_OPTIONS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 0, label: "Body (主机体)" },
  { value: 1, label: "Type 1" },
  { value: 2, label: "Assist (援护)" },
  { value: 3, label: "Part (部件)" },
  { value: 4, label: "Rigid shell" },
  { value: 5, label: "Dormant body" },
  { value: 6, label: "Shared / global" },
  { value: 7, label: "Reserved" },
];

export function shlModelTypeLabel(modelType: number): string {
  const known = SHL_MODEL_TYPE_OPTIONS.find((o) => o.value === (modelType >>> 0));
  return known ? known.label : `Unknown (${modelType >>> 0})`;
}

/** Format a u32 model id as 8 little-endian hex chars (byte order as stored on disk). */
export function formatModelIdLe(v: number): string {
  const x = v >>> 0;
  const h = (n: number) => n.toString(16).toUpperCase().padStart(2, "0");
  return `${h(x & 0xff)}${h((x >>> 8) & 0xff)}${h((x >>> 16) & 0xff)}${h((x >>> 24) & 0xff)}`;
}

/** Parse 1-8 hex digits as a little-endian u32 (inverse of {@link formatModelIdLe}). */
export function parseModelIdLe(s: string): number {
  let t = s.trim().replace(/^0x/i, "");
  if (!t) throw new Error("Model id is empty");
  if (!/^[0-9a-fA-F]{1,8}$/.test(t)) throw new Error("Model id must be 1-8 hex digits");
  if (t.length % 2 === 1) t = `0${t}`;
  t = t.padEnd(8, "0").slice(0, 8);
  const b0 = Number.parseInt(t.slice(0, 2), 16);
  const b1 = Number.parseInt(t.slice(2, 4), 16);
  const b2 = Number.parseInt(t.slice(4, 6), 16);
  const b3 = Number.parseInt(t.slice(6, 8), 16);
  return (b0 | (b1 << 8) | (b2 << 16) | (b3 << 24)) >>> 0;
}

export function cloneShlFileData(d: ShlFileData): ShlFileData {
  return {
    version: d.version,
    reserved08: d.reserved08,
    records: d.records.map((r) => ({ ...r })),
    trailingData: [...d.trailingData],
  };
}

function recordsEqual(a: ShlRecord[], b: ShlRecord[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (
      (x.modelId >>> 0) !== (y.modelId >>> 0) ||
      (x.modelType >>> 0) !== (y.modelType >>> 0) ||
      (x.folderIndex >>> 0) !== (y.folderIndex >>> 0) ||
      (x.unk1 >>> 0) !== (y.unk1 >>> 0) ||
      (x.slotIndex >>> 0) !== (y.slotIndex >>> 0)
    ) {
      return false;
    }
  }
  return true;
}

export function isShlDraftDirty(
  base: ShlFileData | null,
  draft: ShlFileData | null,
): boolean {
  if (!base || !draft) return false;
  if ((base.version >>> 0) !== (draft.version >>> 0)) return true;
  if ((base.reserved08 >>> 0) !== (draft.reserved08 >>> 0)) return true;
  return !recordsEqual(base.records, draft.records);
}

export function replaceShlRecordAt(
  records: ShlRecord[],
  index: number,
  next: ShlRecord,
): ShlRecord[] {
  return [...records.slice(0, index), next, ...records.slice(index + 1)];
}

export function removeShlRecordAt(records: ShlRecord[], index: number): ShlRecord[] {
  return [...records.slice(0, index), ...records.slice(index + 1)];
}

export function appendShlRecord(records: ShlRecord[], next: ShlRecord): ShlRecord[] {
  return [...records, next];
}

/**
 * First-seen `folder_index -> model_id` map harvested from the file's own records, so changing a
 * slot's model can reuse the correct hash without reversing the proprietary name-hash algorithm.
 */
export function buildFolderModelIdMap(records: ShlRecord[]): Map<number, number> {
  const map = new Map<number, number>();
  for (const r of records) {
    const folder = r.folderIndex >>> 0;
    if (!map.has(folder)) map.set(folder, r.modelId >>> 0);
  }
  return map;
}

function isU32(n: number): boolean {
  return Number.isFinite(n) && n === Math.trunc(n) && n >= 0 && n <= 0xffffffff;
}

export function assertShlValidForSave(
  d: ShlFileData,
  options: { requireBody?: boolean } = {},
): void {
  if (!isU32(d.version)) {
    throw new Error("Invalid SHL version (expected unsigned 32-bit integer)");
  }
  if (!isU32(d.reserved08)) {
    throw new Error("Invalid SHL reserved field (expected unsigned 32-bit integer)");
  }
  if (d.records.length === 0) {
    throw new Error("SHL must declare at least one model slot");
  }
  for (let i = 0; i < d.records.length; i++) {
    const r = d.records[i];
    if (
      !isU32(r.modelId) ||
      !isU32(r.modelType) ||
      !isU32(r.folderIndex) ||
      !isU32(r.unk1) ||
      !isU32(r.slotIndex)
    ) {
      throw new Error(`Invalid SHL slot at row ${i + 1}: all fields must be u32`);
    }
  }
  // The game errors without a main body slot (type 0); block save to fail fast.
  if (options.requireBody !== false && !d.records.some((r) => (r.modelType >>> 0) === 0)) {
    throw new Error("SHL must contain at least one Body (type 0) slot, or the game will error");
  }
}
