import * as THREE from "three";
import { ColladaLoader } from "three-stdlib";
import { ColladaExporter } from "three-stdlib";
import { FBXLoader } from "three-stdlib";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { copyFile, readFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { toast } from "sonner";
import {
  getStoredDialogDefaultPath,
  rememberStoredDialogSelection,
} from "@/utils/dialogDefaultPathStore";
import {
  SCENE_EXPORT_DAE_FILE_DIALOG_PATH_KEY,
  SCENE_EXPORT_DAE_FOLDER_DIALOG_PATH_KEY,
  SCENE_IMPORT_DAE_QUICK_DIALOG_PATH_KEY,
} from "./sceneEditorSettings";
import {
  buildFbxExportContent,
  sanitizeExportName,
  writeObjectAsFBX,
  type FbxTextureNameState,
  type ModelExportUpAxis,
} from "./fbxExportService";

export { buildFbxExportContent, writeObjectAsFBX } from "./fbxExportService";

export interface DAEImportResult {
  fileName: string;
  filePath: string;
  scene: THREE.Group;
  blobUrl: string;
  boundingSize: THREE.Vector3;
}

export async function loadDAEFromPath(
  filePath: string,
  scaleFactor = 1,
): Promise<DAEImportResult> {
  const loader = new ColladaLoader();
  const content = await readFile(filePath);
  const text = new TextDecoder().decode(content);
  const blob = new Blob([text], { type: "application/xml" });
  const blobUrl = URL.createObjectURL(blob);

  const collada = await new Promise<any>((resolve, reject) => {
    loader.load(blobUrl, resolve, undefined, reject);
  });

  const fileName = filePath.split(/[/\\]/).pop() ?? "model.dae";

  // Bake the SSBH import scale into the preview scene root so the rendered mesh
  // matches the scaled numshb geometry and HKT collision the backend produces from
  // the same scale factor. buildImportedDaeDisplayRoot bakes this root scale into the
  // display geometry, so the viewport, the converted model, and the collision stay aligned.
  if (Number.isFinite(scaleFactor) && scaleFactor > 0 && scaleFactor !== 1) {
    collada.scene.scale.multiplyScalar(scaleFactor);
    collada.scene.updateMatrixWorld(true);
  }

  const bbox = new THREE.Box3().setFromObject(collada.scene);
  const size = new THREE.Vector3();
  bbox.getSize(size);
  if (!size.x || !Number.isFinite(size.x)) size.x = 1;
  if (!size.y || !Number.isFinite(size.y)) size.y = 1;
  if (!size.z || !Number.isFinite(size.z)) size.z = 1;

  return {
    fileName,
    filePath,
    scene: collada.scene,
    blobUrl,
    boundingSize: size,
  };
}

export async function loadStaticMeshFromPath(
  filePath: string,
  scaleFactor = 1,
): Promise<DAEImportResult> {
  if (!filePath.toLowerCase().endsWith(".fbx")) {
    return loadDAEFromPath(filePath, scaleFactor);
  }

  const loader = new FBXLoader();
  const content = await readFile(filePath);
  const blob = new Blob([content], { type: "application/octet-stream" });
  const blobUrl = URL.createObjectURL(blob);
  const scene = await new Promise<THREE.Group>((resolve, reject) => {
    loader.load(blobUrl, (object) => resolve(object as THREE.Group), undefined, reject);
  });

  const fileName = filePath.split(/[/\\]/).pop() ?? "model.fbx";
  if (Number.isFinite(scaleFactor) && scaleFactor > 0 && scaleFactor !== 1) {
    scene.scale.multiplyScalar(scaleFactor);
    scene.updateMatrixWorld(true);
  }

  const bbox = new THREE.Box3().setFromObject(scene);
  const size = new THREE.Vector3();
  bbox.getSize(size);
  if (!size.x || !Number.isFinite(size.x)) size.x = 1;
  if (!size.y || !Number.isFinite(size.y)) size.y = 1;
  if (!size.z || !Number.isFinite(size.z)) size.z = 1;

  return {
    fileName,
    filePath,
    scene,
    blobUrl,
    boundingSize: size,
  };
}

export async function loadDAEFromPaths(filePaths: string[]): Promise<DAEImportResult[]> {
  const results: DAEImportResult[] = [];
  for (const filePath of filePaths) {
    results.push(await loadStaticMeshFromPath(filePath));
  }
  return results;
}

export async function importDAEFiles(multiple = false): Promise<DAEImportResult[]> {
  const selected = await open({
    multiple,
    filters: [{ name: "Collada DAE", extensions: ["dae"] }],
    defaultPath: await getStoredDialogDefaultPath(SCENE_IMPORT_DAE_QUICK_DIALOG_PATH_KEY),
  });

  if (!selected) return [];

  const paths = Array.isArray(selected) ? selected : [selected];
  const lastPath = paths[paths.length - 1];
  if (lastPath) {
    await rememberStoredDialogSelection(SCENE_IMPORT_DAE_QUICK_DIALOG_PATH_KEY, lastPath, "file");
  }

  return loadDAEFromPaths(paths);
}

function parseDAE(exporter: InstanceType<typeof ColladaExporter>, object: THREE.Object3D): string {
  let callbackResult = "";
  const returned = exporter.parse(object, (res) => {
    callbackResult = res.data;
  }, {});
  const data = returned?.data ?? callbackResult;
  if (!data) {
    throw new Error("ColladaExporter produced empty output — object may lack exportable geometry");
  }
  return data;
}

export function serializeObjectAsDAE(object: THREE.Object3D): string {
  const exporter = new ColladaExporter();
  return parseDAE(exporter, object);
}

export function serializeDaeToBytes(object: THREE.Object3D): number[] {
  const content = serializeObjectAsDAE(object);
  return Array.from(new TextEncoder().encode(content));
}

export async function writeObjectAsDAE(
  object: THREE.Object3D,
  filePath: string,
): Promise<string> {
  const content = serializeObjectAsDAE(object);
  await writeTextFile(filePath, content);
  return filePath;
}

export async function exportObjectAsDAE(
  object: THREE.Object3D,
  defaultName = "export",
): Promise<string | null> {
  const storedDir = await getStoredDialogDefaultPath(SCENE_EXPORT_DAE_FILE_DIALOG_PATH_KEY);
  const defaultPath = storedDir
    ? `${storedDir.replace(/[/\\]+$/, "")}\\${defaultName}.dae`
    : `${defaultName}.dae`;
  const filePath = await save({
    filters: [{ name: "Collada DAE", extensions: ["dae"] }],
    defaultPath,
  });
  if (!filePath) return null;
  await rememberStoredDialogSelection(SCENE_EXPORT_DAE_FILE_DIALOG_PATH_KEY, filePath, "file");

  const exporter = new ColladaExporter();
  const content = parseDAE(exporter, object);
  await writeTextFile(filePath, content);
  toast.success(`Exported: ${filePath.split(/[/\\]/).pop()}`);
  return filePath;
}

export async function exportMultipleObjectsAsDAE(
  objects: Array<{ object: THREE.Object3D; name: string }>,
): Promise<string[]> {
  const outputDir = await open({
    directory: true,
    title: "Select output folder for DAE export",
    defaultPath: await getStoredDialogDefaultPath(SCENE_EXPORT_DAE_FOLDER_DIALOG_PATH_KEY),
  });
  if (!outputDir) return [];
  await rememberStoredDialogSelection(SCENE_EXPORT_DAE_FOLDER_DIALOG_PATH_KEY, outputDir, "directory");

  const exporter = new ColladaExporter();
  const exported: string[] = [];

  for (const { object, name } of objects) {
    const content = parseDAE(exporter, object);
    const filePath = `${outputDir}/${name}.dae`;
    await writeTextFile(filePath, content);
    exported.push(filePath);
  }

  toast.success(`Exported ${exported.length} DAE files`);
  return exported;
}

export async function exportObjectsAsDAEToDirectory(
  objects: Array<{ object: THREE.Object3D; name: string }>,
  outputDir: string,
): Promise<string[]> {
  const exporter = new ColladaExporter();
  const exported: string[] = [];

  for (const { object, name } of objects) {
    const content = parseDAE(exporter, object);
    const safeName = sanitizeExportName(name);
    const filePath = `${outputDir.replace(/[/\\]+$/, "")}/${safeName}.dae`;
    await writeTextFile(filePath, content);
    exported.push(filePath);
  }

  return exported;
}

export async function exportObjectsAsFBXToDirectory(
  objects: Array<{ object: THREE.Object3D; name: string }>,
  outputDir: string,
  options?: {
    exportTextures?: boolean;
    upAxis?: ModelExportUpAxis;
  },
): Promise<string[]> {
  const exported: string[] = [];
  const textureState: FbxTextureNameState = {
    usedNames: new Set<string>(),
    sourceToRelative: new Map<string, string>(),
  };

  for (const { object, name } of objects) {
    const safeName = sanitizeExportName(name);
    const filePath = `${outputDir.replace(/[/\\]+$/, "")}/${safeName}.fbx`;
    await writeObjectAsFBX(object, filePath, {
      outputDir,
      exportTextures: options?.exportTextures ?? false,
      upAxis: options?.upAxis ?? "y_up",
      textureState,
    });
    exported.push(filePath);
  }

  return exported;
}

// ── Rust-backed SSBH → DAE export (high performance) ──────────────────────

export interface BatchDaeExportEntry {
  rootPath: string;
  outputName: string;
}

export interface BatchDaeExportedFile {
  name: string;
  path: string;
  meshCount: number;
  vertexCount: number;
}

export interface BatchDaeExportResult {
  exported: BatchDaeExportedFile[];
  errors: string[];
  totalExported: number;
  totalFailed: number;
}

export async function batchExportStageDae(
  entries: BatchDaeExportEntry[],
  options?: {
    scaleFactor?: number;
    upAxis?: string;
    exportTextures?: boolean;
  },
): Promise<BatchDaeExportResult | null> {
  const outputDir = await open({
    directory: true,
    title: "Select output folder for batch DAE export",
    defaultPath: await getStoredDialogDefaultPath(SCENE_EXPORT_DAE_FOLDER_DIALOG_PATH_KEY),
  });
  if (!outputDir) return null;
  await rememberStoredDialogSelection(SCENE_EXPORT_DAE_FOLDER_DIALOG_PATH_KEY, outputDir, "directory");

  return exportStageDaeBatchToDirectory(entries, outputDir, options);
}

export async function exportStageDaeBatchToDirectory(
  entries: BatchDaeExportEntry[],
  outputDir: string,
  options?: {
    scaleFactor?: number;
    upAxis?: string;
    exportTextures?: boolean;
  },
): Promise<BatchDaeExportResult> {
  const result = await invoke<BatchDaeExportResult>("stage_batch_export_dae", {
    outputDir,
    entries,
    scaleFactor: options?.scaleFactor ?? 1.0,
    upAxis: options?.upAxis ?? "y_up",
    exportTextures: options?.exportTextures ?? false,
  });

  if (result.totalFailed > 0) {
    toast.warning(
      `Exported ${result.totalExported}, failed ${result.totalFailed}`,
      { description: result.errors.slice(0, 3).join("\n") },
    );
  } else {
    toast.success(`Exported ${result.totalExported} DAE files`);
  }
  return result;
}

export async function exportSingleStageDae(
  rootPath: string,
  options?: {
    scaleFactor?: number;
    upAxis?: string;
    exportTextures?: boolean;
  },
): Promise<{ path: string; meshCount: number; vertexCount: number } | null> {
  const baseName = rootPath.split(/[/\\]/).pop() ?? "export";
  const storedDir = await getStoredDialogDefaultPath(SCENE_EXPORT_DAE_FILE_DIALOG_PATH_KEY);
  const defaultPath = storedDir
    ? `${storedDir.replace(/[/\\]+$/, "")}\\${baseName}.dae`
    : `${baseName}.dae`;
  const outputPath = await save({
    filters: [{ name: "Collada DAE", extensions: ["dae"] }],
    defaultPath,
  });
  if (!outputPath) return null;
  await rememberStoredDialogSelection(SCENE_EXPORT_DAE_FILE_DIALOG_PATH_KEY, outputPath, "file");

  const result = await invoke<{ path: string; meshCount: number; vertexCount: number }>(
    "stage_export_single_dae",
    {
      rootPath,
      outputPath,
      scaleFactor: options?.scaleFactor ?? 1.0,
      upAxis: options?.upAxis ?? "y_up",
      exportTextures: options?.exportTextures ?? false,
    },
  );

  toast.success(`Exported: ${result.path.split(/[/\\]/).pop()}`);
  return result;
}
