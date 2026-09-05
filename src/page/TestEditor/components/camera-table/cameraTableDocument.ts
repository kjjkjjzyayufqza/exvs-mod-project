import { invoke } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import type { CommandTableHeader } from "@/models/commandTable";

export const CAMERA_TABLE_PACK_HASH = "0xCB665375";
export const CAMERA_TABLE_PACK_NAME = "000common_000common_001";
export const CAMERA_TABLE_PARAMETERS_DIR = "camera/parameters";
export const CAMERA_TABLE_DEFAULT_FAMILY = "02winlose" as const;

export const CAMERA_TABLE_FAMILIES = [
  "00system",
  "01waza",
  "02winlose",
  "03cpubattle",
] as const;

export type CameraTableFamily = (typeof CAMERA_TABLE_FAMILIES)[number];

export const CAMERA_TABLE_BOOKMARKS = [
  { id: "rebellion-enter", clipHash: 0x8ca6cc45, label: "Rebellion ENTER" },
  { id: "rebellion-win", clipHash: 0xfd5fd16a, label: "Rebellion win tick" },
  { id: "rebellion-awaken", clipHash: 0x1351b046, label: "Rebellion awakening" },
  { id: "rebellion-lose", clipHash: 0x8028252f, label: "Rebellion lose" },
] as const;

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
  offset: number;
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
