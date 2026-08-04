import { readDir } from "@tauri-apps/plugin-fs";
import type { TestTreeNode } from "../types";

const MSC_FOLDER_MARKERS = [".bscex", ".cscex", ".dscex"] as const;
const MSC_SCRIPT_EXTENSION_BY_C_FILE_BASENAME = {
  "0": ".bscex",
  "1": ".cscex",
  "2": ".dscex",
} as const;

export type MscWorkspaceMode = "unit" | "traditional";

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

export function isMscFolderMarkerFile(
  name: string,
  mode: MscWorkspaceMode = "unit",
): boolean {
  const extension = getLowerCaseFileExtension(name);
  if (mode === "traditional") {
    return extension === ".bin";
  }
  return MSC_FOLDER_MARKERS.includes(extension as (typeof MSC_FOLDER_MARKERS)[number]);
}

export function getMscConvertOutputPath(
  scriptPath: string,
  mode: MscWorkspaceMode = "unit",
): string {
  const extension = getLowerCaseFileExtension(scriptPath);
  if (mode === "traditional") {
    if (extension !== ".bin") {
      throw new Error(`MSC workspace: unsupported traditional convert source: ${scriptPath}`);
    }
    return replaceTrailingExtension(scriptPath, extension, ".c");
  }
  if (!MSC_FOLDER_MARKERS.includes(extension as (typeof MSC_FOLDER_MARKERS)[number])) {
    throw new Error(`MSC workspace: unsupported convert source: ${scriptPath}`);
  }
  return replaceTrailingExtension(scriptPath, extension, ".c");
}

export function getMscConvertLogPath(
  scriptPath: string,
  mode: MscWorkspaceMode = "unit",
): string {
  const extension = getLowerCaseFileExtension(scriptPath);
  if (mode === "traditional") {
    if (extension !== ".bin") {
      throw new Error(`MSC workspace: unsupported traditional convert source: ${scriptPath}`);
    }
    return replaceTrailingExtension(scriptPath, extension, ".txt");
  }
  if (!MSC_FOLDER_MARKERS.includes(extension as (typeof MSC_FOLDER_MARKERS)[number])) {
    throw new Error(`MSC workspace: unsupported convert source: ${scriptPath}`);
  }
  return replaceTrailingExtension(scriptPath, extension, ".txt");
}

export function getMscRepackOutputPath(
  cFilePath: string,
  mode: MscWorkspaceMode = "unit",
): string {
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
  if (mode === "traditional") {
    return replaceTrailingExtension(cFilePath, extension, ".bin");
  }
  const targetExtension =
    MSC_SCRIPT_EXTENSION_BY_C_FILE_BASENAME[
      baseName as keyof typeof MSC_SCRIPT_EXTENSION_BY_C_FILE_BASENAME
    ];
  if (!targetExtension) {
    throw new Error(`MSC workspace: unsupported repack file name: ${fileName}`);
  }

  return replaceTrailingExtension(cFilePath, extension, targetExtension);
}

export function getMscResolvedOverlayPath(cFilePath: string): string {
  const extension = getLowerCaseFileExtension(cFilePath);
  if (extension !== ".c") {
    throw new Error(`MSC workspace: unsupported resolved overlay source: ${cFilePath}`);
  }
  return replaceTrailingExtension(cFilePath, extension, ".resolved.md");
}

/**
 * Returns true if the directory contains at least one file with a .bscex / .cscex / .dscex suffix (non-recursive).
 */
export async function folderContainsMscScriptFiles(
  dirPath: string,
  mode: MscWorkspaceMode = "unit",
): Promise<boolean> {
  const trimmed = dirPath.trim();
  if (!trimmed) {
    return false;
  }
  const entries = await readDir(trimmed);
  return entries.some((e) => e.isFile && e.name && isMscFolderMarkerFile(e.name, mode));
}

type MscWorkspaceSelectionNode = Pick<TestTreeNode, "path" | "isDir">;

function normalizeCandidateKey(path: string): string {
  return path.trim().replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

export async function resolveMscWorkspaceFolderPathForSelection({
  currentDir,
  selectedNode,
  dirnameOfFile,
  containsMscScriptFiles = folderContainsMscScriptFiles,
}: {
  currentDir?: string | null;
  selectedNode?: MscWorkspaceSelectionNode | null;
  dirnameOfFile: (path: string) => Promise<string>;
  containsMscScriptFiles?: (path: string) => Promise<boolean>;
}): Promise<string | null> {
  const candidates: string[] = [];

  if (selectedNode) {
    try {
      candidates.push(selectedNode.isDir ? selectedNode.path : await dirnameOfFile(selectedNode.path));
    } catch {
      // Fall through to the current folder candidate below.
    }
  }

  if (currentDir?.trim()) {
    candidates.push(currentDir);
  }

  const seen = new Set<string>();
  for (const candidate of candidates) {
    const key = normalizeCandidateKey(candidate);
    if (!key || seen.has(key)) continue;
    seen.add(key);

    try {
      if (await containsMscScriptFiles(candidate)) {
        return candidate;
      }
    } catch {
      // Ignore stale or inaccessible candidates and keep trying lower-priority paths.
    }
  }

  return null;
}

export function shouldAutoActivateMscWorkspaceTab({
  activeTab,
  mscWorkspaceFolderPath,
  lastAutoActivatedFolderPath,
}: {
  activeTab: string;
  mscWorkspaceFolderPath: string | null | undefined;
  lastAutoActivatedFolderPath: string | null;
}): boolean {
  return (
    activeTab === "folder-structure" &&
    Boolean(mscWorkspaceFolderPath) &&
    mscWorkspaceFolderPath !== lastAutoActivatedFolderPath
  );
}
