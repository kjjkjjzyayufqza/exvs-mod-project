import { invoke } from "@tauri-apps/api/core";

export type StageExtractResult = {
  outputDir: string;
  totalFiles: number;
  totalBytes: number;
  warnings: string[];
};

export type SsbhModelPreviewBundle = Record<string, unknown>;

export type StageSubModelEntry = {
  folderName: string;
  objectIndex: number;
  bundle: SsbhModelPreviewBundle;
};

export type GraphicParamEntry = {
  key: string;
  value: string;
};

export type PlacementEntryFromBundle = {
  vdkType: string;
  objectNumber: number | null;
  posX: number;
  posY: number;
  posZ: number;
  rotX: number;
  rotY: number;
  rotZ: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  rawFields: string[];
};

export type StageBundleResponse = {
  rootPath: string;
  baseModel: SsbhModelPreviewBundle | null;
  subModels: StageSubModelEntry[];
  graphicParams: GraphicParamEntry[];
  placementHeader: string[];
  placementEntries: PlacementEntryFromBundle[];
  warnings: string[];
};

export type RedistributeResult = {
  modelsProcessed: number;
  texturesCopied: number;
  texturesFolderRemoved: boolean;
  warnings: string[];
};

export type RestoreSharedResult = {
  texturesCollected: number;
  subdirsRemoved: number;
  warnings: string[];
};

export type RepackResult = {
  outputPath: string;
  totalFiles: number;
  outputSize: number;
};

export type DaeAnalysisReport = {
  canConvert: boolean;
  geometryNames: string[];
  blockingErrors: string[];
};

export async function extractFhm2d(
  sourcePath: string,
  outputDir: string,
): Promise<StageExtractResult> {
  return invoke("extract_stage_fhm2d_to_folder", { sourcePath, outputDir });
}

export async function loadStageBundle(
  stageRoot: string,
): Promise<StageBundleResponse> {
  return invoke("load_stage_bundle", { stageRoot });
}

export async function redistributeTextures(
  stageRoot: string,
): Promise<RedistributeResult> {
  return invoke("redistribute_stage_textures", { stageRoot });
}

export async function restoreSharedTextures(
  stageRoot: string,
): Promise<RestoreSharedResult> {
  return invoke("restore_shared_textures", { stageRoot });
}

export async function rebuildStructureJson(
  stageRoot: string,
): Promise<string> {
  return invoke("rebuild_stage_structure_json", { stageRoot });
}

export async function repackFhm2d(
  structureJsonPath: string,
  outputPath: string,
): Promise<RepackResult> {
  return invoke("repack_fhm2d", {
    structureJsonPath,
    outputPath,
    atomicWrite: true,
  });
}

export async function convertDaeToSsbh(params: {
  daePath: string;
  outputDir: string;
  baseFilename: string;
  scaleFactor: number;
  flipUv: boolean;
  upAxis: string;
  includeGeometryNames: string[];
  writeLog: boolean;
  writeNumdlb: boolean;
  writeNumshb: boolean;
  writeNusktb: boolean;
  writeNumatb: boolean;
  writeMayaProfile: boolean;
  numdlbEntries: Array<{
    meshObjectName: string;
    meshObjectSubindex: number;
    materialLabel: string;
  }>;
  mayaFile: unknown;
  nustFile: unknown;
}): Promise<unknown> {
  return invoke("ssbh_convert_dae_to_ssbh", params);
}

export async function analyzeDae(daePath: string): Promise<DaeAnalysisReport> {
  return invoke("ssbh_analyze_dae", { daePath });
}
