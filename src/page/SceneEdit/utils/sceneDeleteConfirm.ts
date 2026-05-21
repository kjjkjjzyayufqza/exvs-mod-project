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
