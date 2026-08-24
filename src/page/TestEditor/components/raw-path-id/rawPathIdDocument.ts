import { invoke } from "@tauri-apps/api/core";

export const RAW_PATH_ID_PACK_HASH = "0x264D1CA7";
export const RAW_PATH_ID_PACK_NAME = "raw_path_id";
export const RAW_PATH_ID_JSON_FILE_NAME = "raw_path_id_release.json";
export const RAW_PATH_ID_VGSHT1_FILE_NAME = "raw_path_id_release.vgsht1";

export const RAW_PATH_ID_KINDS = ["stream", "movie", "net"] as const;
export type RawPathIdKind = (typeof RAW_PATH_ID_KINDS)[number];

export interface RawPathIdEntry {
  key: string;
  hash: number;
  kind: RawPathIdKind;
  source: string;
  path: string;
  param01Low: number;
  param01High: number;
  param02Low: number;
  param02High: number;
}

export interface RawPathIdDocument {
  entries: RawPathIdEntry[];
}

export interface RawPathIdParseIssue {
  code: string;
  message: string;
  key?: string;
}

export interface RawPathIdPack {
  document: RawPathIdDocument;
  issues: RawPathIdParseIssue[];
  jsonPath: string;
  vgsht1Path: string;
}

export async function parseRawPathIdPack(folderPath: string): Promise<RawPathIdPack> {
  return invoke<RawPathIdPack>("parse_raw_path_id_pack", { folderPath });
}

export async function finalizeRawPathIdEntry(
  input: Pick<RawPathIdEntry, "key" | "source"> & Partial<RawPathIdEntry>,
): Promise<RawPathIdEntry> {
  return invoke<RawPathIdEntry>("finalize_raw_path_id_entry", { entryJson: input });
}

export async function derivePilotVoiceSource(voiceStem: string): Promise<RawPathIdEntry> {
  return invoke<RawPathIdEntry>("derive_pilot_voice_source", { voiceStem });
}

export async function buildRawPathIdPack(
  document: RawPathIdDocument,
  jsonPath: string,
  vgsht1Path: string,
): Promise<RawPathIdDocument> {
  return invoke<RawPathIdDocument>("build_raw_path_id_pack", {
    dataJson: document,
    jsonPath,
    vgsht1Path,
  });
}
