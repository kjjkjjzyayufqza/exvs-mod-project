import type { SsbhDaeUpAxis, SsbhConvertToSsbhParams } from "@/page/TestEditor/components/ssbh-model-preview/ssbhDaeIoService";
import {
  createEmptyMaterialEntry,
  type MatlDataJson,
  type NumdlbMappingRow,
} from "@/page/TestEditor/components/ssbh-model-preview/daeSsbhTypes";
import type { PlacementRow } from "../types/placement";

export const DEFAULT_IMPORTED_DAE_MATERIAL_LABEL = "pbr1Mtl";
const RESERVED_STAGE_MODEL_FOLDERS = new Set(["base", "info", "textures"]);

type ImportedDaePlacementTransform = Pick<
  PlacementRow,
  "posX" | "posY" | "posZ" | "rotX" | "rotY" | "rotZ" | "scaleX" | "scaleY" | "scaleZ"
>;

export function sanitizeSsbhBaseName(value: string): string {
  const sanitized = value
    .trim()
    .replace(/\.[dD][aA][eE]$/, "")
    .replace(/[\/\\:*?"<>|\s]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!sanitized) {
    throw new Error("Imported DAE name must contain at least one valid file-name character");
  }
  return sanitized;
}

function joinTauriPath(...parts: string[]): string {
  return parts
    .map((part, index) => {
      const trimmed = part.trim();
      if (index === 0) return trimmed.replace(/[\/\\]+$/g, "");
      return trimmed.replace(/^[\/\\]+|[\/\\]+$/g, "");
    })
    .filter(Boolean)
    .join("/");
}

export function buildImportedDaeOutputDir(stageRoot: string, baseName: string): string {
  return joinTauriPath(stageRoot, baseName, "0");
}

function hasFolderName(existingFolderNames: readonly string[], folderName: string): boolean {
  const target = folderName.toLocaleLowerCase();
  return existingFolderNames.some((name) => name.toLocaleLowerCase() === target);
}

function createUniqueStageFolderName(baseName: string, existingFolderNames: readonly string[]): string {
  const existingModelFolderNames = existingFolderNames.filter(
    (name) => !RESERVED_STAGE_MODEL_FOLDERS.has(name.trim().toLowerCase()),
  );
  const maxExistingName = existingModelFolderNames.reduce<string | null>(
    (max, name) => max === null || name.localeCompare(max) > 0 ? name : max,
    null,
  );
  const preservesObjectNumbers = (folderName: string) =>
    maxExistingName === null || folderName.localeCompare(maxExistingName) > 0;

  if (!hasFolderName(existingFolderNames, baseName) && preservesObjectNumbers(baseName)) {
    return baseName;
  }

  for (let suffix = 1; suffix < 10_000; suffix += 1) {
    const candidate = `${baseName}_${suffix}`;
    if (!hasFolderName(existingFolderNames, candidate) && preservesObjectNumbers(candidate)) {
      return candidate;
    }
  }

  let appendSafePrefix = "zzzz_import";
  for (let attempts = 0; attempts < 32; attempts += 1) {
    const candidateBase = `${appendSafePrefix}_${baseName}`;
    if (!hasFolderName(existingFolderNames, candidateBase) && preservesObjectNumbers(candidateBase)) {
      return candidateBase;
    }
    for (let suffix = 1; suffix < 10_000; suffix += 1) {
      const candidate = `${candidateBase}_${suffix}`;
      if (!hasFolderName(existingFolderNames, candidate) && preservesObjectNumbers(candidate)) {
        return candidate;
      }
    }
    appendSafePrefix = `z${appendSafePrefix}`;
  }

  throw new Error(`Unable to allocate a unique stage model folder for '${baseName}'`);
}

export function buildImportedDaeStageRegistrationPlan(params: {
  stageRoot: string;
  objectName: string;
  existingFolderNames: readonly string[];
}): { baseFilename: string; folderName: string; outputDir: string } {
  const sanitizedName = sanitizeSsbhBaseName(params.objectName);
  const folderName = createUniqueStageFolderName(sanitizedName, params.existingFolderNames);
  return {
    baseFilename: folderName,
    folderName,
    outputDir: buildImportedDaeOutputDir(params.stageRoot, folderName),
  };
}

export function createImportedDaePlacementRow(params: {
  objectIndex: number;
  placementHeader?: readonly string[];
  transform: ImportedDaePlacementTransform;
}): PlacementRow {
  if (!Number.isInteger(params.objectIndex) || params.objectIndex < 0) {
    throw new Error(`Invalid imported DAE object index: ${params.objectIndex}`);
  }

  const valueByHeader: Record<string, string> = {
    VDK_TYPE: "OBJECT",
    VDK_OBJECTNUMBER: String(params.objectIndex),
    VDK_PROGRAMID: "0",
    VDK_POSITION_X: String(params.transform.posX),
    VDK_POS_X: String(params.transform.posX),
    VDK_POSITION_Y: String(params.transform.posY),
    VDK_POS_Y: String(params.transform.posY),
    VDK_POSITION_Z: String(params.transform.posZ),
    VDK_POS_Z: String(params.transform.posZ),
    VDK_ROTATION_X: String(params.transform.rotX),
    VDK_ROT_X: String(params.transform.rotX),
    VDK_ROTATION_Y: String(params.transform.rotY),
    VDK_ROT_Y: String(params.transform.rotY),
    VDK_ROTATION_Z: String(params.transform.rotZ),
    VDK_ROT_Z: String(params.transform.rotZ),
    VDK_SCALE_X: String(params.transform.scaleX),
    VDK_SCALE_Y: String(params.transform.scaleY),
    VDK_SCALE_Z: String(params.transform.scaleZ),
  };

  const rawFields = params.placementHeader && params.placementHeader.length > 0
    ? params.placementHeader.map((header) => valueByHeader[header.trim().toUpperCase()] ?? "")
    : [
        "VDK_TYPE", "OBJECT",
        "VDK_OBJECTNUMBER", String(params.objectIndex),
        "VDK_PROGRAMID", "0",
        "VDK_POSITION_X", String(params.transform.posX),
        "VDK_POSITION_Y", String(params.transform.posY),
        "VDK_POSITION_Z", String(params.transform.posZ),
        "VDK_ROTATION_X", String(params.transform.rotX),
        "VDK_ROTATION_Y", String(params.transform.rotY),
        "VDK_ROTATION_Z", String(params.transform.rotZ),
        "VDK_SCALE_X", String(params.transform.scaleX),
        "VDK_SCALE_Y", String(params.transform.scaleY),
        "VDK_SCALE_Z", String(params.transform.scaleZ),
      ];

  return {
    vdkType: "OBJECT",
    objectNumber: params.objectIndex,
    posX: params.transform.posX,
    posY: params.transform.posY,
    posZ: params.transform.posZ,
    rotX: params.transform.rotX,
    rotY: params.transform.rotY,
    rotZ: params.transform.rotZ,
    scaleX: params.transform.scaleX,
    scaleY: params.transform.scaleY,
    scaleZ: params.transform.scaleZ,
    rawFields,
  };
}

function writeU32Le(bytes: Uint8Array, offset: number, value: number): void {
  const normalized = value >>> 0;
  bytes[offset] = normalized & 0xff;
  bytes[offset + 1] = (normalized >>> 8) & 0xff;
  bytes[offset + 2] = (normalized >>> 16) & 0xff;
  bytes[offset + 3] = (normalized >>> 24) & 0xff;
}

export function createImportedDaeJnttblBytes(boneCount: number): Uint8Array {
  if (!Number.isInteger(boneCount) || boneCount < 0) {
    throw new Error(`Invalid imported DAE JNTT bone count: ${boneCount}`);
  }

  const bytes = new Uint8Array(16 + boneCount * 8);
  bytes[0] = 0x4a;
  bytes[1] = 0x4e;
  bytes[2] = 0x54;
  bytes[3] = 0x54;
  writeU32Le(bytes, 4, 1);
  writeU32Le(bytes, 8, boneCount);
  writeU32Le(bytes, 12, 0);

  for (let index = 0; index < boneCount; index += 1) {
    const offset = 16 + index * 8;
    writeU32Le(bytes, offset, index);
    writeU32Le(bytes, offset + 4, index);
  }

  return bytes;
}

export function createImportedDaeMaterialProfile(materialLabel = DEFAULT_IMPORTED_DAE_MATERIAL_LABEL): MatlDataJson {
  return {
    major_version: 1,
    minor_version: 6,
    entries: [createEmptyMaterialEntry(materialLabel, "nust")],
  };
}

export function createImportedDaeNumdlbEntries(
  geometryNames: readonly string[],
  materialLabel = DEFAULT_IMPORTED_DAE_MATERIAL_LABEL,
): NumdlbMappingRow[] {
  if (geometryNames.length === 0) {
    throw new Error("Imported DAE conversion requires at least one geometry");
  }
  return geometryNames.map((name) => ({
    meshObjectName: name,
    meshObjectSubindex: 0,
    materialLabel,
  }));
}

export function buildImportedDaeSsbhConvertParams(params: {
  stageRoot: string;
  objectName: string;
  geometryNames: readonly string[];
  scaleFactor: number;
  upAxis: SsbhDaeUpAxis;
}): SsbhConvertToSsbhParams {
  const baseFilename = sanitizeSsbhBaseName(params.objectName);
  const materialProfile = createImportedDaeMaterialProfile();
  return {
    outputDir: buildImportedDaeOutputDir(params.stageRoot, baseFilename),
    baseFilename,
    scaleFactor: params.scaleFactor,
    flipUv: false,
    upAxis: params.upAxis,
    includeGeometryNames: [...params.geometryNames],
    writeLog: true,
    writeNumdlb: true,
    writeNumshb: true,
    writeNusktb: true,
    writeNumatb: true,
    writeMayaProfile: true,
    numdlbEntries: createImportedDaeNumdlbEntries(params.geometryNames),
    mayaFile: materialProfile,
    nustFile: materialProfile,
  };
}
