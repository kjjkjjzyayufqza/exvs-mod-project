import { join } from "@tauri-apps/api/path";
import { readDir, remove } from "@tauri-apps/plugin-fs";

export async function removeMatchingModVgsht2(
  modFolderPath: string,
  packName: string
): Promise<boolean> {
  const targetFileNameLower = `${packName}.vgsht2`.toLowerCase();
  const entries = await readDir(modFolderPath);

  for (const entry of entries) {
    if (!entry.isFile || !entry.name) {
      continue;
    }
    if (entry.name.toLowerCase() !== targetFileNameLower) {
      continue;
    }

    const targetPath = await join(modFolderPath, entry.name);
    await remove(targetPath);
    return true;
  }

  return false;
}

