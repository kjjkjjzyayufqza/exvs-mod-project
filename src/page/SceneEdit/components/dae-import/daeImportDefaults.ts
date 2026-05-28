import type { DaeImportConfig, SsbhImportConfig } from "./daeImportTypes";
import { DEFAULT_HKT_SIMPLIFY } from "../../utils/hktSimplifyUtils";

export function createDefaultSsbhConfig(
  baseFilename: string,
): SsbhImportConfig {
  return {
    baseFilename,
    scaleFactor: 1.0,
    upAxis: "y_up",
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
    generateHkt: true,
    hktSimplify: { ...DEFAULT_HKT_SIMPLIFY },
    ssbhConfig: createDefaultSsbhConfig(baseFilename),
    defaultDdsFormat: "BC7_UNORM",
  };
}

export function sanitizeBaseFilename(fileName: string): string {
  return (
    fileName
      .replace(/\.[dD][aA][eE]$/, "")
      .replace(/[/\\:*?"<>|\s]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "") || "imported_model"
  );
}

export function isHktGenerationAvailable(
  havokInfo: { filterManagerAvailable: boolean } | null,
): boolean {
  return Boolean(havokInfo?.filterManagerAvailable);
}
