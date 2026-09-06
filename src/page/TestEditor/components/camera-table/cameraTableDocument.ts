import { invoke } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import type { CommandTableHeader } from "@/models/commandTable";
import { CAM_CMD } from "./cameraCommandHashes";

export const CAMERA_TABLE_PACK_HASH = "0xCB665375";
export const CAMERA_TABLE_PACK_NAME = "000common_000common_001";
export const CAMERA_TABLE_PARAMETERS_DIR = "camera/parameters";
export const CAMERA_TABLE_DEFAULT_FAMILY = "02winlose" as const;
export const CAMERA_TABLE_ENTRY_SIZE = 220;
export const CAMERA_TABLE_JSON_FILE_TYPE = "camera-table";

export const CAMERA_TABLE_FAMILIES = [
  "00system",
  "01waza",
  "02winlose",
  "03cpubattle",
] as const;

export type CameraTableFamily = (typeof CAMERA_TABLE_FAMILIES)[number];

export type CameraFieldSpec = {
  hash: number;
  entryOffset: number;
  flags: number;
  kind: number;
};

export type CameraTableEntry = {
  entryId: number;
  entryIndex: number;
  clipHash: number;
  sortKey: number;
  fov: number | null;
  offset: number | null;
  firstShot: number;
};

export type CameraTableData = {
  header: CommandTableHeader;
  fieldSpecs: CameraFieldSpec[];
  entryIds: number[];
  entriesRaw: number[][];
  trailingData: number[];
  entries: CameraTableEntry[];
  filePath?: string | null;
  family?: CameraTableFamily | string | null;
};

export function isCameraTableFamily(value: string): value is CameraTableFamily {
  return (CAMERA_TABLE_FAMILIES as readonly string[]).includes(value);
}

export function cameraTableFileName(family: CameraTableFamily): string {
  return `${family}.vgsht2`;
}

export async function cameraTableFilePath(
  folderPath: string,
  family: CameraTableFamily,
): Promise<string> {
  return join(folderPath, ...CAMERA_TABLE_PARAMETERS_DIR.split("/"), cameraTableFileName(family));
}

export async function parseCameraTablePack(
  folderPath: string,
  family: CameraTableFamily = CAMERA_TABLE_DEFAULT_FAMILY,
): Promise<CameraTableData> {
  return invoke<CameraTableData>("parse_camera_table_pack", { folderPath, family });
}

export async function parseCameraTableFile(path: string): Promise<CameraTableData> {
  return invoke<CameraTableData>("parse_camera_table_file", { path });
}

export async function buildCameraTableFile(
  table: CameraTableData,
  filePath: string,
): Promise<CameraTableData> {
  return invoke<CameraTableData>("build_camera_table_file", {
    dataJson: table,
    filePath,
  });
}

export function formatCameraHash(value: number): string {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(8, "0")}`;
}

export function cameraFieldHex(
  raw: number[] | undefined,
  offset: number,
): string {
  if (!raw || offset + 3 >= raw.length) return "";
  return [raw[offset], raw[offset + 1], raw[offset + 2], raw[offset + 3]]
    .map((byte) => (byte ?? 0).toString(16).padStart(2, "0"))
    .join("");
}

export function cameraFieldUint(raw: number[] | undefined, offset: number): number {
  if (!raw || offset + 3 >= raw.length) return 0;
  const b0 = raw[offset] ?? 0;
  const b1 = raw[offset + 1] ?? 0;
  const b2 = raw[offset + 2] ?? 0;
  const b3 = raw[offset + 3] ?? 0;
  return (b0 | (b1 << 8) | (b2 << 16) | (b3 << 24)) >>> 0;
}

export function cameraFieldFloat(raw: number[] | undefined, offset: number): number {
  const u = cameraFieldUint(raw, offset);
  const view = new DataView(new ArrayBuffer(4));
  view.setUint32(0, u, true);
  return view.getFloat32(0, true);
}

export function cameraSpecOffset(specs: CameraFieldSpec[] | undefined, hash: number): number | null {
  if (!specs) return null;
  const want = hash >>> 0;
  for (const spec of specs) {
    if ((spec.hash >>> 0) === want) return spec.entryOffset;
  }
  return null;
}

export function writeCameraFieldUint(raw: number[], offset: number, value: number): number[] {
  const next = raw.slice();
  const u = value >>> 0;
  next[offset] = u & 0xff;
  next[offset + 1] = (u >>> 8) & 0xff;
  next[offset + 2] = (u >>> 16) & 0xff;
  next[offset + 3] = (u >>> 24) & 0xff;
  return next;
}

export function writeCameraFieldFloat(raw: number[], offset: number, value: number): number[] {
  const view = new DataView(new ArrayBuffer(4));
  view.setFloat32(0, value, true);
  const next = raw.slice();
  next[offset] = view.getUint8(0);
  next[offset + 1] = view.getUint8(1);
  next[offset + 2] = view.getUint8(2);
  next[offset + 3] = view.getUint8(3);
  return next;
}

export function readCameraFloatHash(
  raw: number[] | undefined,
  specs: CameraFieldSpec[] | undefined,
  hash: number,
): number {
  const offset = cameraSpecOffset(specs, hash);
  if (offset == null) return Number.NaN;
  return cameraFieldFloat(raw, offset);
}

export function readCameraUintHash(
  raw: number[] | undefined,
  specs: CameraFieldSpec[] | undefined,
  hash: number,
): number {
  const offset = cameraSpecOffset(specs, hash);
  if (offset == null) return 0;
  return cameraFieldUint(raw, offset);
}

export function writeCameraFloatHash(
  raw: number[],
  specs: CameraFieldSpec[] | undefined,
  hash: number,
  value: number,
): number[] {
  const offset = cameraSpecOffset(specs, hash);
  if (offset == null) return raw;
  return writeCameraFieldFloat(raw, offset, value);
}

export function writeCameraUintHash(
  raw: number[],
  specs: CameraFieldSpec[] | undefined,
  hash: number,
  value: number,
): number[] {
  const offset = cameraSpecOffset(specs, hash);
  if (offset == null) return raw;
  return writeCameraFieldUint(raw, offset, value);
}

export function patchCameraEntry(
  table: CameraTableData,
  entryIndex: number,
  overlay: Partial<CameraTableEntry>,
  writeRaw?: (raw: number[]) => number[],
): CameraTableData {
  const entries = table.entries.map((entry) =>
    entry.entryIndex === entryIndex ? { ...entry, ...overlay } : entry,
  );
  const entriesRaw = table.entriesRaw.map((raw, index) => {
    if (index !== entryIndex) return raw;
    const copy = raw.slice();
    return writeRaw ? writeRaw(copy) : copy;
  });
  const entryIds = table.entryIds.map((id, index) => {
    const entry = table.entries[index];
    const isTarget = (entry?.entryIndex ?? index) === entryIndex;
    if (!isTarget) return id;
    return overlay.entryId !== undefined ? overlay.entryId >>> 0 : id;
  });
  return { ...table, entries, entriesRaw, entryIds };
}

export function cameraEntryFromRaw(
  raw: number[],
  specs: CameraFieldSpec[] | undefined,
  entryId: number,
  entryIndex: number,
): CameraTableEntry {
  const fov = readCameraFloatHash(raw, specs, CAM_CMD.fovV0);
  const offset = readCameraFloatHash(raw, specs, CAM_CMD.offset);
  return {
    entryId: entryId >>> 0,
    entryIndex,
    clipHash: readCameraUintHash(raw, specs, CAM_CMD.clipHash),
    sortKey: readCameraUintHash(raw, specs, CAM_CMD.sortKey),
    fov: Number.isFinite(fov) ? fov : null,
    offset: Number.isFinite(offset) ? offset : null,
    firstShot: readCameraUintHash(raw, specs, CAM_CMD.firstShot),
  };
}

export function nextCameraEntryId(table: CameraTableData): number {
  let max = 0;
  for (const id of table.entryIds) max = Math.max(max, id >>> 0);
  for (const entry of table.entries) max = Math.max(max, entry.entryId >>> 0);
  const next = (max + 1) >>> 0;
  return next === 0 ? 1 : next;
}

export function allocateCameraEntryIds(table: CameraTableData, count: number): number[] {
  const used = new Set<number>();
  for (const id of table.entryIds) used.add(id >>> 0);
  for (const entry of table.entries) used.add(entry.entryId >>> 0);
  const ids: number[] = [];
  let candidate = nextCameraEntryId(table);
  while (ids.length < count) {
    if (candidate !== 0 && !used.has(candidate)) {
      ids.push(candidate);
      used.add(candidate);
    }
    candidate = (candidate + 1) >>> 0;
  }
  return ids;
}

export function allocateCameraSortKeys(
  table: CameraTableData,
  count: number,
  startAfter?: number,
): number[] {
  const used = new Set<number>();
  let max = 0;
  for (const entry of table.entries) {
    const sort = entry.sortKey >>> 0;
    used.add(sort);
    if (sort > max) max = sort;
  }
  const keys: number[] = [];
  let candidate = ((startAfter ?? max) + 1) >>> 0;
  if (candidate === 0) candidate = 1;
  const begin = candidate;
  while (keys.length < count) {
    if (candidate !== 0 && !used.has(candidate)) {
      keys.push(candidate);
      used.add(candidate);
    }
    candidate = (candidate + 1) >>> 0;
    if (candidate === begin) {
      throw new Error("No unused camera sort key remains");
    }
  }
  return keys;
}

export function unusedCameraClipHash(table: CameraTableData, startFrom: number): number {
  const used = new Set(table.entries.map((entry) => entry.clipHash >>> 0));
  let candidate = (startFrom + 1) >>> 0;
  const begin = candidate;
  while (used.has(candidate) || candidate === 0) {
    candidate = (candidate + 1) >>> 0;
    if (candidate === begin) {
      throw new Error("No unused camera clip hash remains");
    }
  }
  return candidate;
}

function padCameraRaw(raw: number[]): number[] {
  const next = raw.slice(0, CAMERA_TABLE_ENTRY_SIZE);
  while (next.length < CAMERA_TABLE_ENTRY_SIZE) next.push(0);
  return next;
}

export function replaceCameraEntryRaw(
  table: CameraTableData,
  entryIndex: number,
  raw: number[],
): CameraTableData {
  const copy = padCameraRaw(raw);
  const entryId = table.entryIds[entryIndex] ?? table.entries[entryIndex]?.entryId ?? 0;
  const overlay = cameraEntryFromRaw(copy, table.fieldSpecs, entryId, entryIndex);
  return {
    ...table,
    entriesRaw: table.entriesRaw.map((row, index) => (index === entryIndex ? copy : row)),
    entries: table.entries.map((entry, index) => (index === entryIndex ? overlay : entry)),
  };
}

export function appendCameraEntries(
  table: CameraTableData,
  rows: Array<{ entryId: number; raw: number[] }>,
): CameraTableData {
  const entriesRaw = table.entriesRaw.map((row) => row.slice());
  const entryIds = table.entryIds.slice();
  const entries = table.entries.slice();
  for (const row of rows) {
    const raw = padCameraRaw(row.raw);
    const entryIndex = entries.length;
    entriesRaw.push(raw);
    entryIds.push(row.entryId >>> 0);
    entries.push(cameraEntryFromRaw(raw, table.fieldSpecs, row.entryId, entryIndex));
  }
  return {
    ...table,
    entriesRaw,
    entryIds,
    entries,
    header: { ...table.header, entryCount: entries.length },
  };
}

export type CameraTableEditResult =
  | { ok: true; table: CameraTableData }
  | { ok: false; error: string };

export function renameCameraEntryId(
  table: CameraTableData,
  entryIndex: number,
  nextId: number,
): CameraTableEditResult {
  const entryId = nextId >>> 0;
  if (entryId === 0) return { ok: false, error: "Row id must not be 0." };
  const taken = table.entries.some(
    (entry) => entry.entryIndex !== entryIndex && (entry.entryId >>> 0) === entryId,
  );
  if (taken) {
    return { ok: false, error: `Row id ${formatCameraHash(entryId)} is already used.` };
  }
  return { ok: true, table: patchCameraEntry(table, entryIndex, { entryId }) };
}

export function applyCameraClipHash(
  table: CameraTableData,
  entryIndexes: number[],
  clipHash: number,
): CameraTableData {
  const hash = clipHash >>> 0;
  let next = table;
  for (const entryIndex of entryIndexes) {
    next = patchCameraEntry(next, entryIndex, { clipHash: hash }, (raw) =>
      writeCameraUintHash(raw, next.fieldSpecs, CAM_CMD.clipHash, hash),
    );
  }
  return next;
}

export function sortCameraTableByEntryId(table: CameraTableData): CameraTableData {
  const count = table.entries.length;
  const order = Array.from({ length: count }, (_, index) => index);
  order.sort((left, right) => {
    const idLeft = (table.entries[left]?.entryId ?? table.entryIds[left] ?? 0) >>> 0;
    const idRight = (table.entries[right]?.entryId ?? table.entryIds[right] ?? 0) >>> 0;
    if (idLeft !== idRight) return idLeft < idRight ? -1 : 1;
    return left - right;
  });
  if (order.every((index, position) => index === position)) return table;

  const entriesRaw = order.map((index) => (table.entriesRaw[index] ?? []).slice());
  const entryIds = order.map(
    (index) => (table.entries[index]?.entryId ?? table.entryIds[index] ?? 0) >>> 0,
  );
  const entries = order.map((index, entryIndex) => ({
    ...(table.entries[index] as CameraTableEntry),
    entryId: entryIds[entryIndex] ?? 0,
    entryIndex,
  }));
  return {
    ...table,
    entriesRaw,
    entryIds,
    entries,
    header: { ...table.header, entryCount: entries.length },
  };
}

export function removeCameraEntries(
  table: CameraTableData,
  entryIndexes: number[],
): CameraTableData {
  const drop = new Set(entryIndexes.map((index) => index >>> 0));
  const entriesRaw: number[][] = [];
  const entryIds: number[] = [];
  const entries: CameraTableEntry[] = [];
  for (let index = 0; index < table.entries.length; index += 1) {
    const entry = table.entries[index];
    if (!entry) continue;
    const entryIndex = entry.entryIndex >>> 0;
    if (drop.has(entryIndex) || drop.has(index)) continue;
    const raw = table.entriesRaw[entryIndex] ?? table.entriesRaw[index];
    if (!raw) continue;
    const nextIndex = entries.length;
    entriesRaw.push(raw.slice());
    entryIds.push((table.entryIds[entryIndex] ?? table.entryIds[index] ?? entry.entryId) >>> 0);
    entries.push({ ...entry, entryIndex: nextIndex });
  }
  return {
    ...table,
    entriesRaw,
    entryIds,
    entries,
    header: { ...table.header, entryCount: entries.length },
  };
}
