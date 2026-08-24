import { invoke } from "@tauri-apps/api/core";
import { parseHashInput } from "../effect-folder-editor/effectFolderEditorUtils";

export const PILOT_VOICE_RESOURCE_PACK_HASH = "0x8C428AF2";
export const PILOT_VOICE_RESOURCE_PACK_NAME = "090sound";
export const PILOT_VOICE_RESOURCE_FILE_NAME = "pilotvoiceresourcetable.vrtbl";

export interface PilotVoiceResourceRecord {
  voiceKey: number;
  votPackage: number;
  dummyPackage: number;
  bankPackage: number;
  streamPathId: number;
  voiceStem?: string | null;
}

export interface PilotVoiceResourceTable {
  version: number;
  records: PilotVoiceResourceRecord[];
}

export interface PilotVoiceResourcePack {
  table: PilotVoiceResourceTable;
  filePath: string;
}

export function emptyPilotVoiceResourceRecord(): PilotVoiceResourceRecord {
  return {
    voiceKey: 0,
    votPackage: 0,
    dummyPackage: 0,
    bankPackage: 0,
    streamPathId: 0,
    voiceStem: "",
  };
}

export function emptyPilotVoiceFields(record: PilotVoiceResourceRecord): string[] {
  const fields: string[] = [];
  if (!record.voiceStem?.trim()) fields.push("voice");
  if (!record.voiceKey) fields.push("voiceKey");
  if (!record.streamPathId) fields.push("streamPathId");
  if (!record.votPackage) fields.push("votPackage");
  if (!record.dummyPackage) fields.push("dummyPackage");
  if (!record.bankPackage) fields.push("bankPackage");
  return fields;
}

export function parsePackageHashInput(raw: string): number | null {
  if (!raw.trim()) return 0;
  const parsed = parseHashInput(raw);
  if (parsed === null) return null;
  return parsed >>> 0;
}

export async function parsePilotVoiceResourcePack(
  folderPath: string,
): Promise<PilotVoiceResourcePack> {
  return invoke<PilotVoiceResourcePack>("parse_pilot_voice_resource_pack", { folderPath });
}

export async function finalizePilotVoiceResourceEntry(
  record: PilotVoiceResourceRecord,
): Promise<PilotVoiceResourceRecord> {
  return invoke<PilotVoiceResourceRecord>("finalize_pilot_voice_resource_entry", {
    entryJson: record,
  });
}

export async function buildPilotVoiceResourcePack(
  table: PilotVoiceResourceTable,
  filePath: string,
): Promise<PilotVoiceResourceTable> {
  return invoke<PilotVoiceResourceTable>("build_pilot_voice_resource_pack", {
    dataJson: table,
    filePath,
  });
}
