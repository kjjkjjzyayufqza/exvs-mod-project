import { mkdir, readDir, writeFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import * as THREE from "three";

import type { TransformData } from "../components/StagePropertyEditor";
import type { ImportedDaeObject } from "../components/MapViewport";
import type { PlacementRow } from "../types/placement";

import {
  ssbhAnalyzeDae,
  ssbhConvertDaeToSsbh,
} from "@/page/TestEditor/components/ssbh-model-preview/ssbhDaeIoService";
import { writeObjectAsDAE } from "../utils/daeExportImport";
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
import { repackFolderUsingStructure } from "@/utils/repackRunner";
import { resolveOrCreateInfoFolder } from "./sceneInfoFolder";

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

function applyTransformDataToObject(object: THREE.Object3D, transform: TransformData): void {
  object.position.set(transform.posX, transform.posY, transform.posZ);
  object.rotation.set(
    (transform.rotX * Math.PI) / 180,
    (transform.rotY * Math.PI) / 180,
    (transform.rotZ * Math.PI) / 180,
  );
  object.scale.set(transform.scaleX, transform.scaleY, transform.scaleZ);
}

export function createBakedImportedDaeExportObject(
  object: ImportedDaeObject,
  options: { includeActorTransform: boolean },
): THREE.Group {
  const staged = new THREE.Group();
  staged.name = object.name;
  staged.add(object.scene.clone(true));
  if (options.includeActorTransform) {
    applyTransformDataToObject(staged, object.transform);
  }
  staged.updateMatrixWorld(true);

  const baked = new THREE.Group();
  baked.name = object.name;
  let meshCount = 0;

  staged.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    if (child instanceof THREE.SkinnedMesh) {
      throw new Error(
        `Imported DAE '${object.name}' contains skinned meshes; SceneEdit SSBH save currently supports rigid imported DAE meshes`,
      );
    }
    const sourceGeometry = child.geometry;
    if (!sourceGeometry) return;
    const geometry = sourceGeometry.clone();
    geometry.applyMatrix4(child.matrixWorld);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, child.material);
    mesh.name = child.name || `${object.name}_${meshCount}`;
    mesh.geometry.name = sourceGeometry.name || mesh.name;
    baked.add(mesh);
    meshCount += 1;
  });

  if (meshCount === 0) {
    throw new Error(`Imported DAE '${object.name}' has no exportable meshes`);
  }

  return baked;
}

// --- Stage pack file collection ---

async function collectStagePackFiles(root: string, relativeDir = ""): Promise<StagePackFileEntry[]> {
  const dirPath = relativeDir ? joinTauriPath(root, relativeDir) : root;
  const entries = await readDir(dirPath);
  const collected: StagePackFileEntry[] = [];

  for (const entry of entries) {
    const relativePath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
    if (entry.isDirectory) {
      collected.push(...(await collectStagePackFiles(root, relativePath)));
    } else if (entry.isFile) {
      collected.push({
        relativePath,
        fileType: fileExtension(entry.name),
      });
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
  return {
    structurePath: target.structurePath,
    packRoot: target.packRoot,
  };
}

// --- Parallel DAE conversion ---

export type DaeConversionPlan = {
  object: ImportedDaeObject;
  folderName: string;
  baseFilename: string;
  outputDir: string;
};

export type DaeConversionResult = {
  folderName: string;
  transform: TransformData;
};

export type DaeConversionOutcome =
  | { status: "ok"; result: DaeConversionResult }
  | { status: "error"; objectName: string; error: string };

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
      result: {
        folderName: plan.folderName,
        transform: plan.object.transform,
      },
    };
  } catch (err) {
    return {
      status: "error",
      objectName: plan.object.name,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// --- Public save pipeline ---

export type StageSaveProgress = {
  phase: "converting" | "placement" | "repack" | "reload";
  current: number;
  total: number;
  objectName?: string;
};

export interface StageBundleResponse {
  rootPath: string;
  baseModel: unknown;
  subModels: Array<{
    folderName: string;
    objectIndex: number;
    bundle: unknown;
  }>;
  graphicParams: Array<{ key: string; value: string }>;
  placementHeader: string[];
  placementEntries: Array<{
    vdkType: string;
    objectNumber: number | null;
    posX: number;
    posY: number;
    posZ: number;
    rotX: number;
    rotY: number;
    rotZ: number;
    scaleX: number;
    scaleY: number;
    scaleZ: number;
    rawFields: string[];
  }>;
  warnings: string[];
}

export type StageSaveResult = {
  convertedCount: number;
  failedCount: number;
  failedNames: string[];
  reloadedBundle: StageBundleResponse | null;
};

/** @deprecated Use {@link executeSaveFolderPipeline} from sceneSaveFolderPipeline.ts instead. */
export async function executeStageSave(params: {
  stageRoot: string;
  graphicParams: Array<{ key: string; value: string }>;
  placementHeader: readonly string[];
  placementEntries: readonly PlacementRow[];
  importedDaeObjects: readonly ImportedDaeObject[];
  onProgress?: (progress: StageSaveProgress) => void;
}): Promise<StageSaveResult> {
  const {
    stageRoot,
    graphicParams,
    placementHeader,
    placementEntries,
    importedDaeObjects,
    onProgress,
  } = params;

  let convertedResults: DaeConversionResult[] = [];
  let failedNames: string[] = [];

  // Phase 1: parallel DAE → SSBH conversion
  if (importedDaeObjects.length > 0) {
    const rootEntries = await readDir(stageRoot);
    const existingFolderNames = rootEntries
      .filter((entry) => entry.isDirectory)
      .map((entry) => entry.name);

    const plans = allocateAllFolderPlans(stageRoot, importedDaeObjects, existingFolderNames);

    let completed = 0;
    const outcomes = await Promise.all(
      plans.map(async (plan) => {
        onProgress?.({
          phase: "converting",
          current: completed,
          total: plans.length,
          objectName: plan.object.name,
        });
        const outcome = await convertSingleDae(plan);
        completed += 1;
        onProgress?.({
          phase: "converting",
          current: completed,
          total: plans.length,
          objectName: plan.object.name,
        });
        return outcome;
      }),
    );

    convertedResults = outcomes
      .filter((o): o is Extract<DaeConversionOutcome, { status: "ok" }> => o.status === "ok")
      .map((o) => o.result);
    failedNames = outcomes
      .filter((o): o is Extract<DaeConversionOutcome, { status: "error" }> => o.status === "error")
      .map((o) => o.objectName);
  }

  // Phase 2: generate placement rows for successfully converted objects
  onProgress?.({ phase: "placement", current: 0, total: 1 });

  let placementRowsToSave: readonly PlacementRow[] = placementEntries;
  let reloadedBundle: StageBundleResponse | null = null;

  if (convertedResults.length > 0) {
    const bundleWithConvertedModels = await invoke<StageBundleResponse>("load_stage_bundle", {
      stageRoot,
    });

    const generatedPlacementRows = convertedResults.map((converted) => {
      const subModel = bundleWithConvertedModels.subModels.find(
        (entry) => entry.folderName === converted.folderName,
      );
      if (!subModel) {
        throw new Error(
          `Converted imported DAE folder '${converted.folderName}' was not loaded as a stage object`,
        );
      }
      return createImportedDaePlacementRow({
        objectIndex: subModel.objectIndex,
        placementHeader: placementHeader.length > 0 ? placementHeader : undefined,
        transform: converted.transform,
      });
    });

    placementRowsToSave = [...placementEntries, ...generatedPlacementRows];
  }

  onProgress?.({ phase: "placement", current: 1, total: 1 });

  // Phase 3: write CSV files
  const infoFolder = await resolveOrCreateInfoFolder(stageRoot);
  const gpCsv = graphicParams.map((p) => `${p.key},${p.value}`).join("\r\n") + "\r\n";
  await writeTextFile(`${infoFolder}/graphic_param.csv`, gpCsv);

  if (placementHeader.length > 0 && placementRowsToSave.length > 0) {
    const headerLine = placementHeader.join(",");
    const dataLines = placementRowsToSave.map((e) => e.rawFields.join(","));
    const placementCsv = [headerLine, ...dataLines].join("\r\n") + "\r\n";
    await writeTextFile(`${infoFolder}/placement.csv`, placementCsv);
  } else if (placementRowsToSave.length > 0) {
    const placementCsv = placementRowsToSave.map((e) => e.rawFields.join(",")).join("\r\n") + "\r\n";
    await writeTextFile(`${infoFolder}/placement.csv`, placementCsv);
  }

  // Phase 4: repack + reload
  if (convertedResults.length > 0) {
    onProgress?.({ phase: "repack", current: 0, total: 1 });
    const repackTarget = await writeStagePackStructureJson(stageRoot);
    await repackFolderUsingStructure({
      structurePath: repackTarget.structurePath,
      inputFolderPath: repackTarget.packRoot,
    });
    onProgress?.({ phase: "repack", current: 1, total: 1 });

    onProgress?.({ phase: "reload", current: 0, total: 1 });
    reloadedBundle = await invoke<StageBundleResponse>("load_stage_bundle", { stageRoot });
    onProgress?.({ phase: "reload", current: 1, total: 1 });
  }

  return {
    convertedCount: convertedResults.length,
    failedCount: failedNames.length,
    failedNames,
    reloadedBundle,
  };
}
