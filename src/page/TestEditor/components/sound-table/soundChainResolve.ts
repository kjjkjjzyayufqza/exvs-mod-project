import { exists } from "@tauri-apps/plugin-fs";
import { dirname, join } from "@tauri-apps/api/path";
import { openPath } from "@tauri-apps/plugin-opener";
import {
  resolveWorkspaceContent,
  type WorkspaceContentId,
} from "@/services/testEditorWorkspace/contentCatalog";
import type { TestEditorWorkspaceDocument } from "@/services/testEditorWorkspace/types";
import { parseRawPathIdPack, derivePilotVoiceSource } from "../raw-path-id/rawPathIdDocument";
import {
  parsePilotVoiceResourcePack,
  type PilotVoiceResourceRecord,
} from "../pilot-voice-resource/pilotVoiceResourceDocument";
import {
  bgmTableGroupAssets,
  bgmUpdate02AudioPath,
  findNus3bankFile,
  parseBgmTablePack,
  type BgmTableEntry,
} from "../bgm-table/bgmTableDocument";
import { parseBgmListPack, type BgmListEntry } from "../bgm-list/bgmListDocument";
import { planPilotVoiceBankInit } from "../pilot-voice-bank/initPilotVoiceBank";
import {
  BGM_WORKSPACE_GROUP,
  missingVoicePackages,
  planVoiceBankWorkspace,
  planVoiceOrderWorkspace,
  voicePathKeyForStem,
  type BgmChainSnapshot,
  type VoiceChainSnapshot,
} from "./soundChainModel";

type SavedSoundTables = {
  workspaceRoot: string;
  slots: PilotVoiceResourceRecord[] | null;
  paths: { key: string; source: string; hash: number }[] | null;
  bgm: BgmTableEntry[] | null;
  hud: BgmListEntry[] | null;
  bankFilePath: string | null;
};

let generation = 0;
let cached: SavedSoundTables | null = null;
let inflight: Promise<SavedSoundTables> | null = null;
let inflightRoot = "";

export function invalidateSoundChainCache(): void {
  generation += 1;
  cached = null;
  inflight = null;
  inflightRoot = "";
}

async function readPackFolder(
  workspaceRoot: string,
  document: TestEditorWorkspaceDocument,
  id: WorkspaceContentId,
): Promise<string | null> {
  const content = await resolveWorkspaceContent(workspaceRoot, document, id);
  if (content.sourceLayout === "missing" || !content.existing) return null;
  return content.existing.folderPath;
}

async function loadTables(
  workspaceRoot: string,
  document: TestEditorWorkspaceDocument,
): Promise<SavedSoundTables> {
  const gen = generation;
  const [slotFolder, pathFolder, bgmFolder, hudFolder, bankFolder] = await Promise.all([
    readPackFolder(workspaceRoot, document, "pilot-voice-resource").catch(() => null),
    readPackFolder(workspaceRoot, document, "raw-path-id").catch(() => null),
    readPackFolder(workspaceRoot, document, "bgm-table").catch(() => null),
    readPackFolder(workspaceRoot, document, "bgm-list").catch(() => null),
    readPackFolder(workspaceRoot, document, "bgm-bank-update-02").catch(() => null),
  ]);
  const [slots, paths, bgm, hud, bankFilePath] = await Promise.all([
    slotFolder
      ? parsePilotVoiceResourcePack(slotFolder)
          .then((pack) => pack.table.records)
          .catch(() => null)
      : Promise.resolve(null),
    pathFolder
      ? parseRawPathIdPack(pathFolder)
          .then((pack) => pack.document.entries.map((entry) => ({ key: entry.key, source: entry.source, hash: entry.hash })))
          .catch(() => null)
      : Promise.resolve(null),
    bgmFolder
      ? parseBgmTablePack(bgmFolder)
          .then((table) => table.entries)
          .catch(() => null)
      : Promise.resolve(null),
    hudFolder
      ? parseBgmListPack(hudFolder)
          .then((table) => table.entries)
          .catch(() => null)
      : Promise.resolve(null),
    bankFolder ? findNus3bankFile(bankFolder).catch(() => null) : Promise.resolve(null),
  ]);
  const next: SavedSoundTables = {
    workspaceRoot,
    slots,
    paths,
    bgm,
    hud,
    bankFilePath,
  };
  if (gen === generation) {
    cached = next;
  }
  return next;
}

async function savedTables(
  workspaceRoot: string,
  document: TestEditorWorkspaceDocument,
): Promise<SavedSoundTables> {
  if (cached && cached.workspaceRoot === workspaceRoot) return cached;
  if (inflight && inflightRoot === workspaceRoot) return inflight;
  inflightRoot = workspaceRoot;
  inflight = loadTables(workspaceRoot, document).finally(() => {
    inflight = null;
    inflightRoot = "";
  });
  return inflight;
}

async function fileExists(path: string): Promise<boolean | null> {
  if (!path) return null;
  try {
    return await exists(path);
  } catch {
    return null;
  }
}

export async function pilotAudioAbsolutePath(dplCacheDir: string, relative: string): Promise<string> {
  return absoluteAudio(dplCacheDir, relative);
}

async function absoluteAudio(dplCacheDir: string, relative: string): Promise<string> {
  const base = dplCacheDir.trim();
  if (!base || !relative) return "";
  try {
    const parent = await dirname(base);
    return join(parent, ...relative.replace(/\\/g, "/").split("/"));
  } catch {
    return "";
  }
}

function emptySlot(stem: string): VoiceChainSnapshot["slot"] {
  return {
    found: false,
    voiceStem: stem,
    voiceKey: 0,
    streamPathId: 0,
    votPackage: 0,
    dummyPackage: 0,
    bankPackage: 0,
    missingPackages: ["votPackage", "dummyPackage", "bankPackage"],
  };
}

export async function resolveVoiceChain(input: {
  workspaceRoot: string;
  workspaceDocument: TestEditorWorkspaceDocument;
  dplCacheDir: string;
  stem: string;
}): Promise<VoiceChainSnapshot> {
  const stem = input.stem.trim();
  const tables = await savedTables(input.workspaceRoot, input.workspaceDocument);
  let derived: { key: string; source: string } | null = null;
  if (stem) {
    try {
      const entry = await derivePilotVoiceSource(stem);
      derived = { key: entry.key, source: entry.source };
    } catch {
      derived = null;
    }
  }
  const slotRecord = tables.slots?.find((record) => (record.voiceStem ?? "").toUpperCase() === stem.toUpperCase()) ?? null;
  const pathKey = derived?.key ?? (stem ? voicePathKeyForStem(stem) : "");
  const pathRecord =
    tables.paths?.find((entry) => entry.key.toUpperCase() === pathKey.toUpperCase()) ?? null;
  const audioRelative = pathRecord?.source || derived?.source || "";
  const audioAbsolute = await absoluteAudio(input.dplCacheDir, audioRelative);
  const audioExists = await fileExists(audioAbsolute);
  const votPackage = slotRecord ? slotRecord.votPackage >>> 0 : 0;
  let votPackPath = "";
  let votPackExists: boolean | null = null;
  const dplCacheDir = input.dplCacheDir.trim();
  if (votPackage !== 0) {
    const workspaceVot = planVoiceOrderWorkspace(input.workspaceRoot, votPackage);
    try {
      const looseExists = await fileExists(workspaceVot.filePath);
      if (looseExists) {
        votPackPath = workspaceVot.filePath;
        votPackExists = true;
      } else if (dplCacheDir) {
        votPackPath = await join(dplCacheDir, `${workspaceVot.hashHex}.fhm2d`);
        votPackExists = await fileExists(votPackPath);
      } else {
        votPackPath = workspaceVot.filePath;
        votPackExists = false;
      }
    } catch {
      votPackPath = "";
      votPackExists = null;
    }
  }
  const bankPackage = slotRecord ? slotRecord.bankPackage >>> 0 : 0;
  let bankFilePath: string | null = null;
  if (stem && bankPackage !== 0) {
    try {
      const packed = planVoiceBankWorkspace(input.workspaceRoot, bankPackage);
      bankFilePath = await findNus3bankFile(packed.folderPath);
      if (!bankFilePath) {
        const plan = planPilotVoiceBankInit({
          dplCacheDir: input.dplCacheDir || "dplcache",
          workspaceRoot: input.workspaceRoot,
          stem,
          bankPackage,
        });
        bankFilePath = await findNus3bankFile(plan.workspaceFolder);
      }
    } catch {
      bankFilePath = null;
    }
  }
  const slot = slotRecord
    ? {
        found: true,
        voiceStem: slotRecord.voiceStem ?? stem,
        voiceKey: slotRecord.voiceKey >>> 0,
        streamPathId: slotRecord.streamPathId >>> 0,
        votPackage: slotRecord.votPackage >>> 0,
        dummyPackage: slotRecord.dummyPackage >>> 0,
        bankPackage,
        missingPackages: missingVoicePackages(slotRecord),
      }
    : emptySlot(stem);
  return {
    fromSavedFile: true,
    stem,
    stemValid: derived !== null,
    slotTableMissing: tables.slots === null,
    pathTableMissing: tables.paths === null,
    slot,
    path: {
      found: pathRecord !== null,
      key: pathRecord?.key ?? pathKey,
      source: pathRecord?.source ?? audioRelative,
    },
    audioRelative,
    audioAbsolute,
    audioExists,
    votPackPath,
    votPackExists,
    bankFilePath,
    bankPackage,
  };
}

export async function resolveBgmChain(input: {
  workspaceRoot: string;
  workspaceDocument: TestEditorWorkspaceDocument;
  dplCacheDir: string;
  cueHash: number;
}): Promise<BgmChainSnapshot> {
  const cueHash = input.cueHash >>> 0;
  const tables = await savedTables(input.workspaceRoot, input.workspaceDocument);
  const row = tables.bgm?.find((entry) => (entry.entryId >>> 0) === cueHash) ?? null;
  const bankGroup = row ? row.bankGroup : BGM_WORKSPACE_GROUP;
  const hudRows = (tables.hud ?? []).filter((entry) => (entry.cueHash >>> 0) === cueHash && cueHash !== 0);
  const groupInWorkspace = bankGroup === BGM_WORKSPACE_GROUP;
  let audioRelative = "";
  let audioAbsolute = "";
  if (groupInWorkspace) {
    try {
      const assets = await bgmTableGroupAssets(bankGroup);
      audioRelative = assets.audioRelative;
    } catch {
      audioRelative = "";
    }
    audioAbsolute = await bgmUpdate02AudioPath(input.dplCacheDir);
  }
  const audioExists = groupInWorkspace ? await fileExists(audioAbsolute) : null;
  return {
    fromSavedFile: true,
    cueHash,
    bgmTableMissing: tables.bgm === null,
    hudTableMissing: tables.hud === null,
    bgm: {
      found: row !== null,
      cueName: row?.cueName?.trim() || "",
      entryId: row ? row.entryId >>> 0 : cueHash,
      bankGroup,
      cueLabelCrc: row ? row.cueLabelCrc >>> 0 : 0,
    },
    hudCount: hudRows.length,
    hudTitles: hudRows.map((entry) => entry.title).filter((title) => title.trim().length > 0),
    groupInWorkspace,
    bankFilePath: groupInWorkspace ? tables.bankFilePath : null,
    audioRelative,
    audioAbsolute,
    audioExists,
  };
}

export function hudCountByCueHash(entries: BgmListEntry[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const entry of entries) {
    const cue = entry.cueHash >>> 0;
    if (cue === 0) continue;
    counts.set(cue, (counts.get(cue) ?? 0) + 1);
  }
  return counts;
}

export async function openSoundChainPath(path: string): Promise<"missing" | "opened"> {
  if (!path) return "missing";
  let found = false;
  try {
    found = await exists(path);
  } catch {
    found = false;
  }
  if (!found) return "missing";
  const lower = path.replace(/\\/g, "/").toLowerCase();
  const isFile = /\.(nus3audio|nus3bank|json|vgsht1|vgsht2|vrtbl|bin)$/.test(lower);
  await openPath(isFile ? await dirname(path) : path);
  return "opened";
}
