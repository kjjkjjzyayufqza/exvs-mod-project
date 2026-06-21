import { exists, readDir } from "@tauri-apps/plugin-fs";

import { toWindowsPath } from "./unitModelRepackService";

async function readModelNameFromDir(modelDir: string): Promise<string | null> {
  try {
    const entries = await readDir(modelDir);
    for (const entry of entries) {
      if (entry.isDirectory || !entry.name) continue;
      const lower = entry.name.toLowerCase();
      if (!lower.endsWith(".numdlb")) continue;
      const stem = entry.name.slice(0, -".numdlb".length);
      return stem.length > 0 ? stem : null;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * List model identities found under `{modelRoot}/models/*` on disk.
 * Uses the `.numdlb` stem when present; otherwise falls back to the folder name.
 */
export async function listUnitModelDiskModelNames(modelRoot: string): Promise<string[]> {
  const root = toWindowsPath(modelRoot).replace(/\\+$/, "");
  const modelsDir = `${root}\\models`;
  if (!(await exists(modelsDir))) return [];

  const entries = await readDir(modelsDir);
  const names: string[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    if (!entry.isDirectory || !entry.name) continue;
    const modelDir = `${modelsDir}\\${entry.name}`;
    const modelName = (await readModelNameFromDir(modelDir)) ?? entry.name;
    const key = modelName.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(modelName);
  }

  return names;
}
