import { join } from "@tauri-apps/api/path";
import { exists, readDir, remove } from "@tauri-apps/plugin-fs";

/**
 * Pack stem used for mod output names: strip directories and optional `.fhm2d`.
 * Prefer the stem of the written `.fhm2d` path (HashName), not the workspace folder name.
 */
export function getFhm2dPackStem(pathOrName: string): string {
  const base = pathOrName.trim().replace(/\\/g, "/").split("/").pop() ?? "";
  return base.replace(/\.fhm2d$/i, "");
}

/**
 * Delete `{packStem}.vgsht2` from the OB mod folder when present.
 * Matches case-insensitively so Windows casing variants are covered.
 *
 * Callers must pass the **output .fhm2d stem** (HashName), not a custom workspace
 * folder name — repack writes `0xHASH.fhm2d` while folders may be `Gyan_model`.
 */
export async function removeMatchingModVgsht2(
  modFolderPath: string,
  packNameOrFhm2dPath: string,
): Promise<boolean> {
  const modDir = modFolderPath.trim();
  const stem = getFhm2dPackStem(packNameOrFhm2dPath);
  if (!modDir || !stem) return false;

  // Fast path: exact stem + extension (usual case after HashName-based repack).
  const directPath = await join(modDir, `${stem}.vgsht2`);
  try {
    if (await exists(directPath)) {
      await remove(directPath);
      return true;
    }
  } catch {
    // Fall through to directory scan / surface via outer try in callers if remove fails later.
  }

  // Case-insensitive scan: do not require entry.isFile (some plugin-fs builds leave it unset).
  const targetFileNameLower = `${stem}.vgsht2`.toLowerCase();
  let entries: Awaited<ReturnType<typeof readDir>>;
  try {
    entries = await readDir(modDir);
  } catch {
    return false;
  }

  for (const entry of entries) {
    if (!entry.name) continue;
    if (entry.isDirectory) continue;
    if (entry.name.toLowerCase() !== targetFileNameLower) continue;

    const targetPath = await join(modDir, entry.name);
    await remove(targetPath);
    return true;
  }

  return false;
}
