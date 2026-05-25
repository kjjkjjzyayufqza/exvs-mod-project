import type { DaeSsbhSessionState } from "@/page/TestEditor/components/ssbh-model-preview/daeSsbhTypes";
import type { ImportedDaeObject } from "../components/MapViewport";
import type { DaeImportConfig } from "../components/dae-import/daeImportTypes";
import { DEFAULT_HKT_SIMPLIFY } from "./hktSimplifyUtils";
import {
  sceneConfigureImport,
  sceneExecuteImport,
  sceneGetImportConfig,
  sceneImportDaeFromPath,
  type ImportConfig,
  type ImportResult,
} from "./sceneSessionService";

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

export function buildSsbhSessionImportConfig(
  daeConfig: DaeImportConfig,
  sessionState: Pick<
    DaeSsbhSessionState,
    | "outputBaseName"
    | "scaleFactorText"
    | "upAxis"
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
      writeNumdlb: sessionState.writeNumdlb,
      writeNumshb: sessionState.writeNumshb,
      writeNusktb: sessionState.writeNusktb,
      writeNumatb: sessionState.writeNumatb,
      writeJnttbl: daeConfig.ssbhConfig.writeJnttbl,
      writeMayaProfile: sessionState.writeMayaProfile,
      materialTemplate: daeConfig.ssbhConfig.materialTemplate || null,
      mayaFile: sessionState.writeMayaProfile ? sessionState.mayaFile : null,
      nustFile: sessionState.writeNumatb ? sessionState.nustFile : null,
      numdlbEntries: sessionState.numdlbEntries,
    },
  };
}

export async function importDaeThroughSceneSession(params: {
  sessionId: string;
  filePath: string;
  name: string;
  importConfig: ImportConfig;
}): Promise<ImportResult> {
  const importId = await sceneImportDaeFromPath(params.sessionId, params.filePath, params.name);
  await sceneConfigureImport(params.sessionId, importId, params.importConfig);
  return sceneExecuteImport(params.sessionId, importId);
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

