import { readDir, remove, stat } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";

export type DeletePreview = {
  folderName: string;
  folderPath: string;
  files: string[];
  totalSizeBytes: number;
};

export type DeleteConfirmation = {
  previews: DeletePreview[];
  totalFiles: number;
  totalSizeBytes: number;
};

async function collectFilesRecursive(dirPath: string): Promise<{ name: string; size: number }[]> {
  const results: { name: string; size: number }[] = [];
  const entries = await readDir(dirPath);
  for (const entry of entries) {
    const fullPath = await join(dirPath, entry.name);
    if (entry.isDirectory) {
      const sub = await collectFilesRecursive(fullPath);
      results.push(...sub);
    } else {
      const info = await stat(fullPath);
      results.push({ name: entry.name, size: info.size });
    }
  }
  return results;
}

export async function buildDeletePreview(
  stageRoot: string,
  deletedFolderNames: string[],
): Promise<DeleteConfirmation> {
  const previews: DeletePreview[] = [];
  let totalFiles = 0;
  let totalSizeBytes = 0;

  for (const folderName of deletedFolderNames) {
    const folderPath = await join(stageRoot, folderName);
    let files: { name: string; size: number }[] = [];
    try {
      files = await collectFilesRecursive(folderPath);
    } catch {
      previews.push({ folderName, folderPath, files: [], totalSizeBytes: 0 });
      continue;
    }
    const folderSize = files.reduce((sum, f) => sum + f.size, 0);
    previews.push({
      folderName,
      folderPath,
      files: files.map((f) => f.name),
      totalSizeBytes: folderSize,
    });
    totalFiles += files.length;
    totalSizeBytes += folderSize;
  }

  return { previews, totalFiles, totalSizeBytes };
}

export async function executeDelete(
  stageRoot: string,
  confirmedFolderNames: string[],
): Promise<void> {
  for (const folderName of confirmedFolderNames) {
    const folderPath = await join(stageRoot, folderName);
    await remove(folderPath, { recursive: true });
  }
}

const BASE_SSBH_EXTENSIONS = ["numdlb", "numshb", "numshexb", "nusktb", "numatb"];

export async function buildBaseDeletePreview(
  stageRoot: string,
): Promise<DeleteConfirmation> {
  const previews: DeletePreview[] = [];
  let totalFiles = 0;
  let totalSizeBytes = 0;

  const entries = await readDir(stageRoot);
  const rootFiles: { name: string; size: number }[] = [];
  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const ext = entry.name.split(".").pop()?.toLowerCase() ?? "";
    if (BASE_SSBH_EXTENSIONS.includes(ext)) {
      const fullPath = await join(stageRoot, entry.name);
      const info = await stat(fullPath);
      rootFiles.push({ name: entry.name, size: info.size });
    }
  }

  if (rootFiles.length > 0) {
    const folderSize = rootFiles.reduce((sum, f) => sum + f.size, 0);
    previews.push({
      folderName: "(base model)",
      folderPath: stageRoot,
      files: rootFiles.map((f) => f.name),
      totalSizeBytes: folderSize,
    });
    totalFiles += rootFiles.length;
    totalSizeBytes += folderSize;
  }

  return { previews, totalFiles, totalSizeBytes };
}

export async function executeBaseDelete(stageRoot: string): Promise<void> {
  const entries = await readDir(stageRoot);
  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const ext = entry.name.split(".").pop()?.toLowerCase() ?? "";
    if (BASE_SSBH_EXTENSIONS.includes(ext)) {
      const fullPath = await join(stageRoot, entry.name);
      await remove(fullPath);
    }
  }
}
