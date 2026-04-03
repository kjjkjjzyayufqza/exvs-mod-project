import { readDir } from "@tauri-apps/plugin-fs";

const MSC_FOLDER_MARKERS = [".bscex", ".cscex", ".dscex"] as const;
const MSC_SCRIPT_EXTENSION_BY_C_FILE_BASENAME = {
  "0": ".bscex",
  "1": ".cscex",
  "2": ".dscex",
} as const;

function getLowerCaseFileExtension(name: string): string {
  const dotIndex = name.lastIndexOf(".");
  if (dotIndex < 0) {
    throw new Error(`MSC workspace: file has no extension: ${name}`);
  }
  return name.slice(dotIndex).toLowerCase();
}

function replaceTrailingExtension(path: string, currentExtension: string, nextExtension: string): string {
  if (!path.toLowerCase().endsWith(currentExtension)) {
    throw new Error(`MSC workspace: expected ${currentExtension} file: ${path}`);
  }
  return path.slice(0, -currentExtension.length) + nextExtension;
}

export function isMscFolderMarkerFile(name: string): boolean {
  const extension = getLowerCaseFileExtension(name);
  return MSC_FOLDER_MARKERS.includes(extension as (typeof MSC_FOLDER_MARKERS)[number]);
}

export function getMscConvertOutputPath(scriptPath: string): string {
  const extension = getLowerCaseFileExtension(scriptPath);
  if (!MSC_FOLDER_MARKERS.includes(extension as (typeof MSC_FOLDER_MARKERS)[number])) {
    throw new Error(`MSC workspace: unsupported convert source: ${scriptPath}`);
  }
  return replaceTrailingExtension(scriptPath, extension, ".c");
}

export function getMscConvertLogPath(scriptPath: string): string {
  const extension = getLowerCaseFileExtension(scriptPath);
  if (!MSC_FOLDER_MARKERS.includes(extension as (typeof MSC_FOLDER_MARKERS)[number])) {
    throw new Error(`MSC workspace: unsupported convert source: ${scriptPath}`);
  }
  return replaceTrailingExtension(scriptPath, extension, ".txt");
}

export function getMscRepackOutputPath(cFilePath: string): string {
  const extension = getLowerCaseFileExtension(cFilePath);
  if (extension !== ".c") {
    throw new Error(`MSC workspace: unsupported repack source: ${cFilePath}`);
  }

  const normalizedPath = cFilePath.replace(/\\/g, "/");
  const fileName = normalizedPath.split("/").pop();
  if (!fileName) {
    throw new Error(`MSC workspace: invalid repack source path: ${cFilePath}`);
  }

  const baseName = fileName.slice(0, -extension.length);
  const targetExtension =
    MSC_SCRIPT_EXTENSION_BY_C_FILE_BASENAME[
      baseName as keyof typeof MSC_SCRIPT_EXTENSION_BY_C_FILE_BASENAME
    ];
  if (!targetExtension) {
    throw new Error(`MSC workspace: unsupported repack file name: ${fileName}`);
  }

  return replaceTrailingExtension(cFilePath, extension, targetExtension);
}

/**
 * Returns true if the directory contains at least one file with a .bscex / .cscex / .dscex suffix (non-recursive).
 */
export async function folderContainsMscScriptFiles(dirPath: string): Promise<boolean> {
  const trimmed = dirPath.trim();
  if (!trimmed) {
    return false;
  }
  const entries = await readDir(trimmed);
  return entries.some((e) => e.isFile && e.name && isMscFolderMarkerFile(e.name));
}
