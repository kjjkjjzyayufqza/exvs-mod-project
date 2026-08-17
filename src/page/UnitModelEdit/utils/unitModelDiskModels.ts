import { exists, readDir } from "@tauri-apps/plugin-fs";

import { toWindowsPath } from "./unitModelRepackService";

/**
 * List model folder identities under `{modelRoot}/models/*` on disk.
 *
 * Uses the **directory name** (not the `.numdlb` stem). SHL `folder_index` and
 * structure-JSON model groups key off the `models/<folder>/` segment; numdlb
 * basenames can differ after renames (e.g. folder `015gndmuc_…_body_normal`
 * with `026gnbelt_….numdlb` inside) and must not redefine slot order.
 *
 * Order is filesystem enumeration order and is only a fallback when structure
 * JSON is unavailable — never the authoritative SHL folder index order.
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
    const modelName = entry.name;
    const key = modelName.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(modelName);
  }

  return names;
}
