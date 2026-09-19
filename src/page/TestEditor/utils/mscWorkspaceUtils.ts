import { readDir } from "@tauri-apps/plugin-fs";
import type { TestTreeNode } from "../types";

const MSC_FOLDER_MARKERS = [".bscex", ".cscex", ".dscex"] as const;
const MSC_SCRIPT_EXTENSION_BY_C_FILE_BASENAME = {
  "0": ".bscex",
  "1": ".cscex",
  "2": ".dscex",
} as const;

export const MISSION_SCRIPT_EXTENSION = ".mismsexc";

export type MscWorkspaceMode = "unit" | "mission" | "traditional";

function getLowerCaseFileExtension(name: string): string {
  const extension = tryLowerCaseExtension(name);
  if (!extension) {
    throw new Error(`MSC workspace: file has no extension: ${name}`);
  }
  return extension;
}

function tryLowerCaseExtension(name: string): string | null {
  const dotIndex = name.lastIndexOf(".");
  if (dotIndex < 0) return null;
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
  const extension = tryLowerCaseExtension(name);
  if (!extension) return false;
  if (mode === "traditional") {
    return extension === ".bin";
  }
  if (mode === "mission") {
    return extension === MISSION_SCRIPT_EXTENSION;
  }
  return MSC_FOLDER_MARKERS.includes(extension as (typeof MSC_FOLDER_MARKERS)[number]);
}

/** Unit packs win over mission scripts if a folder somehow contains both. */
export function detectMscWorkspaceModeFromNames(
  names: readonly string[],
): Exclude<MscWorkspaceMode, "traditional"> | null {
  let hasMission = false;
  for (const name of names) {
    if (isMscFolderMarkerFile(name, "unit")) return "unit";
    if (isMscFolderMarkerFile(name, "mission")) hasMission = true;
  }
  return hasMission ? "mission" : null;
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
  if (mode === "mission") {
    if (extension !== MISSION_SCRIPT_EXTENSION) {
      throw new Error(`MSC workspace: unsupported mission convert source: ${scriptPath}`);
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
  if (mode === "mission") {
    if (extension !== MISSION_SCRIPT_EXTENSION) {
      throw new Error(`MSC workspace: unsupported mission convert source: ${scriptPath}`);
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
  if (mode === "mission") {
    return replaceTrailingExtension(cFilePath, extension, MISSION_SCRIPT_EXTENSION);
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
 * Returns true if the directory contains at least one script the given mode
 * recognises. With no mode, unit or mission markers both count so tree
 * selection can open either pack. Traditional `.bin` stays opt-in.
 */
export async function folderContainsMscScriptFiles(
  dirPath: string,
  mode?: MscWorkspaceMode,
): Promise<boolean> {
  const trimmed = dirPath.trim();
  if (!trimmed) {
    return false;
  }
  const entries = await readDir(trimmed);
  return entries.some((e) => {
    if (!e.isFile || !e.name) return false;
    if (mode) return isMscFolderMarkerFile(e.name, mode);
    return isMscFolderMarkerFile(e.name, "unit") || isMscFolderMarkerFile(e.name, "mission");
  });
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
