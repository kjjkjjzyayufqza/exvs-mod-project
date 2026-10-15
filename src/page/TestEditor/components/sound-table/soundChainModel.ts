import { crc32IeeeUint32 } from "@/utils/crc32Ieee";

/** Vanilla pilot-voice rows share this dummy waveform pack. */
export const DUMMY_VOICE_PACKAGE = 0x147bc38e;

export const BGM_WORKSPACE_GROUP = 6;

export type SoundChainTab =
  | "raw-path-id"
  | "pilot-voice-resource"
  | "pilot-voice-bank"
  | "voice-order-table"
  | "bgm-table"
  | "bgm-list"
  | "bgm-bank";

export type SoundFocus = {
  tab: SoundChainTab;
  voiceStem?: string;
  voiceKey?: number;
  cueHash?: number;
  /** Absolute path of the `.vot` pack, when the chain already found it. */
  filePath?: string;
};

export type VoiceChainStepId = "slot" | "vot" | "path" | "audio" | "voiceBank";
export type BgmChainStepId = "bgm" | "hud" | "bank" | "audio";

export type VoicePackageField = "votPackage" | "dummyPackage" | "bankPackage";

export type VoiceSlotLink = {
  found: boolean;
  voiceStem: string;
  voiceKey: number;
  streamPathId: number;
  votPackage: number;
  dummyPackage: number;
  bankPackage: number;
  missingPackages: VoicePackageField[];
};

export type VoicePathLink = {
  found: boolean;
  key: string;
  source: string;
};

export type VoiceChainSnapshot = {
  fromSavedFile: true;
  stem: string;
  stemValid: boolean;
  slotTableMissing: boolean;
  pathTableMissing: boolean;
  slot: VoiceSlotLink;
  path: VoicePathLink;
  audioRelative: string;
  audioAbsolute: string;
  audioExists: boolean | null;
  /** `dplcache/0xXXXXXXXX.fhm2d` for this row's votPackage. Empty when the id is 0. */
  votPackPath: string;
  votPackExists: boolean | null;
  bankFilePath: string | null;
  bankPackage: number;
};

export type VotStepStatus =
  | { kind: "needPackage" }
  | { kind: "tableMissing" }
  | { kind: "unregistered" }
  | { kind: "fileMissing" }
  | { kind: "packFile"; fileName: string }
  | { kind: "hash"; hash: number };

export function votStepStatus(input: {
  previewPackage?: number;
  slotTableMissing?: boolean;
  slotFound?: boolean;
  votPackage?: number;
  votPackExists?: boolean | null;
  votPackPath?: string;
}): VotStepStatus {
  if (input.previewPackage !== undefined) {
    return input.previewPackage === 0
      ? { kind: "needPackage" }
      : { kind: "hash", hash: input.previewPackage >>> 0 };
  }
  if (input.slotTableMissing) return { kind: "tableMissing" };
  if (!input.slotFound) return { kind: "unregistered" };
  const votPackage = (input.votPackage ?? 0) >>> 0;
  if (votPackage === 0) return { kind: "needPackage" };
  if (input.votPackExists === false) return { kind: "fileMissing" };
  const fileName = (input.votPackPath ?? "").replace(/\\/g, "/").split("/").filter(Boolean).at(-1);
  if (input.votPackExists === true && fileName) return { kind: "packFile", fileName };
  return { kind: "hash", hash: votPackage };
}

export function voiceChainTabForStep(step: Exclude<VoiceChainStepId, "audio">): SoundChainTab {
  switch (step) {
    case "slot":
      return "pilot-voice-resource";
    case "vot":
      return "voice-order-table";
    case "path":
      return "raw-path-id";
    case "voiceBank":
      return "pilot-voice-bank";
  }
}

export type BgmRowLink = {
  found: boolean;
  cueName: string;
  entryId: number;
  bankGroup: number;
  cueLabelCrc: number;
};

export type BgmChainSnapshot = {
  fromSavedFile: true;
  cueHash: number;
  bgmTableMissing: boolean;
  hudTableMissing: boolean;
  bgm: BgmRowLink;
  hudCount: number;
  hudTitles: string[];
  groupInWorkspace: boolean;
  bankFilePath: string | null;
  audioRelative: string;
  audioAbsolute: string;
  audioExists: boolean | null;
};

const VOICE_PATH_KEY = /^STREAMPATH_ST_(VO_\d{4}_[PN]\d{2}_\d)$/i;

export function pilotVoiceStemFromPathKey(key: string): string | null {
  const match = VOICE_PATH_KEY.exec(key.trim());
  return match ? match[1].toUpperCase() : null;
}

export function voicePathKeyForStem(stem: string): string {
  return `STREAMPATH_ST_${stem.trim().toUpperCase()}`;
}

export function missingVoicePackages(record: {
  votPackage: number;
  dummyPackage: number;
  bankPackage: number;
}): VoicePackageField[] {
  const missing: VoicePackageField[] = [];
  if ((record.votPackage >>> 0) === 0) missing.push("votPackage");
  if ((record.dummyPackage >>> 0) === 0) missing.push("dummyPackage");
  if ((record.bankPackage >>> 0) === 0) missing.push("bankPackage");
  return missing;
}

let voiceStemByKey: Map<number, string> | null = null;

function buildVoiceStemMap(): Map<number, string> {
  const map = new Map<number, string>();
  const works: number[] = [];
  for (let work = 0; work < 200; work += 1) works.push(work);
  works.push(900, 1000);
  for (const work of works) {
    const workText = String(work).padStart(4, "0");
    for (const kind of ["P", "N"] as const) {
      for (let slot = 0; slot < 80; slot += 1) {
        const slotText = String(slot).padStart(2, "0");
        for (let variant = 0; variant < 10; variant += 1) {
          const stem = `VO_${workText}_${kind}${slotText}_${variant}`;
          map.set(crc32IeeeUint32(stem), stem);
        }
      }
    }
  }
  return map;
}

/** A stem, or a stem plus a game suffix such as `_01_ST_01`. */
const VOICE_FILE_NAME = /^(VO_\d{4}_[PN]\d{2}_\d)(?:_[A-Za-z0-9_]+)?$/i;

/** New-bank byte synthesis stays off until a proven TONE donor exists. */
export const NEW_BANK_SYNTHESIS_READY = false;

export type VoiceBankMode = "donor" | "new";

export type VoiceDraft = {
  stem: string;
  sourceAudioPath: string;
  /** File name without `.nus3audio`. Bank id is CRC32 of this plus `_bank`. */
  originName: string;
  voiceKey: number;
  streamPathId: number;
  source: string;
  bankPackage: number;
  votPackage: number;
  dummyPackage: number;
  bankMode: VoiceBankMode;
  saved: boolean;
  /** Donor row copied before Save. Zero until that copy. */
  donorVotPackage: number;
  donorBankPackage: number;
  donorStem: string;
};

export function voiceKeyForStem(stem: string): number {
  return crc32IeeeUint32(stem.trim().toUpperCase());
}

export function streamPathIdForStem(stem: string): number {
  return crc32IeeeUint32(voicePathKeyForStem(stem));
}

export function bankPackageForNewStem(stem: string): number {
  return bankPackageForOriginName(stem);
}

/** `CRC32("{originName}_bank")`. `originName` is the picked file name without the extension. */
export function bankPackageForOriginName(originName: string): number {
  return crc32IeeeUint32(`${originName.trim().toUpperCase()}_bank`);
}

/** Chosen pack id `CRC32("{STEM}_vot")`. Not a restored vanilla package id. */
export function votPackageForStem(stem: string): number {
  return crc32IeeeUint32(`${stem.trim().toUpperCase()}_vot`);
}

/** Loose file inside the new vot pack: `{lowercase stem}_01.vot`. */
export function voiceOrderFileName(stem: string): string {
  return `${stem.trim().toLowerCase()}_01.vot`;
}

export function formatPackageHash(value: number): string {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(8, "0")}`;
}

function joinPackPath(root: string, ...parts: string[]): string {
  const separator = root.includes("\\") ? "\\" : "/";
  const trimmed = root.trim().replace(/[\\/]+$/g, "");
  return [trimmed, ...parts.filter(Boolean)].join(separator);
}

export type PlannedVoicePack = {
  hashHex: string;
  packageId: number;
  folderPath: string;
  filePath: string;
  structurePath: string;
  innerName: string;
  prefix: string;
  routeId: "unit.sound" | "unit.waveform";
};

/** One extracted vot pack: `090sound/vot/0xHASH/0.vot` and the sibling structure json. */
export function planVoiceOrderWorkspace(workspaceRoot: string, packageId: number): PlannedVoicePack {
  const id = packageId >>> 0;
  const hashHex = formatPackageHash(id);
  const folderPath = joinPackPath(workspaceRoot, "090sound", "vot", hashHex);
  return {
    hashHex,
    packageId: id,
    folderPath,
    filePath: joinPackPath(folderPath, "0.vot"),
    structurePath: joinPackPath(workspaceRoot, "090sound", "vot", `${hashHex}_structure.json`),
    innerName: "0.vot",
    prefix: "090sound/vot",
    routeId: "unit.sound",
  };
}

/** New-voice pack uses the same folder as an extracted donor vot. */
export function planNewVoiceOrderPack(workspaceRoot: string, stem: string): PlannedVoicePack {
  return planVoiceOrderWorkspace(workspaceRoot, votPackageForStem(stem));
}

/** One new bank pack: `091waveform/voice/pilot/0xHASH/{name}.nus3bank` and the sibling structure json. */
export function planVoiceBankWorkspace(workspaceRoot: string, packageId: number): PlannedVoicePack {
  const id = packageId >>> 0;
  const hashHex = formatPackageHash(id);
  const folderPath = joinPackPath(workspaceRoot, "091waveform", "voice", "pilot", hashHex);
  return {
    hashHex,
    packageId: id,
    folderPath,
    filePath: folderPath,
    structurePath: joinPackPath(workspaceRoot, "091waveform", "voice", "pilot", `${hashHex}_structure.json`),
    innerName: "",
    prefix: "091waveform/voice/pilot",
    routeId: "unit.waveform",
  };
}

/**
 * New-voice bank folder is the plaintext stem.
 * `hashHex` stays `CRC32("{origin}_bank")` and is written as structure `HashName`.
 */
export function planNewVoiceBankPack(workspaceRoot: string, originName: string): PlannedVoicePack {
  const packageId = bankPackageForOriginName(originName);
  const hashHex = formatPackageHash(packageId);
  const stem = audioFileStem(`${originName.trim()}.nus3audio`) ?? originName.trim().toUpperCase();
  const innerName = `${originName.trim().toLowerCase()}.nus3bank`;
  const folderPath = joinPackPath(workspaceRoot, "091waveform", "voice", "pilot", stem);
  return {
    hashHex,
    packageId,
    folderPath,
    filePath: joinPackPath(folderPath, innerName),
    structurePath: joinPackPath(workspaceRoot, "091waveform", "voice", "pilot", `${stem}_structure.json`),
    innerName,
    prefix: "091waveform/voice/pilot",
    routeId: "unit.waveform",
  };
}

/** Uppercase file name without `.nus3audio`, when that name contains a voice stem. */
export function audioOriginName(fileName: string): string | null {
  const base = fileName.replace(/\\/g, "/").split("/").pop() ?? "";
  const match = /^(.*)\.nus3audio$/i.exec(base);
  if (!match || !VOICE_FILE_NAME.test(match[1])) return null;
  return match[1].toUpperCase();
}

export function pilotVoiceSourceForStem(stem: string): string {
  const upper = stem.trim().toUpperCase();
  const digits = upper.slice(3, 7);
  return `091waveform/voice/pilot/vo_${digits}/${upper}_01_ST_01.nus3audio`;
}

/** True when the file name contains a voice stem. A longer game name is allowed. */
export function audioFileNameOk(fileName: string): boolean {
  return audioFileStem(fileName) !== null;
}

/**
 * Voice stem inside a picked `.nus3audio`.
 * `VO_1001_P01_0.nus3audio` and `VO_1001_P01_0_01_ST_01.nus3audio` both yield `VO_1001_P01_0`.
 */
export function audioFileStem(fileName: string): string | null {
  const base = fileName.replace(/\\/g, "/").split("/").pop() ?? "";
  const match = /^(.*)\.nus3audio$/i.exec(base);
  if (!match) return null;
  const stem = VOICE_FILE_NAME.exec(match[1]);
  if (!stem) return null;
  return stem[1].toUpperCase();
}

export function createVoiceDraft(stem: string, sourceAudioPath: string): VoiceDraft {
  const normalized = stem.trim().toUpperCase();
  const originName = audioOriginName(sourceAudioPath) ?? normalized;
  return {
    stem: normalized,
    sourceAudioPath,
    originName,
    voiceKey: voiceKeyForStem(normalized),
    streamPathId: streamPathIdForStem(normalized),
    source: pilotVoiceSourceForStem(normalized),
    bankPackage: bankPackageForOriginName(originName),
    votPackage: votPackageForStem(normalized),
    dummyPackage: DUMMY_VOICE_PACKAGE,
    bankMode: "new",
    saved: false,
    donorVotPackage: 0,
    donorBankPackage: 0,
    donorStem: "",
  };
}

/** Packs a successful Slot save may mark dirty. Character list is never included. */
export function voiceSaveRepackHashes(wrotePath: boolean, extra: string[] = []): string[] {
  const hashes = ["0x8C428AF2"];
  if (wrotePath) hashes.push("0x264D1CA7");
  for (const hash of extra) {
    const normalized = hash.trim().toUpperCase();
    if (!normalized) continue;
    if (hashes.some((item) => item.toUpperCase() === normalized)) continue;
    hashes.push(normalized.startsWith("0X") ? `0x${normalized.slice(2)}` : normalized);
  }
  return hashes;
}

/** Reverse of CRC32(stem) for work 0..199 plus 900 and 1000. */
export function voiceStemForKey(voiceKey: number): string | null {
  const key = voiceKey >>> 0;
  if (key === 0) return null;
  if (!voiceStemByKey) voiceStemByKey = buildVoiceStemMap();
  return voiceStemByKey.get(key) ?? null;
}
