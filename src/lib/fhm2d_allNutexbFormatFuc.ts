import { Buffer } from "buffer";

import {
  assertNoDuplicateFileUrls,
  buildFileUrl,
  getPathSeparatorFromFileUrl,
  normalizeWindowsLikePathForCompare,
  splitPathSegments,
} from "@/lib/fhm2d_fileUrlUtils";

export interface Fhm2dSubFileDataItem {
  index: number;
  fileType: string;
  fileIndex: number;
  fileUrl: string;
  fileBaseName?: string;
}

export interface Fhm2dStructureObject {
  SubFileData: Fhm2dSubFileDataItem[];
  [key: string]: unknown;
}

export interface NutexbNamingOptions {
  /**
   * Map of file index to buffer data.
   * All required nutexb files must be provided in this map (read from memory, not disk).
   */
  fileDataMap: Map<number, Uint8Array>;
  /**
   * Max bytes to scan for the name string (including null terminator).
   */
  maxNameLength?: number;
}

function sanitizeFileBaseName(name: string): string {
  // Windows forbidden characters: < > : " / \ | ? *
  // Also remove control chars.
  return name
    .replace(/[<>:"/\\|?*]/g, "_")
    .replace(/[\u0000-\u001f\u007f]/g, "_")
    .trim();
}

function parseNutexbInternalName(bytes: Uint8Array, maxNameLength: number): string {
  const fileSize = bytes.length;
  if (fileSize < 0x8) {
    throw new Error("Invalid nutexb size");
  }

  const buf = Buffer.from(bytes);
  const footerMagic = buf.slice(fileSize - 0x8, fileSize - 0x4).toString("ascii");
  if (footerMagic !== " XET") {
    throw new Error("Invalid nutexb footer magic");
  }

  const majorVersion = buf.readInt16LE(fileSize - 0x4);
  const minorVersion = buf.readInt16LE(fileSize - 0x2);

  let nameOffset: number;
  if (majorVersion === 1 && minorVersion === 1) {
    nameOffset = fileSize - 0x86c;
  } else if ((majorVersion === 2 && minorVersion === 0) || (majorVersion === 1 && minorVersion === 2)) {
    nameOffset = fileSize - 0x70;
  } else {
    throw new Error(`Unsupported nutexb version: ${majorVersion}.${minorVersion}`);
  }

  if (nameOffset < 0 || nameOffset + 4 > fileSize) {
    throw new Error("Invalid nutexb name offset");
  }

  const prefix = buf.slice(nameOffset, nameOffset + 4).toString("ascii");
  if (prefix !== "46XT") {
    throw new Error("Invalid nutexb format: missing 46XT prefix");
  }

  const stringStart = nameOffset + 4;
  const scanLimit = Math.min(fileSize, stringStart + Math.max(1, maxNameLength));
  const nullIndex = buf.indexOf(0x00, stringStart);
  const stringEnd = nullIndex >= 0 ? Math.min(nullIndex, scanLimit) : scanLimit;
  if (stringEnd <= stringStart) {
    throw new Error("Empty nutexb name");
  }

  const rawName = buf.toString("utf8", stringStart, stringEnd);
  const normalized = rawName.replace(/[\\/]/g, "_");
  const baseName = sanitizeFileBaseName(normalized);
  if (!baseName) {
    throw new Error("Invalid nutexb name");
  }
  return baseName;
}

/**
 * Rename all `.nutexb` entries by their internal name.
 * This function only mutates the given object in memory; it does not write any files.
 *
 * - Sets `fileBaseName`
 * - Rewrites `fileUrl` to `.<sep><folderPath><sep><fileBaseName>.nutexb`
 * - De-duplicates names by appending `_1`, `_2`, ...
 */
export async function applyNutexbInternalNameToStructureObject(
  structure: Fhm2dStructureObject,
  options: NutexbNamingOptions
): Promise<Fhm2dStructureObject> {
  const maxNameLength = options.maxNameLength ?? 4096;
  const nutexbItems = structure.SubFileData.filter((e) => (e.fileType || "").toLowerCase() === ".nutexb");

  // Track used fileUrl keys to ensure renaming does not introduce collisions.
  const usedFileUrlKeys = new Set<string>();
  for (const item of structure.SubFileData) {
    const key = normalizeWindowsLikePathForCompare(item.fileUrl || "");
    if (key) usedFileUrlKeys.add(key);
  }

  for (const e of nutexbItems) {
    if (!options.fileDataMap.has(e.fileIndex)) {
      throw new Error(`File data not found in memory for fileIndex=${e.fileIndex}`);
    }
    const bytes = options.fileDataMap.get(e.fileIndex)!;
    const baseName = parseNutexbInternalName(bytes, maxNameLength);

    const sep = getPathSeparatorFromFileUrl(e.fileUrl);
    const segments = splitPathSegments(e.fileUrl);
    if (segments.length < 2) {
      throw new Error(`Invalid fileUrl: ${e.fileUrl}`);
    }
    const prefixSegments = segments.slice(0, -1);

    // Remove current key before assigning a new url, so the item does not conflict with itself.
    const oldKey = normalizeWindowsLikePathForCompare(e.fileUrl || "");
    if (oldKey) usedFileUrlKeys.delete(oldKey);

    const ext = ".nutexb";
    let suffix = 0;
    while (suffix < 10000) {
      const name = suffix === 0 ? baseName : `${baseName}_${suffix}`;
      const candidateUrl = buildFileUrl(prefixSegments, `${name}${ext}`, sep);
      const candidateKey = normalizeWindowsLikePathForCompare(candidateUrl);
      if (!candidateKey || usedFileUrlKeys.has(candidateKey)) {
        suffix++;
        continue;
      }
      usedFileUrlKeys.add(candidateKey);
      e.fileBaseName = name;
      e.fileUrl = candidateUrl;
      break;
    }

    if (suffix >= 10000) {
      throw new Error(`Failed to assign a unique nutexb name: baseName=${baseName} fileIndex=${e.fileIndex}`);
    }
  }

  assertNoDuplicateFileUrls(structure);
  return structure;
}


