import { Buffer } from "buffer";
import { join } from "@tauri-apps/api/path";
import { mkdir } from "@tauri-apps/plugin-fs";
import { readCStringUtf8 } from "@/lib/fhm2d_bufferUtf8";
import {
  assertNoDuplicateFileUrls,
  buildFileUrl,
  getPathSeparatorFromFileUrl,
  splitPathSegments,
} from "@/lib/fhm2d_fileUrlUtils";

/** Fixed offset of internal motion file name (UTF-8 null-terminated) within each decompressed subfile. */
export const MOTION_INTERNAL_NAME_OFFSET = 0x50;

const INTERNAL_NAME_MAX_LEN = 4096;

const INVALID_WIN_FILENAME = /[<>:"|?*\\/]/;

type SubFileDataItem = {
  index: number;
  fileUrl: string;
  fileIndex?: number;
  fileBaseName?: string;
  [key: string]: unknown;
};

type ParseNode = {
  type?: string;
  name?: string;
  children?: ParseNode[];
  [key: string]: unknown;
};

type OutputStructureShape = {
  SubFileData: SubFileDataItem[];
  SubFileParseStructure?: unknown;
  [key: string]: unknown;
};

/**
 * Read internal asset label at 0x50 (null-terminated UTF-8, same CString pattern as other FHM tools).
 */
export function readMotionInternalNameFromBuffer(buffer: Buffer): string {
  if (buffer.length < MOTION_INTERNAL_NAME_OFFSET + 1) {
    throw new Error(
      `Motion subfile buffer too small for internal name at 0x${MOTION_INTERNAL_NAME_OFFSET.toString(16)} (length ${buffer.length})`,
    );
  }
  const raw = readCStringUtf8(buffer, MOTION_INTERNAL_NAME_OFFSET, INTERNAL_NAME_MAX_LEN).trim();
  if (!raw) {
    throw new Error(`Motion subfile: empty internal name at 0x${MOTION_INTERNAL_NAME_OFFSET.toString(16)}`);
  }
  return raw;
}

/**
 * Normalize `.nuanmx.scaled` to `.nuanmb`; rejects other endings.
 */
export function normalizeMotionOutputFileName(raw: string): string {
  const replaced = raw.replace(/\.nuanmx\.scaled$/i, ".nuanmb");
  if (!replaced.toLowerCase().endsWith(".nuanmb")) {
    throw new Error(
      `Motion internal name must end with .nuanmx.scaled or .nuanmb after normalization, got: ${raw}`,
    );
  }
  const base = replaced.slice(0, -".nuanmb".length);
  if (!base || INVALID_WIN_FILENAME.test(base)) {
    throw new Error(`Motion output file base name is invalid: ${replaced}`);
  }
  return replaced;
}

function buildFileIndexToFolderSegments(parseRoot: ParseNode): Map<number, string[]> {
  const map = new Map<number, string[]>();

  function walk(node: ParseNode, folderPath: string[]): void {
    const children = node.children;
    if (!Array.isArray(children)) return;
    for (const child of children) {
      if (child.type === "Folder") {
        walk(child, [...folderPath, String(child.name ?? "")]);
      } else if (child.type === "Item") {
        const fi = Number(child.name);
        if (!Number.isInteger(fi) || fi < 0) {
          throw new Error(`Motion parse tree: invalid Item name (fileIndex): ${String(child.name)}`);
        }
        // Same pool fileIndex may appear in multiple folders; keep the first path for fileUrl.
        if (!map.has(fi)) {
          map.set(fi, folderPath);
        }
      }
    }
  }

  walk(parseRoot, []);
  return map;
}

export function applyMotionAssetNamesToStructureObject(
  outputStructure: OutputStructureShape,
  params: { sortedSubFileBuffers: Buffer[]; fileNameNoExt: string },
): OutputStructureShape {
  const sub = outputStructure.SubFileData;
  if (!Array.isArray(sub)) {
    throw new Error("Motion asset structure: SubFileData must be an array");
  }
  const parseRoot = outputStructure.SubFileParseStructure as ParseNode | undefined;
  if (!parseRoot || typeof parseRoot !== "object") {
    throw new Error("Motion asset structure: SubFileParseStructure is missing");
  }

  const { sortedSubFileBuffers, fileNameNoExt } = params;
  if (sortedSubFileBuffers.length !== sub.length) {
    throw new Error(
      `Motion asset: buffer count ${sortedSubFileBuffers.length} does not match SubFileData length ${sub.length}`,
    );
  }

  const fileIndexToFolders = buildFileIndexToFolderSegments(parseRoot);

  const nextSub: SubFileDataItem[] = sub.map((item, idx) => {
    const fid = item.fileIndex;
    if (fid === undefined) {
      throw new Error(`Motion asset: SubFileData[${idx}] missing fileIndex`);
    }
    const folderSegments = fileIndexToFolders.get(fid);
    if (!folderSegments) {
      throw new Error(`Motion asset: no folder path in SubFileParseStructure for fileIndex ${fid}`);
    }

    const sep = getPathSeparatorFromFileUrl(item.fileUrl);
    const rawName = readMotionInternalNameFromBuffer(sortedSubFileBuffers[idx]!);
    const fileName = normalizeMotionOutputFileName(rawName);

    const prefixSegments = [fileNameNoExt, ...folderSegments];
    const nextUrl = buildFileUrl(prefixSegments, fileName, sep);
    const dot = fileName.lastIndexOf(".");
    const baseName = dot >= 0 ? fileName.slice(0, dot) : fileName;

    return {
      ...item,
      fileBaseName: baseName,
      fileUrl: nextUrl,
    };
  });

  const result: OutputStructureShape = {
    ...outputStructure,
    SubFileData: nextSub,
  };
  assertNoDuplicateFileUrls(result);
  return result;
}

/**
 * Relative path under the extract folder from a motion `fileUrl` (drops root folder segment).
 */
export function motionFileUrlToNestedRelativePath(fileUrl: string, fileNameNoExt: string): string {
  const segments = splitPathSegments(fileUrl);
  if (segments.length < 2) {
    throw new Error(`Motion asset: expected fileUrl with root folder segment, got: ${fileUrl}`);
  }
  if (segments[0] !== fileNameNoExt) {
    throw new Error(
      `Motion asset: fileUrl root "${segments[0]}" does not match output folder "${fileNameNoExt}"`,
    );
  }
  const rest = segments.slice(1);
  if (rest.length === 0) {
    throw new Error(`Motion asset: fileUrl has no file segment: ${fileUrl}`);
  }
  return rest.join("/");
}

/**
 * Creates on-disk directories for `Folder` nodes in `SubFileParseStructure` that have no children
 * (empty folders that would not be created by file writes alone).
 */
export async function ensureEmptyFoldersFromSubFileParseStructure(
  outDir: string,
  parseRoot: unknown,
): Promise<void> {
  if (!parseRoot || typeof parseRoot !== "object") return;

  async function walkFolder(node: ParseNode, folderPath: string[]): Promise<void> {
    const children = node.children;
    if (!Array.isArray(children)) return;
    for (const child of children) {
      if (child.type !== "Folder") continue;
      const name = String(child.name ?? "");
      const nextPath = [...folderPath, name];
      const sub = child.children;
      if (Array.isArray(sub) && sub.length === 0) {
        const dir = await join(outDir, ...nextPath);
        await mkdir(dir, { recursive: true });
      } else {
        await walkFolder(child, nextPath);
      }
    }
  }

  await walkFolder(parseRoot as ParseNode, []);
}
