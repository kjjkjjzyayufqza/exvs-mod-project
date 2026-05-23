import fs from "fs/promises";
import path from "path";

const BACKUP_SUFFIX = "__backup";

export async function backupStageFolder(stageRoot: string): Promise<string> {
  const backupPath = `${stageRoot}${BACKUP_SUFFIX}`;
  await copyDirectoryRecursive(stageRoot, backupPath);
  return backupPath;
}

export async function restoreStageFolder(stageRoot: string): Promise<void> {
  const backupPath = `${stageRoot}${BACKUP_SUFFIX}`;
  const backupExists = await pathExists(backupPath);
  if (!backupExists) throw new Error(`Backup not found: ${backupPath}`);
  await fs.rm(stageRoot, { recursive: true, force: true });
  await copyDirectoryRecursive(backupPath, stageRoot);
  await fs.rm(backupPath, { recursive: true, force: true });
}

async function copyDirectoryRecursive(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDirectoryRecursive(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
