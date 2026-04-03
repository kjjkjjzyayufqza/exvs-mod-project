import { buildFileUrl, getPathSeparatorFromFileUrl, splitPathSegments } from "./fhm2d_fileUrlUtils";

/** Fixed MSC script names by sorted subfile order (FileIndex order). */
export const MSC_ASSET_FILE_NAMES_BY_ORDER: readonly string[] = ["0.bscex", "1.cscex", "2.dscex"];

const MSC_REQUIRED_COUNT = MSC_ASSET_FILE_NAMES_BY_ORDER.length;

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
 * Rewrites SubFileData fileUrl / fileBaseName to 0.bscex, 1.cscex, 2.dscex by sequential index.
 * Caller must ensure exactly three subfiles (validated in ExtractFHMData for MSC format).
 */
export function applyMscAssetNamesToStructureObject(
  outputStructure: OutputStructureShape,
): OutputStructureShape {
  const sub = outputStructure.SubFileData;
  if (!Array.isArray(sub)) {
    throw new Error("MSC asset structure: SubFileData must be an array");
  }
  if (sub.length !== MSC_REQUIRED_COUNT) {
    throw new Error(
      `MSC asset extract: expected exactly ${MSC_REQUIRED_COUNT} subfiles, got ${sub.length}`,
    );
  }

  const nextSub: SubFileDataItem[] = sub.map((item, idx) => {
    const fileName = MSC_ASSET_FILE_NAMES_BY_ORDER[idx]!;
    const sep = getPathSeparatorFromFileUrl(item.fileUrl);
    const segments = splitPathSegments(item.fileUrl);
    if (segments.length < 2) {
      throw new Error(`MSC asset: invalid fileUrl: ${String(item.fileUrl)}`);
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
