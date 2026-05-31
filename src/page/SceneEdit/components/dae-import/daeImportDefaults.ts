import type { DaeImportConfig, SsbhImportConfig, StaticMeshImportFormat } from "./daeImportTypes";
import { DEFAULT_HKT_SIMPLIFY } from "../../utils/hktSimplifyUtils";

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

export function isHktGenerationAvailable(
  havokInfo: { filterManagerAvailable: boolean } | null,
): boolean {
  return Boolean(havokInfo?.filterManagerAvailable);
}
