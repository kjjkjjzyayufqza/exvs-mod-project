import { join } from "@tauri-apps/api/path";
import { exists, readDir, readTextFile, rename, writeTextFile } from "@tauri-apps/plugin-fs";
import { ExtractFHMData, ExtractType, Fhm2d_type_format } from "@/models/fhm2d";
import { planVoiceOrderWorkspace, type PlannedVoicePack } from "../sound-table/soundChainModel";

export async function ensureVoiceOrderExtracted(input: {
  dplCacheDir: string;
  workspaceRoot: string;
  votPackage: number;
}): Promise<PlannedVoicePack> {
  const plan = planVoiceOrderWorkspace(input.workspaceRoot, input.votPackage);
  if ((plan.packageId >>> 0) === 0) {
    throw new Error("votPackage is 0");
  }
  if (await exists(plan.filePath)) return plan;
  await promoteLooseVot(plan);
  if (await exists(plan.filePath)) return plan;

  const dplCacheDir = input.dplCacheDir.trim();
  if (!dplCacheDir) throw new Error("OB dplcache path is not configured");
  const sourceFhm2dPath = await join(dplCacheDir, `${plan.hashHex}.fhm2d`);
  if (!(await exists(sourceFhm2dPath))) {
    throw new Error(`Source FHM2D not found: ${sourceFhm2dPath}`);
  }
  const extractResult = await ExtractFHMData(
    sourceFhm2dPath,
    plan.folderPath,
    ExtractType.SingleFolder,
    Fhm2d_type_format.fhm2d_sound,
  );
  if (extractResult.namingError) {
    throw new Error(extractResult.namingError);
  }
  await promoteLooseVot(plan);
  if (!(await exists(plan.filePath))) {
    const found = await listFolderNames(plan.folderPath);
    throw new Error(
      `Voice order unpack did not write ${plan.filePath} (found: ${found.length > 0 ? found.join(", ") : "nothing"})`,
    );
  }
  return plan;
}

async function listFolderNames(folderPath: string): Promise<string[]> {
  if (!(await exists(folderPath))) return [];
  const entries = await readDir(folderPath);
  return entries.flatMap((entry) => (entry.name ? [entry.name] : []));
}

/** Sound extract names an unmapped vot payload `0.bin`. The editor reads `0.vot`. */
async function promoteLooseVot(plan: PlannedVoicePack): Promise<void> {
  if (await exists(plan.filePath)) return;
  const names = await listFolderNames(plan.folderPath);
  const sourceName =
    names.find((name) => name.toLowerCase().endsWith(".vot")) ??
    names.find((name) => name.toLowerCase() === "0.bin");
  if (!sourceName || sourceName.toLowerCase() === "0.vot") return;
  await rename(await join(plan.folderPath, sourceName), plan.filePath);
  await pointStructureAtLooseVot(plan);
}

async function pointStructureAtLooseVot(plan: PlannedVoicePack): Promise<void> {
  if (!(await exists(plan.structurePath))) return;
  const raw = await readTextFile(plan.structurePath);
  const json = JSON.parse(raw) as {
    SubFileData?: Array<{ fileUrl?: string; fileType?: string; fileBaseName?: string }>;
  };
  const rows = json.SubFileData ?? [];
  let changed = false;
  for (const row of rows) {
    const url = row.fileUrl ?? "";
    const leaf = url.split(/[\\/]/).pop()?.toLowerCase() ?? "";
    if (leaf !== "0.bin" && leaf !== "0.vot" && !leaf.endsWith(".vot")) continue;
    const slash = url.includes("\\") ? "\\" : "/";
    const parent = url.split(/[\\/]/).slice(0, -1);
    row.fileUrl = [...parent, "0.vot"].join(slash);
    row.fileType = ".vot";
    row.fileBaseName = "0";
    changed = true;
  }
  if (!changed) return;
  await writeTextFile(plan.structurePath, `${JSON.stringify(json, null, 2)}\n`);
}
