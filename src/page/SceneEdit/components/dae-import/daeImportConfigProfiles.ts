import { load } from "@tauri-apps/plugin-store";
import {
  cloneNumatbFile,
  type DaeSsbhSessionState,
  type MatlDataJson,
  type NumdlbMappingRow,
} from "@/components/ssbh-model-preview/daeSsbhTypes";
import type { DaeSsbhSessionStoreState } from "@/components/ssbh-model-preview/store/daeSsbhSessionStore";
import { ensureMissingMappingLabelsInProfiles } from "@/components/ssbh-model-preview/store/numatbTemplateStoreHelpers";
import type { DaeImportConfig } from "./daeImportTypes";

const CONFIG_STORE_NAME = "settings.json";
const IMPORT_CONFIG_PROFILE_LIBRARY_KEY = "unitModelImportConfigProfileLibrary";
const IMPORT_CONFIG_PROFILE_LIBRARY_VERSION = 1;

export interface DaeImportSessionConfigSnapshot {
  includeGeometryNames: string[];
  outputDir: string | null;
  outputBaseName: string;
  scaleFactorText: string;
  upAxis: DaeSsbhSessionState["upAxis"];
  flipUv: boolean;
  writeLog: boolean;
  writeNumdlb: boolean;
  writeNumshb: boolean;
  writeNusktb: boolean;
  writeNumatb: boolean;
  writeMayaProfile: boolean;
  mirrorTexturePathsAcrossProfiles: boolean;
  numdlbEntries: NumdlbMappingRow[];
  selectedTemplateId: string | null;
  mayaFile: MatlDataJson;
  nustFile: MatlDataJson;
}

export interface DaeImportConfigProfileSnapshot {
  config: DaeImportConfig;
  session: DaeImportSessionConfigSnapshot;
}

export interface DaeImportConfigProfile {
  id: string;
  name: string;
  updatedAt: string;
  snapshot: DaeImportConfigProfileSnapshot;
}

export interface DaeImportConfigProfileLibrary {
  version: number;
  profiles: DaeImportConfigProfile[];
}

function createEmptyLibrary(): DaeImportConfigProfileLibrary {
  return {
    version: IMPORT_CONFIG_PROFILE_LIBRARY_VERSION,
    profiles: [],
  };
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizeLibrary(input: unknown): DaeImportConfigProfileLibrary {
  if (!input || typeof input !== "object") return createEmptyLibrary();
  const rawProfiles = (input as { profiles?: unknown }).profiles;
  if (!Array.isArray(rawProfiles)) return createEmptyLibrary();

  const profiles = rawProfiles
    .map((item, index): DaeImportConfigProfile | null => {
      if (!item || typeof item !== "object") return null;
      const candidate = item as Partial<DaeImportConfigProfile>;
      const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
      const snapshot = candidate.snapshot;
      if (
        !name ||
        !snapshot ||
        typeof snapshot !== "object" ||
        !snapshot.config ||
        !snapshot.session
      ) {
        return null;
      }
      return {
        id:
          typeof candidate.id === "string" && candidate.id.trim()
            ? candidate.id
            : `import-config-profile-${index}`,
        name,
        updatedAt:
          typeof candidate.updatedAt === "string"
            ? candidate.updatedAt
            : new Date(0).toISOString(),
        snapshot: cloneJson(snapshot),
      };
    })
    .filter((profile): profile is DaeImportConfigProfile => profile !== null)
    .sort((left, right) => left.name.localeCompare(right.name));

  return {
    version: IMPORT_CONFIG_PROFILE_LIBRARY_VERSION,
    profiles,
  };
}

async function saveLibrary(
  library: DaeImportConfigProfileLibrary,
): Promise<DaeImportConfigProfileLibrary> {
  const normalized = normalizeLibrary(library);
  const store = await load(CONFIG_STORE_NAME);
  await store.set(IMPORT_CONFIG_PROFILE_LIBRARY_KEY, normalized);
  await store.save();
  return normalized;
}

export async function loadDaeImportConfigProfileLibrary(): Promise<DaeImportConfigProfileLibrary> {
  const store = await load(CONFIG_STORE_NAME);
  return normalizeLibrary(await store.get(IMPORT_CONFIG_PROFILE_LIBRARY_KEY));
}

export async function upsertDaeImportConfigProfile(
  profile: DaeImportConfigProfile,
): Promise<DaeImportConfigProfileLibrary> {
  const library = await loadDaeImportConfigProfileLibrary();
  return await saveLibrary({
    version: IMPORT_CONFIG_PROFILE_LIBRARY_VERSION,
    profiles: [
      ...library.profiles.filter((candidate) => candidate.id !== profile.id),
      profile,
    ],
  });
}

export async function deleteDaeImportConfigProfile(
  profileId: string,
): Promise<DaeImportConfigProfileLibrary> {
  const library = await loadDaeImportConfigProfileLibrary();
  return await saveLibrary({
    version: IMPORT_CONFIG_PROFILE_LIBRARY_VERSION,
    profiles: library.profiles.filter((profile) => profile.id !== profileId),
  });
}

export function captureDaeImportConfigProfileSnapshot(
  config: DaeImportConfig,
  session: DaeSsbhSessionStoreState,
): DaeImportConfigProfileSnapshot {
  return cloneJson({
    config,
    session: {
      includeGeometryNames: session.includeGeometryNames,
      outputDir: session.outputDir,
      outputBaseName: session.outputBaseName,
      scaleFactorText: session.scaleFactorText,
      upAxis: session.upAxis,
      flipUv: session.flipUv,
      writeLog: session.writeLog,
      writeNumdlb: session.writeNumdlb,
      writeNumshb: session.writeNumshb,
      writeNusktb: session.writeNusktb,
      writeNumatb: session.writeNumatb,
      writeMayaProfile: session.writeMayaProfile,
      mirrorTexturePathsAcrossProfiles: session.mirrorTexturePathsAcrossProfiles,
      numdlbEntries: session.numdlbEntries,
      selectedTemplateId: session.selectedTemplateId,
      mayaFile: session.mayaFile,
      nustFile: session.nustFile,
    },
  });
}

function reconcileGeometrySelection(
  current: DaeSsbhSessionStoreState,
  saved: DaeImportSessionConfigSnapshot,
): string[] {
  const activeNames = current.analysis?.geometryNames ?? current.numdlbEntries.map((row) => row.meshObjectName);
  const activeSet = new Set(activeNames);
  const matchingSavedNames = saved.includeGeometryNames.filter((name) => activeSet.has(name));
  return matchingSavedNames.length > 0 ? matchingSavedNames : [...current.includeGeometryNames];
}

function reconcileMaterialMappings(
  currentRows: NumdlbMappingRow[],
  savedRows: NumdlbMappingRow[],
): NumdlbMappingRow[] {
  const savedByGeometry = new Map(
    savedRows.map((row) => [`${row.meshObjectName}\u0000${row.meshObjectSubindex}`, row]),
  );
  return currentRows.map((row, index) => {
    const saved =
      savedByGeometry.get(`${row.meshObjectName}\u0000${row.meshObjectSubindex}`) ?? savedRows[index];
    return saved?.materialLabel.trim()
      ? { ...row, materialLabel: saved.materialLabel }
      : row;
  });
}

export function applyDaeImportConfigProfileSnapshot(
  currentConfig: DaeImportConfig,
  currentSession: DaeSsbhSessionStoreState,
  snapshot: DaeImportConfigProfileSnapshot,
  unitModelMode: boolean,
): {
  config: DaeImportConfig;
  sessionPatch: Partial<DaeSsbhSessionState>;
} {
  const savedConfig = cloneJson(snapshot.config);
  const savedSession = cloneJson(snapshot.session);
  const numdlbEntries = reconcileMaterialMappings(
    currentSession.numdlbEntries,
    savedSession.numdlbEntries,
  );
  const ensuredProfiles = ensureMissingMappingLabelsInProfiles(
    cloneNumatbFile(savedSession.mayaFile),
    cloneNumatbFile(savedSession.nustFile),
    numdlbEntries,
  );
  const config: DaeImportConfig = {
    ...savedConfig,
    outputDirectory: currentConfig.outputDirectory,
    textureEntries: currentConfig.textureEntries,
    ssbhConfig: {
      ...savedConfig.ssbhConfig,
      baseFilename: currentConfig.ssbhConfig.baseFilename,
    },
  };

  if (unitModelMode) {
    config.loadToScene = false;
    config.convertToSsbh = true;
    config.generateHkt = false;
    config.directToDisk = true;
    config.ssbhConfig.writeNumdlb = true;
    config.ssbhConfig.writeNumshb = true;
    config.ssbhConfig.writeNusktb = true;
    config.ssbhConfig.writeNumatb = true;
    config.ssbhConfig.writeJnttbl = true;
    config.ssbhConfig.writeMayaProfile = true;
  }

  return {
    config,
    sessionPatch: {
      includeGeometryNames: reconcileGeometrySelection(currentSession, savedSession),
      scaleFactorText: savedSession.scaleFactorText,
      upAxis: savedSession.upAxis,
      flipUv: savedSession.flipUv,
      writeLog: savedSession.writeLog,
      writeNumdlb: unitModelMode ? true : savedSession.writeNumdlb,
      writeNumshb: unitModelMode ? true : savedSession.writeNumshb,
      writeNusktb: unitModelMode ? true : savedSession.writeNusktb,
      writeNumatb: unitModelMode ? true : savedSession.writeNumatb,
      writeMayaProfile: unitModelMode ? true : savedSession.writeMayaProfile,
      mirrorTexturePathsAcrossProfiles: savedSession.mirrorTexturePathsAcrossProfiles,
      numdlbEntries,
      selectedTemplateId: null,
      mayaFile: ensuredProfiles.mayaFile,
      nustFile: ensuredProfiles.nustFile,
      numatbProfileReplacementRevision:
        (currentSession.numatbProfileReplacementRevision ?? 0) + 1,
      lastResult: null,
    },
  };
}
