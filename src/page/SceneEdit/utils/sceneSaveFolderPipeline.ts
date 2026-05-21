import { readDir, writeTextFile } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";

import type { PlacementRow } from "../types/placement";
import type { ImportedDaeObject } from "../components/MapViewport";
import type { SaveStepInfo } from "../components/SaveProgressDialog";
import type { SceneDirtyStore } from "../store/sceneDirtyStore";
import type { DeleteConfirmation } from "./sceneDeleteConfirm";
import type {
  StageBundleResponse,
  DaeConversionPlan,
  DaeConversionOutcome,
} from "./sceneSavePipeline";
import {
  createBakedImportedDaeExportObject,
} from "./sceneSavePipeline";
import {
  buildImportedDaeStageRegistrationPlan,
  buildImportedDaeSsbhConvertParams,
  createImportedDaeJnttblBytes,
  createImportedDaePlacementRow,
} from "./sceneDaeSsbhSave";
import {
  buildStageStructureJsonFromFiles,
  resolveStagePackStructureTarget,
  type StagePackFileEntry,
} from "./sceneStageStructure";
import { buildDeletePreview, executeDelete } from "./sceneDeleteConfirm";
import { detectOldTextureFormat, migrateTexturesToSharedFolder } from "./sceneTextureMigration";
import { sceneSaveAsFolder } from "./sceneSessionService";
import { ssbhAnalyzeDae, ssbhConvertDaeToSsbh } from "@/page/TestEditor/components/ssbh-model-preview/ssbhDaeIoService";
import { writeObjectAsDAE } from "./daeExportImport";
import { mkdir, writeFile } from "@tauri-apps/plugin-fs";

function joinTauriPath(...parts: string[]): string {
  return parts
    .map((part, index) => {
      const trimmed = part.trim();
      if (index === 0) return trimmed.replace(/[\/\\]+$/g, "");
      return trimmed.replace(/^[\/\\]+|[\/\\]+$/g, "");
    })
    .filter(Boolean)
    .join("/");
}

function fileExtension(name: string): string {
  const index = name.lastIndexOf(".");
  return index >= 0 ? name.slice(index).toLowerCase() : "";
}

async function collectStagePackFiles(root: string, relativeDir = ""): Promise<StagePackFileEntry[]> {
  const dirPath = relativeDir ? joinTauriPath(root, relativeDir) : root;
  const entries = await readDir(dirPath);
  const collected: StagePackFileEntry[] = [];
  for (const entry of entries) {
    const relativePath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
    if (entry.isDirectory) {
      collected.push(...(await collectStagePackFiles(root, relativePath)));
    } else if (entry.isFile) {
      collected.push({ relativePath, fileType: fileExtension(entry.name) });
    }
  }
  return collected.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

async function writeStagePackStructureJson(
  root: string,
): Promise<{ structurePath: string; packRoot: string }> {
  const target = resolveStagePackStructureTarget(root);
  const files = await collectStagePackFiles(target.packRoot);
  const structureJson = buildStageStructureJsonFromFiles({
    packFolderName: target.packFolderName,
    files,
  });
  await writeTextFile(target.structurePath, JSON.stringify(structureJson, null, 2));
  return { structurePath: target.structurePath, packRoot: target.packRoot };
}

function allocateAllFolderPlans(
  stageRoot: string,
  objects: readonly ImportedDaeObject[],
  existingFolderNames: string[],
): DaeConversionPlan[] {
  const names = [...existingFolderNames];
  return objects.map((object) => {
    const plan = buildImportedDaeStageRegistrationPlan({
      stageRoot,
      objectName: object.name,
      existingFolderNames: names,
    });
    names.push(plan.folderName);
    return {
      object,
      folderName: plan.folderName,
      baseFilename: plan.baseFilename,
      outputDir: plan.outputDir,
    };
  });
}

async function convertSingleDae(plan: DaeConversionPlan): Promise<DaeConversionOutcome> {
  try {
    await mkdir(plan.outputDir, { recursive: true });
    const transformedDaePath = `${plan.outputDir}/${plan.baseFilename}.dae`;
    const exportObject = createBakedImportedDaeExportObject(plan.object, {
      includeActorTransform: false,
    });
    await writeObjectAsDAE(exportObject, transformedDaePath);
    const analysis = await ssbhAnalyzeDae(transformedDaePath);
    if (!analysis.canConvert) {
      return {
        status: "error",
        objectName: plan.object.name,
        error: `Cannot convert: ${analysis.blockingErrors.join("; ")}`,
      };
    }
    const convertParams = buildImportedDaeSsbhConvertParams({
      stageRoot: plan.outputDir.replace(/\/[^/]+$/, ""),
      objectName: plan.baseFilename,
      geometryNames: analysis.geometryNames,
      scaleFactor: 1,
      upAxis: "y_up",
    });
    const convertResult = await ssbhConvertDaeToSsbh({
      daePath: transformedDaePath,
      ...convertParams,
    });
    await writeFile(
      `${plan.outputDir}/${plan.baseFilename}.jnttbl`,
      createImportedDaeJnttblBytes(convertResult.stats.bones),
    );
    return {
      status: "ok",
      result: { folderName: plan.folderName, transform: plan.object.transform },
    };
  } catch (err) {
    return {
      status: "error",
      objectName: plan.object.name,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export type SaveFolderParams = {
  stageRoot: string;
  dirtyStore: SceneDirtyStore;
  graphicParams: Array<{ key: string; value: string }>;
  placementHeader: readonly string[];
  placementEntries: readonly PlacementRow[];
  importedDaeObjects: readonly ImportedDaeObject[];
  sceneSessionId: string | null;
  onProgress: (step: SaveStepInfo) => void;
  onDeleteConfirm: (preview: DeleteConfirmation) => Promise<boolean>;
};

export type SaveFolderResult = {
  success: boolean;
  convertedCount: number;
  failedCount: number;
  failedNames: string[];
  deletedCount: number;
  migratedTextures: number;
  reloadedBundle: StageBundleResponse | null;
};

function emitStep(
  onProgress: (step: SaveStepInfo) => void,
  id: string,
  label: string,
  status: SaveStepInfo["status"],
  detail?: string,
  error?: string,
): void {
  onProgress({ id, label, status, detail, error });
}

export async function executeSaveFolderPipeline(params: SaveFolderParams): Promise<SaveFolderResult> {
  const {
    stageRoot,
    dirtyStore,
    graphicParams,
    placementHeader,
    placementEntries,
    importedDaeObjects,
    sceneSessionId,
    onProgress,
    onDeleteConfirm,
  } = params;

  let deletedCount = 0;
  let migratedTextures = 0;
  let convertedCount = 0;
  let failedCount = 0;
  let failedNames: string[] = [];
  let reloadedBundle: StageBundleResponse | null = null;

  // Phase 1: Delete
  const deletedObjects = dirtyStore.getDeletedObjects();
  if (deletedObjects.length > 0) {
    emitStep(onProgress, "delete", "Checking for deletions...", "running");
    const preview = await buildDeletePreview(stageRoot, deletedObjects);
    const confirmed = await onDeleteConfirm(preview);
    if (!confirmed) {
      emitStep(onProgress, "delete", "Checking for deletions...", "error", undefined, "Delete cancelled by user");
      return {
        success: false,
        convertedCount: 0,
        failedCount: 0,
        failedNames: [],
        deletedCount: 0,
        migratedTextures: 0,
        reloadedBundle: null,
      };
    }
    await executeDelete(stageRoot, deletedObjects);
    deletedCount = deletedObjects.length;
    emitStep(onProgress, "delete", "Checking for deletions...", "done", `${deletedCount} deleted`);
  } else {
    emitStep(onProgress, "delete", "Checking for deletions...", "done", "None");
  }

  // Phase 2: Texture migration
  emitStep(onProgress, "migrate", "Migrating textures...", "running");
  try {
    const isOldFormat = await detectOldTextureFormat(stageRoot);
    if (isOldFormat) {
      const migResult = await migrateTexturesToSharedFolder(stageRoot);
      migratedTextures = migResult.migratedCount;
      emitStep(onProgress, "migrate", "Migrating textures...", "done", `${migratedTextures} migrated`);
    } else {
      emitStep(onProgress, "migrate", "Migrating textures...", "done", "Not needed");
    }
  } catch (err) {
    emitStep(onProgress, "migrate", "Migrating textures...", "error", undefined, err instanceof Error ? err.message : String(err));
  }

  // Phase 3: Convert new objects (DAE → SSBH)
  const addedObjects = dirtyStore.getAddedObjects();
  const daeObjectsToConvert = importedDaeObjects.filter((obj) =>
    addedObjects.includes(obj.name),
  );
  if (daeObjectsToConvert.length > 0) {
    emitStep(onProgress, "convert", `Converting new objects (0/${daeObjectsToConvert.length})...`, "running");
    const rootEntries = await readDir(stageRoot);
    const existingFolderNames = rootEntries
      .filter((e) => e.isDirectory)
      .map((e) => e.name);
    const plans = allocateAllFolderPlans(stageRoot, daeObjectsToConvert, existingFolderNames);

    let completed = 0;
    const outcomes = await Promise.all(
      plans.map(async (plan) => {
        const outcome = await convertSingleDae(plan);
        completed++;
        emitStep(onProgress, "convert", `Converting new objects (${completed}/${plans.length})...`, "running");
        return outcome;
      }),
    );

    const okResults = outcomes.filter(
      (o): o is Extract<DaeConversionOutcome, { status: "ok" }> => o.status === "ok",
    );
    const errorResults = outcomes.filter(
      (o): o is Extract<DaeConversionOutcome, { status: "error" }> => o.status === "error",
    );
    convertedCount = okResults.length;
    failedCount = errorResults.length;
    failedNames = errorResults.map((o) => o.objectName);

    emitStep(
      onProgress,
      "convert",
      `Converting new objects (${plans.length}/${plans.length})...`,
      failedCount > 0 ? "error" : "done",
      `${convertedCount} ok, ${failedCount} failed`,
      failedCount > 0 ? `Failed: ${failedNames.join(", ")}` : undefined,
    );
  } else {
    emitStep(onProgress, "convert", "Converting new objects...", "done", "None");
  }

  // Phase 4: Write materials (placeholder — material editing not yet implemented)
  emitStep(onProgress, "materials", "Writing materials...", "done", "Skipped");

  // Phase 5: Write textures (placeholder — texture editing not yet fully implemented)
  emitStep(onProgress, "textures", "Writing textures...", "done", "Skipped");

  // Phase 6: Write HKT files (session-based HKT is handled by sceneSaveAsFolder IPC)
  emitStep(onProgress, "hkt", "Writing HKT files...", "done", "Via session");

  // Phase 7: Write CSV files
  emitStep(onProgress, "csv", "Writing CSV files...", "running");
  try {
    const gpCsv = graphicParams.map((p) => `${p.key},${p.value}`).join("\n");
    await writeTextFile(`${stageRoot}/info/graphic_param.csv`, gpCsv);

    let placementRowsToSave: readonly PlacementRow[] = placementEntries;

    if (convertedCount > 0 || deletedCount > 0) {
      const bundleAfterChanges = await invoke<StageBundleResponse>("load_stage_bundle", { stageRoot });

      if (convertedCount > 0) {
        const newPlacementRows = daeObjectsToConvert
          .map((obj) => {
            const subModel = bundleAfterChanges.subModels.find((sm) =>
              sm.folderName.toLowerCase().includes(obj.name.replace(/\s+/g, "_").toLowerCase()),
            );
            if (!subModel) return null;
            return createImportedDaePlacementRow({
              objectIndex: subModel.objectIndex,
              placementHeader: placementHeader.length > 0 ? placementHeader : undefined,
              transform: obj.transform,
            });
          })
          .filter((r): r is PlacementRow => r !== null);
        placementRowsToSave = [...placementEntries, ...newPlacementRows];
      }

      if (deletedCount > 0) {
        const survivingFolders = new Set(bundleAfterChanges.subModels.map((sm) => sm.folderName));
        placementRowsToSave = placementRowsToSave.filter((row) => {
          if (row.vdkType !== "OBJECT") return true;
          if (row.objectNumber === null) return true;
          const matchingModel = bundleAfterChanges.subModels.find(
            (sm) => sm.objectIndex === row.objectNumber,
          );
          return matchingModel !== undefined && survivingFolders.has(matchingModel.folderName);
        });
      }
    }

    if (placementHeader.length > 0 && placementRowsToSave.length > 0) {
      const headerLine = placementHeader.join(",");
      const dataLines = placementRowsToSave.map((e) => e.rawFields.join(","));
      const placementCsv = [headerLine, ...dataLines].join("\n");
      await writeTextFile(`${stageRoot}/info/placement.csv`, placementCsv);
    } else if (placementRowsToSave.length > 0) {
      const placementCsv = placementRowsToSave.map((e) => e.rawFields.join(",")).join("\n");
      await writeTextFile(`${stageRoot}/info/placement.csv`, placementCsv);
    }

    if (sceneSessionId) {
      await sceneSaveAsFolder(sceneSessionId, stageRoot);
    }

    emitStep(onProgress, "csv", "Writing CSV files...", "done");
  } catch (err) {
    emitStep(onProgress, "csv", "Writing CSV files...", "error", undefined, err instanceof Error ? err.message : String(err));
  }

  // Phase 8: Rebuild structure JSON
  emitStep(onProgress, "structure", "Rebuilding structure JSON...", "running");
  try {
    await writeStagePackStructureJson(stageRoot);
    emitStep(onProgress, "structure", "Rebuilding structure JSON...", "done");
  } catch (err) {
    emitStep(onProgress, "structure", "Rebuilding structure JSON...", "error", undefined, err instanceof Error ? err.message : String(err));
  }

  // Phase 9: Reload
  try {
    reloadedBundle = await invoke<StageBundleResponse>("load_stage_bundle", { stageRoot });
  } catch {
    // non-critical — UI can continue without reload
  }

  return {
    success: true,
    convertedCount,
    failedCount,
    failedNames,
    deletedCount,
    migratedTextures,
    reloadedBundle,
  };
}
