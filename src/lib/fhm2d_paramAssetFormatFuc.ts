import { buildFileUrl, getPathSeparatorFromFileUrl, splitPathSegments } from "./fhm2d_fileUrlUtils";

export const PARAM_ASSET_FILE_NAMES_BY_ORDER: readonly string[] = [
  "grapparam.bin",
  "projectile_depiction_table.bin",
  "chrsysparam.csyspm",
  "characterparam.bin",
  "interactionid.bin",
  "hitgroupiddef.bin",
  "bulletparam.bin",
  "speedparam.bin",
  "armsparam.bin",
];

const KNOWN_PARAM_COUNT = PARAM_ASSET_FILE_NAMES_BY_ORDER.length;

/**
 * Names extracted Param fhm2d subfiles by their order index in sorted SubFileData (0-based).
 * Indices 0..8 map to known filenames; index >= 9 uses unknown_{index}.bin
 */
export function getParamAssetOutputFileName(sequentialIndex: number): string {
  if (sequentialIndex >= 0 && sequentialIndex < KNOWN_PARAM_COUNT) {
    return PARAM_ASSET_FILE_NAMES_BY_ORDER[sequentialIndex]!;
  }
  return `unknown_${sequentialIndex}.bin`;
}

type SubFileDataItem = {
  index: number;
  fileUrl: string;
  fileIndex?: number;
  fileBaseName?: string;
  [key: string]: unknown;
};

type OutputStructureShape = {
  SubFileData: SubFileDataItem[];
  SubFileStructure?: unknown;
  [key: string]: unknown;
};

/**
 * Rewrites SubFileData fileUrl / fileBaseName to fixed Param filenames by sequential index (same as Model flow, without parsing).
 */
export function applyParamAssetNamesToStructureObject(
  outputStructure: OutputStructureShape,
): OutputStructureShape {
  const sub = outputStructure.SubFileData;
  if (!Array.isArray(sub)) {
    throw new Error("Param asset structure: SubFileData must be an array");
  }

  const nextSub: SubFileDataItem[] = sub.map((item) => {
    const fileName = getParamAssetOutputFileName(item.index);
    const sep = getPathSeparatorFromFileUrl(item.fileUrl);
    const segments = splitPathSegments(item.fileUrl);
    if (segments.length < 2) {
      throw new Error(`Param asset: invalid fileUrl: ${String(item.fileUrl)}`);
    }
    const prefixSegments = segments.slice(0, -1);
    const nextUrl = buildFileUrl(prefixSegments, fileName, sep);
    const dot = fileName.lastIndexOf(".");
    const baseName = dot >= 0 ? fileName.slice(0, dot) : fileName;
    return {
      ...item,
      fileBaseName: baseName,
      fileUrl: nextUrl,
    };
  });

  return {
    ...outputStructure,
    SubFileData: nextSub,
  };
}
