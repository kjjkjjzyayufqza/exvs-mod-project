import type { DaeAnalysisResult, DaeImportConfig, SsbhDaeUpAxis, SsbhImportConfig, StaticMeshImportFormat } from "./daeImportTypes";
import { DEFAULT_HKT_SIMPLIFY } from "../../utils/hktSimplifyUtils";

/** EXVS2 unit-model mesh units vs typical Blender FBX export (dm vs m). */
export const UNIT_MODEL_BLENDER_FBX_SCALE_FACTOR = 0.1;

export const UNIT_MODEL_BLENDER_FBX_SCALE_FACTOR_TEXT = "0.1";

export function createDefaultSsbhConfig(
  baseFilename: string,
): SsbhImportConfig {
  return {
    baseFilename,
    scaleFactor: 1.0,
    upAxis: "y_up",
    flipUv: false,
    writeNumdlb: true,
    writeNumshb: true,
    writeNusktb: true,
    writeNumatb: true,
    writeJnttbl: true,
    writeMayaProfile: true,
    materialTemplate: "default",
  };
}

export function createDefaultDaeImportConfig(
  baseFilename: string,
): DaeImportConfig {
  return {
    loadToScene: true,
    convertToSsbh: true,
    generateHkt: false,
    directToDisk: false,
    outputDirectory: null,
    hktSimplify: { ...DEFAULT_HKT_SIMPLIFY },
    ssbhConfig: createDefaultSsbhConfig(baseFilename),
    defaultDdsFormat: "BC7_UNORM",
  };
}

export function createBatchDaeImportConfig(
  baseFilename: string,
  outputDirectory: string | null,
): DaeImportConfig {
  return {
    ...createDefaultDaeImportConfig(baseFilename),
    loadToScene: false,
    convertToSsbh: true,
    generateHkt: true,
    directToDisk: true,
    outputDirectory,
  };
}

export function sanitizeBaseFilename(fileName: string): string {
  return (
    fileName
      .replace(/\.[dD][aA][eE]$/, "")
      .replace(/\.[fF][bB][xX]$/, "")
      .replace(/[/\\:*?"<>|\s]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "") || "imported_model"
  );
}

export function detectStaticMeshImportFormat(fileName: string): StaticMeshImportFormat {
  return fileName.toLowerCase().endsWith(".fbx") ? "fbx" : "dae";
}

export function normalizeDaeImportUpAxis(value: string): SsbhDaeUpAxis | null {
  switch (value.trim().toLowerCase()) {
    case "y_up":
    case "y-up":
    case "yup":
      return "y_up";
    case "z_up":
    case "z-up":
    case "zup":
      return "z_up";
    case "none":
    case "no_conversion":
    case "noconversion":
      return "none";
    default:
      return null;
  }
}

export function syncDaeImportConfigUpAxisFromAnalysis(
  config: DaeImportConfig,
  analysis: Pick<DaeAnalysisResult, "upAxis">,
): DaeImportConfig {
  const upAxis = normalizeDaeImportUpAxis(analysis.upAxis);
  if (!upAxis) return config;
  return {
    ...config,
    ssbhConfig: {
      ...config.ssbhConfig,
      upAxis,
    },
  };
}

/**
 * Unit Model Editor: Blender FBX imports target EXVS2 mesh units and UV convention.
 * DAE imports keep generic defaults (scale 1, no UV flip).
 */
export function applyUnitModelFbxImportDefaults(
  config: DaeImportConfig,
  sourceFormat: StaticMeshImportFormat,
): DaeImportConfig {
  if (sourceFormat !== "fbx") {
    return config;
  }
  return {
    ...config,
    ssbhConfig: {
      ...config.ssbhConfig,
      scaleFactor: UNIT_MODEL_BLENDER_FBX_SCALE_FACTOR,
      flipUv: true,
    },
  };
}

export function isHktGenerationAvailable(
  havokInfo: { filterManagerAvailable: boolean } | null,
): boolean {
  return Boolean(havokInfo?.filterManagerAvailable);
}
