import { invoke } from "@tauri-apps/api/core";
import { dirname, join } from "@tauri-apps/api/path";
import { readDir } from "@tauri-apps/plugin-fs";

export const BGM_TABLE_PACK_HASH = "0x5E92AAEC";
export const BGM_TABLE_PACK_NAME = "bgm_table";
export const BGM_TABLE_FILE_NAME = "bgm_table.vgsht2";
export const BGM_BANK_UPDATE_02_PACK_HASH = "0x0C568109";
export const BGM_BANK_UPDATE_02_PACK_NAME = "bgm_ac27_update_02";
export const BGM_BANK_UPDATE_02_AUDIO_RELATIVE = "091waveform/BGM/BGM_AC27_UPDATE_02.nus3audio";

export interface BgmTableEntry {
  entryId: number;
  bankGroup: number;
  bankGroupCopy: number;
  cueLabelCrc: number;
  cueLabelCrcCopy: number;
  routeSelector: number;
  cueName?: string | null;
}

export interface BgmTableHeader {
  magic: number;
  unk04: number;
  fileSize: number;
  unk0c: number;
  entryCount: number;
  commandsCount: number;
  entrySize: number;
  unk1c: number;
}

export interface BgmTableFieldSpec {
  hash: number;
  entryOffset: number;
  flags: number;
  kind: number;
}

export interface BgmTableData {
  header: BgmTableHeader;
  fieldSpecs: BgmTableFieldSpec[];
  entryIds: number[];
  entries: BgmTableEntry[];
  trailingData: number[];
  filePath?: string;
}

export interface BgmGroupAssets {
  bankPackHash: string;
  audioRelative: string;
}

export function emptyBgmTableEntry(): BgmTableEntry {
  return {
    entryId: 0,
    bankGroup: 6,
    bankGroupCopy: 6,
    cueLabelCrc: 0,
    cueLabelCrcCopy: 0,
    routeSelector: 0,
    cueName: "",
  };
}

export function emptyBgmTableFields(entry: BgmTableEntry): string[] {
  const fields: string[] = [];
  if (!entry.cueName?.trim()) fields.push("cueName");
  if (!entry.entryId) fields.push("cueHash");
  if (!entry.cueLabelCrc) fields.push("cueLabelCrc");
  return fields;
}

export function bgmEntryLabel(entry: BgmTableEntry): string {
  const name = entry.cueName?.trim();
  if (name) return name;
  if (entry.entryId) return `0x${entry.entryId.toString(16).toUpperCase().padStart(8, "0")}`;
  return "New BGM";
}

export async function parseBgmTablePack(folderPath: string): Promise<BgmTableData> {
  return invoke<BgmTableData>("parse_bgm_table_pack", { folderPath });
}

export async function finalizeBgmTableEntry(
  entry: BgmTableEntry,
  table: BgmTableData,
): Promise<BgmTableEntry> {
  return invoke<BgmTableEntry>("finalize_bgm_table_entry", {
    entryJson: entry,
    tableJson: table,
  });
}

export async function buildBgmTablePack(table: BgmTableData, filePath: string): Promise<BgmTableData> {
  return invoke<BgmTableData>("build_bgm_table_pack", {
    dataJson: table,
    filePath,
  });
}

export async function bgmTableGroupAssets(bankGroup: number): Promise<BgmGroupAssets> {
  return invoke<BgmGroupAssets>("bgm_table_group_assets", { bankGroup });
}

export async function findNus3bankFile(folderPath: string): Promise<string | null> {
  const entries = await readDir(folderPath);
  const hits = entries.filter((entry) => (entry.name ?? "").toLowerCase().endsWith(".nus3bank"));
  if (hits.length !== 1 || !hits[0].name) return null;
  return await join(folderPath, hits[0].name);
}

export async function bgmUpdate02AudioPath(dplCacheDir: string): Promise<string> {
  const base = dplCacheDir.trim();
  if (!base) return "";
  const x64Root = await dirname(base);
  return join(x64Root, "091waveform", "BGM", "BGM_AC27_UPDATE_02.nus3audio");
}
