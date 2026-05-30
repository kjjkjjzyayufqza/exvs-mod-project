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
  createImportedDaeMaterialProfile,
  createImportedDaePlacementRow,
} from "./sceneDaeSsbhSave";
import {
  resolveStagePackStructureTarget,
} from "./sceneStageStructure";
import { buildDeletePreview, executeDelete, executeBaseDelete } from "./sceneDeleteConfirm";
import {
  sceneSaveAsFolder,
  sceneImportDae,
  sceneConfigureImport,
  sceneExecuteImport,
  type ImportConfig,
} from "./sceneSessionService";
import {
  resolveSessionImportConfigForSave,
  retargetAndReconvertSessionImport,
} from "./sceneDaeSessionImport";
import { serializeDaeToBytes } from "./daeExportImport";
import { DEFAULT_HKT_SIMPLIFY } from "./hktSimplifyUtils";
import { resolveOrCreateInfoFolder } from "./sceneInfoFolder";
import { ensureSkyPlacementObjectNumber } from "./ensureSkyPlacementObjectNumber";
import { remapPlacementObjectNumbers } from "./remapPlacementObjectNumbers";

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

function buildPreviewOnlySaveImportConfig(plan: DaeConversionPlan): ImportConfig {
  const materialProfile = createImportedDaeMaterialProfile();
  return {
    loadToScene: false,
    convertToSsbh: true,
    generateHkt: false,
    ssbhConfig: {
      baseFilename: plan.baseFilename,
      scaleFactor: 1,
      upAxis: "y_up",
      writeNumdlb: true,
      writeNumshb: true,
      writeNusktb: true,
      writeNumatb: true,
      writeJnttbl: true,
      writeMayaProfile: true,
      materialTemplate: null,
      mayaFile: materialProfile,
      nustFile: materialProfile,
    },
    hktSimplify: DEFAULT_HKT_SIMPLIFY,
  };
}

async function convertSingleDaeViaSession(
  plan: DaeConversionPlan,
  sessionId: string,
): Promise<DaeConversionOutcome> {
  try {
    if (plan.object.sessionImportId) {
      const importConfig = await resolveSessionImportConfigForSave(
        sessionId,
        plan.object.sessionImportId,
        plan.folderName,
      );
      await retargetAndReconvertSessionImport(
        sessionId,
        plan.object.sessionImportId,
        importConfig,
        plan.folderName,
      );
      return {
        status: "ok",
        result: { folderName: plan.folderName, transform: plan.object.transform },
      };
    }

    const previewImportConfig = buildPreviewOnlySaveImportConfig(plan);
    const exportObject = createBakedImportedDaeExportObject(plan.object, {
      includeActorTransform: false,
    });
    const daeBytes = serializeDaeToBytes(exportObject);
    const importId = await sceneImportDae(sessionId, daeBytes, plan.baseFilename);
    await sceneConfigureImport(sessionId, importId, previewImportConfig);
    await sceneExecuteImport(sessionId, importId);
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
  subModels: ReadonlyArray<{ folderName: string; objectIndex: number }>;
  importedDaeObjects: readonly ImportedDaeObject[];
  sceneSessionId: string | null;
  onProgress: (step: SaveStepInfo) => void;
  onDeleteConfirm: (preview: DeleteConfirmation) => Promise<boolean>;
  skipStructureRebuild?: boolean;
};

export type SaveFolderResult = {
  success: boolean;
  convertedCount: number;
  failedCount: number;
  failedNames: string[];
  convertedDaeObjectIds: string[];
  deletedCount: number;
  migratedTextures: number;
  reloadedBundle: StageBundleResponse | null;
  hasStructuralChanges: boolean;
};

function emitStep(
  onProgress: (step: SaveStepInfo) => void,
  id: string,
  label: string,
  status: SaveStepInfo["status"],
  detail?: string,
  error?: string,
): void {
  const tag = "[SaveFolder]";
  if (status === "running") {
    console.log(`${tag} [${id}] ${label}`);
  } else if (status === "done") {
    console.log(`${tag} [${id}] done${detail ? ` — ${detail}` : ""}`);
  } else if (status === "error") {
    console.error(`${tag} [${id}] ERROR: ${error ?? "unknown"}`);
  }
  onProgress({ id, label, status, detail, error });
}

export async function executeSaveFolderPipeline(params: SaveFolderParams): Promise<SaveFolderResult> {
  const {
    stageRoot,
    dirtyStore,
    graphicParams,
    placementHeader,
    placementEntries,
    subModels,
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
  let convertedDaeObjectIds: string[] = [];
  let reloadedBundle: StageBundleResponse | null = null;

  // Phase 1: Delete
  const deletedObjects = dirtyStore.getDeletedObjects();
  if (deletedObjects.length > 0) {
    emitStep(onProgress, "delete", "Checking for deletions...", "running");
    const hasBase = deletedObjects.includes("base");
    const folderDeletions = deletedObjects.filter((name) => name !== "base");

    if (folderDeletions.length > 0) {
      const preview = await buildDeletePreview(stageRoot, folderDeletions);
      const confirmed = await onDeleteConfirm(preview);
      if (!confirmed) {
        emitStep(onProgress, "delete", "Checking for deletions...", "error", undefined, "Delete cancelled by user");
        return {
          success: false,
          convertedCount: 0,
          failedCount: 0,
          failedNames: [],
          convertedDaeObjectIds: [],
          deletedCount: 0,
          migratedTextures: 0,
          reloadedBundle: null,
          hasStructuralChanges: false,
        };
      }
      await executeDelete(stageRoot, folderDeletions);
    }
    if (hasBase) {
      await executeBaseDelete(stageRoot);
    }
    deletedCount = deletedObjects.length;
    emitStep(onProgress, "delete", "Checking for deletions...", "done", `${deletedCount} deleted`);
  } else {
    emitStep(onProgress, "delete", "Checking for deletions...", "done", "None");
  }

  // Phase 2: Convert new objects (DAE → SSBH)
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
        const outcome = await convertSingleDaeViaSession(plan, sceneSessionId ?? "");
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
    convertedDaeObjectIds = daeObjectsToConvert
      .filter((obj) => !failedNames.includes(obj.name))
      .map((obj) => obj.id);

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
    const infoFolder = await resolveOrCreateInfoFolder(stageRoot);
    const gpCsv = graphicParams.map((p) => p.key === "" && p.value === "" ? "" : `${p.key},${p.value}`).join("\r\n") + "\r\n";
    await writeTextFile(`${infoFolder}/graphic_param.csv`, gpCsv);

    let placementRowsToSave: readonly PlacementRow[] = placementEntries;
    let effectiveSubModels: ReadonlyArray<{ folderName: string; objectIndex: number }> = subModels;

    if (convertedCount > 0 || deletedCount > 0) {
      const bundleAfterChanges = await invoke<StageBundleResponse>("load_stage_bundle", { stageRoot });
      effectiveSubModels = bundleAfterChanges.subModels;

      placementRowsToSave = remapPlacementObjectNumbers(
        placementRowsToSave,
        subModels,
        bundleAfterChanges.subModels,
      );

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
        placementRowsToSave = [...placementRowsToSave, ...newPlacementRows];
      }
    }

    const modelFolderCount = effectiveSubModels.filter(
      (s) => s.folderName.toLowerCase() !== "sky",
    ).length;
    placementRowsToSave = ensureSkyPlacementObjectNumber(
      [...placementRowsToSave],
      modelFolderCount,
    );

    if (placementHeader.length > 0 && placementRowsToSave.length > 0) {
      const headerLine = placementHeader.join(",");
      const dataLines = placementRowsToSave.map((e) => e.rawFields.join(","));
      const placementCsv = [headerLine, ...dataLines].join("\r\n") + "\r\n";
      await writeTextFile(`${infoFolder}/placement.csv`, placementCsv);
    } else if (placementRowsToSave.length > 0) {
      const placementCsv = placementRowsToSave.map((e) => e.rawFields.join(",")).join("\r\n") + "\r\n";
      await writeTextFile(`${infoFolder}/placement.csv`, placementCsv);
    }

    if (sceneSessionId) {
      await sceneSaveAsFolder(sceneSessionId, stageRoot);
    }

    emitStep(onProgress, "csv", "Writing CSV files...", "done");
  } catch (err) {
    emitStep(onProgress, "csv", "Writing CSV files...", "error", undefined, err instanceof Error ? err.message : String(err));
  }

  // Phase 8: Consolidate textures into a single shared textures/ folder.
  // The folder layout keeps one shared textures/ (no per-model texture subdirs);
  // per-model subdirs are only restored when repacking to .fhm2d, which runs
  // redistribute_stage_textures in sceneSaveFhm2dPipeline (skipStructureRebuild).
  if (!params.skipStructureRebuild) {
    emitStep(onProgress, "migrate", "Consolidating textures to shared folder...", "running");
    try {
      const packTarget = resolveStagePackStructureTarget(stageRoot);
      const restoreResult = await invoke<{ texturesCollected: number; subdirsRemoved: number; warnings: string[] }>(
        "restore_shared_textures",
        { stageRoot: packTarget.packRoot },
      );
      migratedTextures = restoreResult.texturesCollected;
      emitStep(onProgress, "migrate", "Consolidating textures to shared folder...", "done", `${restoreResult.texturesCollected} textures, ${restoreResult.subdirsRemoved} subdirs cleaned`);
    } catch (err) {
      emitStep(onProgress, "migrate", "Consolidating textures to shared folder...", "error", undefined, err instanceof Error ? err.message : String(err));
    }
  }

  // Phase 9: Rebuild structure JSON referencing the shared textures/ layout.
  // (Skipped when saving as FHM2D — that pipeline redistributes to per-model
  // subdirs and rebuilds the structure JSON forced for the packable layout.)
  if (!params.skipStructureRebuild) {
    emitStep(onProgress, "structure", "Rebuilding structure JSON...", "running");
    try {
      const packTarget = resolveStagePackStructureTarget(stageRoot);
      await invoke("rebuild_stage_structure_json_with_shared_textures", { stageRoot: packTarget.packRoot });
      emitStep(onProgress, "structure", "Rebuilding structure JSON...", "done");
    } catch (err) {
      emitStep(onProgress, "structure", "Rebuilding structure JSON...", "error", undefined, err instanceof Error ? err.message : String(err));
    }
  }

  // Phase 10: Reload (only when structural changes happened)
  const hasStructuralChanges = convertedCount > 0 || deletedCount > 0;
  if (hasStructuralChanges) {
    try {
      reloadedBundle = await invoke<StageBundleResponse>("load_stage_bundle", { stageRoot });
    } catch {
      // non-critical — UI can continue without reload
    }
  }

  return {
    success: true,
    convertedCount,
    failedCount,
    failedNames,
    convertedDaeObjectIds,
    deletedCount,
    migratedTextures,
    reloadedBundle,
    hasStructuralChanges,
  };
}
