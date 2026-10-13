import { invoke } from "@tauri-apps/api/core";

export interface PilotVoiceCue {
  name: string;
  nSamples: number;
  loopStart: number;
  loopEnd: number;
  loopFlag: number;
  hasClock: boolean;
  seconds: number;
}

export interface PilotVoiceBankDocument {
  cues: PilotVoiceCue[];
}

export interface SyncUpdate {
  name: string;
  oldNSamples: number;
  newNSamples: number;
  /** Set when the track was not 48000 Hz mono and its length was converted. */
  note?: string | null;
}

export interface SyncSkip {
  name: string;
  reason: string;
}

export interface SyncReport {
  updated: SyncUpdate[];
  unchanged: string[];
  bankOnly: string[];
  audioOnly: string[];
  skipped: SyncSkip[];
}

export interface SyncOutcome {
  document: PilotVoiceBankDocument;
  report: SyncReport;
}

export interface SampleEdit {
  name: string;
  nSamples: number;
}

export function secondsFromSamples(nSamples: number): string {
  return (nSamples / 48000).toFixed(1);
}

export function applySyncReport(cues: PilotVoiceCue[], report: SyncReport): PilotVoiceCue[] {
  const nextSamples = new Map(report.updated.map((row) => [row.name, row.newNSamples]));
  return cues.map((cue) => {
    const nSamples = nextSamples.get(cue.name);
    if (nSamples === undefined) return cue;
    return { ...cue, nSamples, seconds: nSamples / 48000 };
  });
}

export function dirtyCueNames(current: PilotVoiceCue[], loaded: PilotVoiceCue[]): string[] {
  const loadedSamples = new Map(loaded.map((cue) => [cue.name, cue.nSamples]));
  return current
    .filter((cue) => loadedSamples.get(cue.name) !== cue.nSamples)
    .map((cue) => cue.name);
}

export async function parsePilotVoiceBank(filePath: string): Promise<PilotVoiceBankDocument> {
  return invoke<PilotVoiceBankDocument>("parse_pilot_voice_bank", { filePath });
}

export async function applyPilotVoiceBankSamples(
  filePath: string,
  edits: SampleEdit[],
): Promise<PilotVoiceBankDocument> {
  return invoke<PilotVoiceBankDocument>("apply_pilot_voice_bank_samples", { filePath, edits });
}

export async function syncPilotVoiceBankFromAudio(
  bankPath: string,
  audioPath: string,
): Promise<SyncOutcome> {
  return invoke<SyncOutcome>("sync_pilot_voice_bank_from_audio", { bankPath, audioPath });
}
