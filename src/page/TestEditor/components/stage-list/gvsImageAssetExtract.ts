import { invoke } from "@tauri-apps/api/core";
import { basename, join } from "@tauri-apps/api/path";
import { exists, mkdir, readFile, writeFile } from "@tauri-apps/plugin-fs";

import type { StageDataGVSEntry, StageListGVS } from "@/models/stageList";
import { createGvsMapToVs2Package } from "@/page/MiscTools/components/gvs-map-to-vs2/gvsMapToVs2Service";
import { resolveGvsIndexedNameRef } from "./gvsFileNameSearch";

const GVS_IMAGE_NAME_FIELDS: Array<keyof StageDataGVSEntry> = [
  "stg_grd_1",
  "stg_full",
  "stg_vs_2",
  "stg_grd_2",
];

type NutexbInfo = {
  name: string;
};

export interface GvsImageConvertProgress {
  current: number;
  total: number;
  currentFile: string;
}

export interface GvsImageConvertSuccess {
  sourceBinPath: string;
  internalName: string;
  outputPngPath: string;
}

export interface GvsImageConvertFailure {
  sourceBinPath: string;
  target: string;
  reason: string;
}

export interface GvsImageConvertResult {
  converted: number;
  failed: number;
  successes: GvsImageConvertSuccess[];
  failures: GvsImageConvertFailure[];
}

export interface GvsIndexedBinEntry {
  path: string;
  exists: boolean;
}

function sanitizeFileName(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Nutexb internal name is empty");
  }
  return trimmed.replace(/[\\/:*?"<>|]/g, "_");
}

async function resolveNextOutputPngPath(
  outputDir: string,
  baseName: string,
  usedOutputNames: Set<string>
): Promise<string> {
  let suffix = 0;
  while (suffix < 100000) {
    const finalName = suffix === 0 ? baseName : `${baseName}_${suffix}`;
    const outputPngPath = await join(outputDir, `${finalName}.png`);
    const outputKey = outputPngPath.toLowerCase();

    if (usedOutputNames.has(outputKey)) {
      suffix += 1;
      continue;
    }

    const existsOnDisk = await exists(outputPngPath);
    if (existsOnDisk) {
      suffix += 1;
      continue;
    }

    usedOutputNames.add(outputKey);
    return outputPngPath;
  }

  throw new Error(`Failed to allocate unique PNG name for ${baseName}`);
}

export async function collectGvsImageAssetBinPaths(stageList: StageListGVS, searchDir: string): Promise<string[]> {
  const entries = await collectGvsImageAssetBinEntries(stageList, searchDir);
  return entries.map((entry) => entry.path);
}

export async function collectGvsImageAssetBinEntries(stageList: StageListGVS, searchDir: string): Promise<GvsIndexedBinEntry[]> {
  if (!searchDir.trim()) {
    throw new Error("Search Directory is required");
  }

  console.log("[GVS_ASSET] collect start", {
    searchDir,
    stageCount: stageList.StageData.length,
    indexedFields: GVS_IMAGE_NAME_FIELDS,
  });

  const unique = new Set<string>();
  for (const stage of stageList.StageData) {
    for (const fieldName of GVS_IMAGE_NAME_FIELDS) {
      const rawValue = stage[fieldName];
      if (typeof rawValue !== "number" || !Number.isFinite(rawValue)) {
        throw new Error(`Invalid numeric value in ${String(fieldName)}`);
      }
      if (rawValue === 0) continue;

      const resolved = await resolveGvsIndexedNameRef(searchDir, rawValue);
      unique.add(resolved.filePath);
    }
  }

  const out = [...unique].sort((a, b) => a.localeCompare(b));
  const entries: GvsIndexedBinEntry[] = [];
  for (const path of out) {
    entries.push({
      path,
      exists: await exists(path),
    });
  }
  console.log("[GVS_ASSET] collect done", {
    uniqueBinCount: out.length,
    existingBinCount: entries.filter((entry) => entry.exists).length,
    missingBinCount: entries.filter((entry) => !entry.exists).length,
    sample: out.slice(0, 10),
  });
  return entries;
}

export async function extractGvsImageAssetsToPng(
  binPaths: string[],
  outputDir: string,
  onProgress: (progress: GvsImageConvertProgress) => void
): Promise<GvsImageConvertResult> {
  if (!outputDir.trim()) {
    throw new Error("Output directory is required");
  }

  const outputExists = await exists(outputDir);
  if (!outputExists) {
    throw new Error("Output directory does not exist");
  }

  console.log("[GVS_ASSET] extract start", {
    outputDir,
    inputBinCount: binPaths.length,
    sampleBins: binPaths.slice(0, 10),
  });

  const tempRoot = await join(outputDir, "_gvs_extract_temp");
  await mkdir(tempRoot, { recursive: true });
  console.log("[GVS_ASSET] temp root ready", { tempRoot });

  const binTotal = binPaths.length;
  console.log("[GVS_ASSET] bin total", { totalBinCount: binTotal });
  onProgress({ current: 0, total: binTotal, currentFile: "Phase 1/2: Extracting nutexb from bin files" });

  const usedOutputNames = new Set<string>();
  const successes: GvsImageConvertSuccess[] = [];
  const failures: GvsImageConvertFailure[] = [];
  let phaseProgress = 0;
  let tempIndex = 0;
  const extractedTempNutexbList: Array<{
    sourceBinPath: string;
    sourceNutexbName: string;
    tempNutexbPath: string;
  }> = [];

  // Phase 1: Extract nutexb from all bins first.
  for (const binPath of binPaths) {
    const baseNameForProgress = await basename(binPath);
    onProgress({
      current: phaseProgress,
      total: binTotal,
      currentFile: `Phase 1/2: Extracting ${baseNameForProgress}`,
    });

    const binExists = await exists(binPath);
    if (!binExists) {
      console.log("[GVS_ASSET] missing bin", { binPath });
      failures.push({
        sourceBinPath: binPath,
        target: binPath,
        reason: "Source bin does not exist",
      });
      phaseProgress += 1;
      onProgress({
        current: phaseProgress,
        total: binTotal,
        currentFile: `Phase 1/2: Done ${baseNameForProgress}`,
      });
      continue;
    }

    const baseName = await basename(binPath);
    const fileNameNoExt = baseName.replace(/\.bin$/i, "");
    const binBuffer = await readFile(binPath);
    const pack = createGvsMapToVs2Package(binBuffer, fileNameNoExt);
    const extractedFiles = pack.flatFiles;
    console.log("[GVS_ASSET] parse bin", {
      binPath,
      baseName,
      extractedFileCount: extractedFiles.length,
    });

    try {
      if (extractedFiles.length !== 1) {
        throw new Error(`Expected exactly 1 extracted file in bin, got ${extractedFiles.length}`);
      }

      const extracted = extractedFiles[0];
      if (!extracted.fileName.toLowerCase().endsWith(".nutexb")) {
        throw new Error(`Extracted file is not nutexb: ${extracted.fileName}`);
      }

      tempIndex += 1;
      const tempNutexbPath = await join(tempRoot, `${tempIndex}.nutexb`);
      await writeFile(tempNutexbPath, extracted.data);
      extractedTempNutexbList.push({
        sourceBinPath: binPath,
        sourceNutexbName: extracted.fileName,
        tempNutexbPath,
      });
      console.log("[GVS_ASSET] extract success", {
        sourceBinPath: binPath,
        nutexbFile: extracted.fileName,
        tempNutexbPath,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown conversion error";
      failures.push({
        sourceBinPath: binPath,
        target: binPath,
        reason,
      });
      console.log("[GVS_ASSET] convert failed", {
        sourceBinPath: binPath,
        reason,
      });
    }

    phaseProgress += 1;
    onProgress({
      current: phaseProgress,
      total: binTotal,
      currentFile: `Phase 1/2: Done ${baseNameForProgress}`,
    });
  }

  console.log("[GVS_ASSET] phase1 done", {
    requestedBins: binTotal,
    extractedNutexbCount: extractedTempNutexbList.length,
    failedBins: failures.length,
  });

  // Phase 2: Convert all extracted nutexb to png.
  const convertTotal = extractedTempNutexbList.length;
  phaseProgress = 0;
  onProgress({ current: 0, total: convertTotal, currentFile: "Phase 2/2: Converting nutexb to PNG" });

  for (const extractedItem of extractedTempNutexbList) {
    phaseProgress += 1;
    onProgress({
      current: phaseProgress - 1,
      total: convertTotal,
      currentFile: `Phase 2/2: Converting ${extractedItem.sourceNutexbName}`,
    });

    try {
      const info = await invoke<NutexbInfo>("nutexb_read_info", { inputPath: extractedItem.tempNutexbPath });
      const safeName = sanitizeFileName(info.name);
      const outputPngPath = await resolveNextOutputPngPath(outputDir, safeName, usedOutputNames);

      await invoke("nutexb_export_png", {
        inputPath: extractedItem.tempNutexbPath,
        outputPath: outputPngPath,
      });
      successes.push({
        sourceBinPath: extractedItem.sourceBinPath,
        internalName: info.name,
        outputPngPath,
      });
      console.log("[GVS_ASSET] convert success", {
        sourceBinPath: extractedItem.sourceBinPath,
        sourceNutexbName: extractedItem.sourceNutexbName,
        internalName: info.name,
        outputPngPath,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown conversion error";
      failures.push({
        sourceBinPath: extractedItem.sourceBinPath,
        target: extractedItem.sourceNutexbName,
        reason,
      });
      console.log("[GVS_ASSET] convert failed", {
        sourceBinPath: extractedItem.sourceBinPath,
        sourceNutexbName: extractedItem.sourceNutexbName,
        reason,
      });
    }

    onProgress({
      current: phaseProgress,
      total: convertTotal,
      currentFile: `Phase 2/2: Done ${extractedItem.sourceNutexbName}`,
    });
  }

  console.log("[GVS_ASSET] extract done", {
    converted: successes.length,
    failed: failures.length,
    extractedNutexbCount: extractedTempNutexbList.length,
  });

  return {
    converted: successes.length,
    failed: failures.length,
    successes,
    failures,
  };
}
