import { invoke } from "@tauri-apps/api/core";
import { exists, readFile, writeFile } from "@tauri-apps/plugin-fs";

import { repackFolderUsingStructureToModFolder } from "@/utils/repackRunner";

export interface MissionPackPaths {
  /** Compiled script the packer reads. Same folder and stem as the `.c`. */
  binaryPath: string;
  /** Package folder that holds the `.mismsexc`. */
  packageDir: string;
  /** `_structure.json` beside or inside that folder. */
  structureCandidates: string[];
}

function toWindowsPath(path: string): string {
  return path.replace(/\//g, "\\");
}

/**
 * Where a saved mission `.c` writes its binary and which structure files can pack it.
 *
 * Extracted mission packages keep `<folder>_structure.json` next to the package
 * folder. A flat extract keeps the structure inside the folder, named after the
 * folder or the script stem.
 */
export function missionPackPaths(cPath: string): MissionPackPaths {
  const normalized = toWindowsPath(cPath);
  if (!/\.c$/i.test(normalized)) {
    throw new Error(`Mission source must be a .c file: ${cPath}`);
  }
  const parts = normalized.split("\\");
  const fileName = parts.pop() ?? "";
  const packageDir = parts.join("\\");
  const stem = fileName.replace(/\.c$/i, "");
  const folderName = parts.at(-1) ?? stem;
  const parentDir = parts.slice(0, -1).join("\\");
  const structureCandidates = [
    parentDir ? `${parentDir}\\${folderName}_structure.json` : "",
    packageDir ? `${packageDir}\\${folderName}_structure.json` : "",
    packageDir ? `${packageDir}\\${stem}_structure.json` : "",
  ].filter((candidate, index, all) => candidate.length > 0 && all.indexOf(candidate) === index);
  return {
    binaryPath: `${packageDir}\\${stem}.mismsexc`,
    packageDir,
    structureCandidates,
  };
}

export async function packMissionScript(input: {
  cPath: string;
  source: string;
  modFolderPath: string;
}): Promise<{ binaryPath: string; outputPath: string }> {
  const modFolder = input.modFolderPath.trim();
  if (!modFolder) {
    throw new Error("OB Mod folder is not configured. Set it in Config before packing.");
  }
  const paths = missionPackPaths(input.cPath);
  const bytes = await invoke<number[]>("compile_mission_authoring", { source: input.source });
  if (await exists(paths.binaryPath)) {
    const previous = await readFile(paths.binaryPath);
    await writeFile(`${paths.binaryPath}.bak`, previous);
  }
  await writeFile(paths.binaryPath, new Uint8Array(bytes));

  let structurePath: string | null = null;
  for (const candidate of paths.structureCandidates) {
    if (await exists(candidate)) {
      structurePath = candidate;
      break;
    }
  }
  if (!structurePath) {
    throw new Error(
      `No _structure.json for ${paths.packageDir}. Looked for ${paths.structureCandidates.join(", ")}`,
    );
  }

  const packed = await repackFolderUsingStructureToModFolder({
    structurePath,
    inputFolderPath: paths.packageDir,
    modFolderPath: modFolder,
  });
  return { binaryPath: paths.binaryPath, outputPath: packed.outputPath };
}
