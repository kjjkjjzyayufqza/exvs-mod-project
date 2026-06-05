import type {
  MatlDataJson,
  NumdlbMappingRow,
} from "@/components/ssbh-model-preview/daeSsbhTypes";

export type SsbhDaeUpAxis = "y_up" | "z_up" | "none";
export type StaticMeshImportFormat = "dae" | "fbx";

export interface SsbhImportConfig {
  baseFilename: string;
  scaleFactor: number;
  upAxis: SsbhDaeUpAxis;
  flipUv?: boolean;
  writeNumdlb: boolean;
  writeNumshb: boolean;
  writeNusktb: boolean;
  writeNumatb: boolean;
  writeJnttbl: boolean;
  writeMayaProfile: boolean;
  materialTemplate: string;
  mayaFile?: MatlDataJson | null;
  nustFile?: MatlDataJson | null;
  numdlbEntries?: NumdlbMappingRow[];
}

export interface TextureImportEntry {
  slot: string;
  source:
    | { type: "existing"; path: string }
    | { type: "new"; pngPath: string; ddsFormat: string };
}

export type HktSimplifyPreset = "none" | "medium" | "high" | "heavy";
export type HktSimplifyStrategy = "shapePreserving" | "convexHull";
export type HktHullPreset = "coarse" | "balanced" | "fine";

export interface HktSimplifyConfig {
  /** Top-level reduction strategy. */
  strategy: HktSimplifyStrategy;
  /** Shape-preserving sub-preset (used when strategy === "shapePreserving"). */
  preset: HktSimplifyPreset;
  /** Convex-hull coarseness sub-preset (used when strategy === "convexHull"). */
  hullPreset: HktHullPreset;
  enabled: boolean;
  /** Max angle (degrees) between coplanar mergeable face normals. */
  planarityAngleDeg: number;
  minTriangleArea: number;
  weldEpsilon: number;
  /** Optional target ratio for aggressive curved-surface collision decimation. */
  targetTriangleRatio: number | null;
  /** Optional absolute cap applied after targetTriangleRatio. */
  maxTargetTriangles: number | null;
  /** Convex-hull face budget (used when strategy === "convexHull"). */
  hullTargetFaces: number | null;
}

export interface DaeImportConfig {
  loadToScene: boolean;
  convertToSsbh: boolean;
  generateHkt: boolean;
  directToDisk: boolean;
  outputDirectory: string | null;
  hktSimplify: HktSimplifyConfig;
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
  sourceFormat: StaticMeshImportFormat;
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
