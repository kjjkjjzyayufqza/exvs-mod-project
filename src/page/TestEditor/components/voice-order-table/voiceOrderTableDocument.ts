import { invoke } from "@tauri-apps/api/core";
import { crc32IeeeUint32 } from "@/utils/crc32Ieee";

export interface VoiceOrderCue {
  cueId: number;
  flags: number;
}

export interface VoiceOrderSituation {
  situationId: number;
  volumePercent: number;
  param50: number;
  param100: number;
  gapBeforeVolume: number[];
  gapBeforeCues: number[];
  cues: VoiceOrderCue[];
}

export interface VoiceOrderTable {
  version: number;
  selfId: number;
  headerMarker: number;
  tailOffset: number;
  headerRest: number[];
  countRest: number[];
  situations: VoiceOrderSituation[];
  tail: number[];
  /** Bytes between the cue region and tailOffset. */
  tailGap: number;
}

export interface VoiceOrderDocument {
  table: VoiceOrderTable;
  sourcePath: string;
  savePath: string;
  insidePack: boolean;
  innerName: string;
}

export function cueIdFromCueName(name: string): number | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  return crc32IeeeUint32(trimmed.toUpperCase());
}

export function replaceCueId(cues: VoiceOrderCue[], index: number, cueId: number): VoiceOrderCue[] {
  return cues.map((row, rowIndex) => (rowIndex === index ? { ...row, cueId } : row));
}

export function appendCue(situation: VoiceOrderSituation): VoiceOrderSituation {
  return { ...situation, cues: [...situation.cues, { cueId: 0, flags: 0 }] };
}

export function removeCue(situation: VoiceOrderSituation, index: number): VoiceOrderSituation {
  return { ...situation, cues: situation.cues.filter((_, rowIndex) => rowIndex !== index) };
}

export async function parseVoiceOrderTable(filePath: string): Promise<VoiceOrderDocument> {
  return invoke<VoiceOrderDocument>("parse_voice_order_table", { filePath });
}

export async function buildVoiceOrderTable(table: VoiceOrderTable, savePath: string): Promise<VoiceOrderTable> {
  return invoke<VoiceOrderTable>("build_voice_order_table", { dataJson: table, savePath });
}

export async function writeRemappedVoiceOrderPack(input: {
  donorPath: string;
  donorStem: string;
  newStem: string;
  donorCueNames: string[];
  newCueNames: string[];
  votPath: string;
  structurePath: string;
}): Promise<number> {
  return invoke<number>("write_remapped_voice_order_pack", {
    donorPath: input.donorPath,
    donorStem: input.donorStem,
    newStem: input.newStem,
    donorCueNames: input.donorCueNames,
    newCueNames: input.newCueNames,
    votPath: input.votPath,
    structurePath: input.structurePath,
  });
}
