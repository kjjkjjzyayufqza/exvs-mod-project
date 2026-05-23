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

export interface TextureImportEntry {
  slot: string;
  source:
    | { type: "existing"; path: string }
    | { type: "new"; pngPath: string; ddsFormat: string };
}

export interface DaeImportConfig {
  loadToScene: boolean;
  convertToSsbh: boolean;
  generateHkt: boolean;
  ssbhConfig: SsbhImportConfig;
  textureEntries?: TextureImportEntry[];
  defaultDdsFormat: string;
}

export interface DaeMeshAnalysisRow {
  name: string;
  vertexCount: number;
  indexCount: number;
  triangleCount: number;
  normalCount: number;
  uvCount: number;
  normalsMatchVertices: boolean;
  uvsMatchVertices: boolean;
  boneInfluenceGroups: number;
  maxInfluencesPerVertex: number;
  exceedsFourInfluences: boolean;
}

export interface DaeAnalysisResult {
  daePath: string;
  upAxis: string;
  meshRows: DaeMeshAnalysisRow[];
  boneCount: number;
  boneNames: string[];
  geometryNames: string[];
  blockingErrors: string[];
  warnings: string[];
  canConvert: boolean;
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
