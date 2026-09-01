import { invoke } from "@tauri-apps/api/core";

export const BGM_LIST_PACK_HASH = "0xC91627E8";
export const BGM_LIST_PACK_NAME = "bgm_list";
export const BGM_LIST_FILE_NAME = "bgm_list.bin";

export interface BgmListHeader {
  magic: number;
  unk04: number;
  fileSize: number;
  unk0c: number;
  entryCount: number;
  commandsCount: number;
  entrySize: number;
  unk1c: number;
}

export interface BgmListFieldSpec {
  hash: number;
  entryOffset: number;
  flags: number;
  kind: number;
}

export interface BgmListEntry {
  entryId: number;
  musicId: number;
  title: string;
  titleWithNotePrefix: string;
  sourceGroupHash: number;
  cueHash: number;
}

export interface BgmListData {
  header: BgmListHeader;
  fieldSpecs: BgmListFieldSpec[];
  entryIds: number[];
  entries: BgmListEntry[];
  trailingData: number[];
  filePath?: string;
}

export function emptyBgmListEntry(): BgmListEntry {
  return {
    entryId: 0,
    musicId: 0,
    title: "",
    titleWithNotePrefix: "",
    sourceGroupHash: 0,
    cueHash: 0,
  };
}

export function emptyBgmListFields(entry: BgmListEntry): string[] {
  const fields: string[] = [];
  if (!entry.musicId) fields.push("musicId");
  if (!entry.cueHash) fields.push("cueHash");
  if (!entry.title.trim()) fields.push("title");
  return fields;
}

export function bgmListEntryLabel(entry: BgmListEntry): string {
  const title = entry.title?.trim();
  if (title) return title;
  if (entry.musicId) return `musicId ${entry.musicId}`;
  if (entry.cueHash) return `0x${entry.cueHash.toString(16).toUpperCase().padStart(8, "0")}`;
  return "New HUD row";
}

function normalizeEntry(entry: BgmListEntry): BgmListEntry {
  return {
    ...emptyBgmListEntry(),
    ...entry,
    entryId: (entry.entryId >>> 0) || 0,
    musicId: (entry.musicId >>> 0) || 0,
    title: entry.title ?? "",
    titleWithNotePrefix: entry.titleWithNotePrefix ?? "",
    sourceGroupHash: (entry.sourceGroupHash >>> 0) || 0,
    cueHash: (entry.cueHash >>> 0) || 0,
  };
}

export async function parseBgmListPack(folderPath: string): Promise<BgmListData> {
  const parsed = await invoke<BgmListData>("parse_bgm_list_pack", { folderPath });
  return {
    ...parsed,
    entries: (parsed.entries ?? []).map(normalizeEntry),
  };
}

export async function finalizeBgmListEntry(
  entry: BgmListEntry,
  table: BgmListData,
): Promise<BgmListEntry> {
  const next = await invoke<BgmListEntry>("finalize_bgm_list_entry", {
    entryJson: entry,
    tableJson: table,
  });
  return normalizeEntry(next);
}

export async function buildBgmListPack(table: BgmListData, filePath: string): Promise<BgmListData> {
  return invoke<BgmListData>("build_bgm_list_pack", {
    dataJson: table,
    filePath,
  });
}
