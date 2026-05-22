import type {
  DaeImportConfig,
  SsbhImportConfig,
  HktImportConfig,
} from "./daeImportTypes";

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

export function createDefaultHktConfig(): HktImportConfig {
  return {
    havokToolPath: "",
    configProfile: "",
  };
}

export function createDefaultDaeImportConfig(
  baseFilename: string,
): DaeImportConfig {
  return {
    loadToScene: true,
    convertToSsbh: false,
    generateHkt: false,
    ssbhConfig: createDefaultSsbhConfig(baseFilename),
    hktConfig: createDefaultHktConfig(),
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
