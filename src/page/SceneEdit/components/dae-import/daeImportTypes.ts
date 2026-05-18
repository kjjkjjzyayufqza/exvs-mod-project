export type SsbhDaeUpAxis = "y_up" | "z_up";

export interface SsbhImportConfig {
  baseFilename: string;
  scaleFactor: number;
  upAxis: SsbhDaeUpAxis;
  writeNumdlb: boolean;
  writeNumshb: boolean;
  writeNusktb: boolean;
  writeNumatb: boolean;
  writeJnttbl: boolean;
  writeMayaProfile: boolean;
  materialTemplate: string;
}

export interface HktImportConfig {
  havokToolPath: string;
  configProfile: string;
}

export interface DaeImportConfig {
  loadToScene: boolean;
  convertToSsbh: boolean;
  generateHkt: boolean;
  ssbhConfig: SsbhImportConfig;
  hktConfig: HktImportConfig;
}

export interface DaeAnalysisResult {
  meshCount: number;
  vertexCount: number;
  boneCount: number;
  geometryNames: string[];
  canConvert: boolean;
  warnings: string[];
  blockingErrors: string[];
}

export interface DaeImportEntry {
  importId: string;
  fileName: string;
  filePath: string;
  analysis: DaeAnalysisResult | null;
  config: DaeImportConfig;
  analyzing: boolean;
  analyzeError: string | null;
}

export interface HavokInstallInfo {
  version: string;
  fileConvertAvailable: boolean;
  filterManagerAvailable: boolean;
  configProfiles: string[];
}
