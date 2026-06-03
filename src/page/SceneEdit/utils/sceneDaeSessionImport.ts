import type { DaeSsbhSessionState } from "@/components/ssbh-model-preview/daeSsbhTypes";
import type { MatlDataJson } from "@/components/ssbh-model-preview/types";
import type { ImportedDaeObject } from "../components/MapViewport";
import type { DaeImportConfig } from "../components/dae-import/daeImportTypes";
import { DEFAULT_HKT_SIMPLIFY } from "./hktSimplifyUtils";
import { executeDelete } from "./sceneDeleteConfirm";
import { buildLegacySlotSubfolderDeletePath } from "./sceneModelReplace";
import {
  sceneConfigureImport,
  sceneConvertStaticMeshToStageFiles,
  sceneConvertStaticMeshToStageFilesWithProgress,
  sceneExecuteImport,
  sceneExecuteImportWithProgress,
  sceneGetImportConfig,
  sceneImportDaeFromPath,
  sceneImportDaeFromPathWithProgress,
  type ImportConfig,
  type ImportResult,
  type StaticMeshDirectConvertResult,
  type StaticMeshImportProgress,
} from "./sceneSessionService";

/**
 * Strip `.nutexb` suffix from all texture data paths in a MatlDataJson.
 * EXVS game runtime expects texture references WITHOUT file extension.
 */
function stripNutexbFromMatl(matl: MatlDataJson | null | undefined): MatlDataJson | null {
  if (!matl) return null;
  return {
    ...matl,
    entries: matl.entries.map((entry) => ({
      ...entry,
      textures: entry.textures.map((tex) => ({
        ...tex,
        data: tex.data.replace(/\.nutexb$/i, ""),
      })),
      ...(entry.textures2 ? {
        textures2: entry.textures2.map((tex) => ({
          ...tex,
          data: tex.data.replace(/\.nutexb$/i, ""),
        })),
      } : {}),
    })),
  };
}

export async function resolveSessionImportConfigForSave(
  sessionId: string,
  importId: string,
  folderName: string,
): Promise<ImportConfig> {
  const existing = await sceneGetImportConfig(sessionId, importId);
  if (!existing.ssbhConfig) {
    throw new Error("Session import is missing SSBH configuration");
  }

  return {
    ...existing,
    loadToScene: false,
    convertToSsbh: true,
    generateHkt: false,
    ssbhConfig: {
      ...existing.ssbhConfig,
      baseFilename: folderName,
    },
  };
}

export async function retargetAndReconvertSessionImport(
  sessionId: string,
  importId: string,
  importConfig: ImportConfig,
  folderName: string,
): Promise<void> {
  await retargetSessionImportFolderName(sessionId, importId, importConfig, folderName);
  if (importConfig.convertToSsbh) {
    await sceneExecuteImport(sessionId, importId);
  }
}

/**
 * Replace an on-disk stage model folder immediately by writing converted SSBH files
 * under `{stageRoot}/{folderName}/0/...`. Existing files in that folder are
 * overwritten; the folder is not removed before conversion (so a failed convert
 * cannot leave the slot empty on disk).
 */
export async function writeModelReplacementToDisk(params: {
  stageRoot: string;
  filePath: string;
  folderName: string;
  importConfig: ImportConfig;
  /** Named subfolder under the slot to remove after a successful write (legacy base layout). */
  legacySlotSubfolder?: string | null;
  onProgress?: (chunk: StaticMeshImportProgress) => void;
}): Promise<StaticMeshDirectConvertResult> {
  const convertParams = {
    sourcePath: params.filePath,
    outputDir: params.stageRoot,
    config: params.importConfig,
  };
  const result = params.onProgress
    ? await sceneConvertStaticMeshToStageFilesWithProgress(convertParams, params.onProgress)
    : await sceneConvertStaticMeshToStageFiles(convertParams);

  if (params.legacySlotSubfolder) {
    await executeDelete(params.stageRoot, [
      buildLegacySlotSubfolderDeletePath(params.folderName, params.legacySlotSubfolder),
    ]);
  }

  return result;
}

export function buildSsbhSessionImportConfig(
  daeConfig: DaeImportConfig,
  sessionState: Pick<
    DaeSsbhSessionState,
    | "outputBaseName"
    | "scaleFactorText"
    | "upAxis"
    | "flipUv"
    | "writeNumdlb"
    | "writeNumshb"
    | "writeNusktb"
    | "writeNumatb"
    | "writeMayaProfile"
    | "mayaFile"
    | "nustFile"
    | "numdlbEntries"
  >,
  baseFilename: string,
): ImportConfig {
  const scaleFactor = Number(sessionState.scaleFactorText);
  return {
    loadToScene: false,
    convertToSsbh: true,
    generateHkt: daeConfig.generateHkt,
    hktSimplify: daeConfig.hktSimplify,
    ssbhConfig: {
      baseFilename,
      scaleFactor: Number.isFinite(scaleFactor) && scaleFactor > 0 ? scaleFactor : 1,
      upAxis: sessionState.upAxis,
      flipUv: sessionState.flipUv,
      writeNumdlb: sessionState.writeNumdlb,
      writeNumshb: sessionState.writeNumshb,
      writeNusktb: sessionState.writeNusktb,
      writeNumatb: sessionState.writeNumatb,
      writeJnttbl: daeConfig.ssbhConfig.writeJnttbl,
      writeMayaProfile: sessionState.writeMayaProfile,
      materialTemplate: daeConfig.ssbhConfig.materialTemplate || null,
      mayaFile: sessionState.writeMayaProfile ? stripNutexbFromMatl(sessionState.mayaFile) : null,
      nustFile: sessionState.writeNumatb ? stripNutexbFromMatl(sessionState.nustFile) : null,
      numdlbEntries: sessionState.numdlbEntries,
    },
  };
}

export async function importDaeThroughSceneSession(params: {
  sessionId: string;
  filePath: string;
  name: string;
  importConfig: ImportConfig;
  onProgress?: (chunk: StaticMeshImportProgress) => void;
}): Promise<ImportResult> {
  const importId = params.onProgress
    ? await sceneImportDaeFromPathWithProgress(
        params.sessionId,
        params.filePath,
        params.name,
        params.onProgress,
      )
    : await sceneImportDaeFromPath(params.sessionId, params.filePath, params.name);
  await sceneConfigureImport(params.sessionId, importId, params.importConfig);
  return params.onProgress
    ? sceneExecuteImportWithProgress(params.sessionId, importId, params.onProgress)
    : sceneExecuteImport(params.sessionId, importId);
}

export async function retargetSessionImportFolderName(
  sessionId: string,
  importId: string,
  importConfig: ImportConfig,
  folderName: string,
): Promise<void> {
  if (!importConfig.ssbhConfig) {
    throw new Error("Session import is missing SSBH configuration");
  }
  await sceneConfigureImport(sessionId, importId, {
    ...importConfig,
    ssbhConfig: {
      ...importConfig.ssbhConfig,
      baseFilename: folderName,
    },
  });
}

export async function ensureImportedDaeSessionImport(params: {
  sessionId: string;
  object: Pick<ImportedDaeObject, "sessionImportId" | "sourcePath" | "name" | "hktSimplify">;
}): Promise<string> {
  if (params.object.sessionImportId) {
    return params.object.sessionImportId;
  }

  const result = await importDaeThroughSceneSession({
    sessionId: params.sessionId,
    filePath: params.object.sourcePath,
    name: params.object.name,
    importConfig: {
      loadToScene: false,
      convertToSsbh: false,
      generateHkt: false,
      ssbhConfig: null,
      hktSimplify: params.object.hktSimplify ?? { ...DEFAULT_HKT_SIMPLIFY },
    },
  });
  return result.importId;
}
