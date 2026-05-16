import * as THREE from "three";
import { ColladaLoader } from "three-stdlib";
import { ColladaExporter } from "three-stdlib";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { toast } from "sonner";

export interface DAEImportResult {
  fileName: string;
  filePath: string;
  scene: THREE.Group;
  blobUrl: string;
}

export async function importDAEFiles(multiple = false): Promise<DAEImportResult[]> {
  const selected = await open({
    multiple,
    filters: [{ name: "Collada DAE", extensions: ["dae"] }],
  });

  if (!selected) return [];

  const paths = Array.isArray(selected) ? selected : [selected];
  const results: DAEImportResult[] = [];
  const loader = new ColladaLoader();

  for (const filePath of paths) {
    const content = await readFile(filePath);
    const text = new TextDecoder().decode(content);
    const blob = new Blob([text], { type: "application/xml" });
    const blobUrl = URL.createObjectURL(blob);

    const collada = await new Promise<any>((resolve, reject) => {
      loader.load(blobUrl, resolve, undefined, reject);
    });

    const fileName = filePath.split(/[/\\]/).pop() ?? "model.dae";
    results.push({
      fileName,
      filePath,
      scene: collada.scene,
      blobUrl,
    });
  }

  return results;
}

function parseDAE(exporter: InstanceType<typeof ColladaExporter>, object: THREE.Object3D): string {
  let result = "";
  exporter.parse(object, (res) => {
    result = res.data;
  }, {});
  return result;
}

export async function exportObjectAsDAE(
  object: THREE.Object3D,
  defaultName = "export",
): Promise<string | null> {
  const filePath = await save({
    filters: [{ name: "Collada DAE", extensions: ["dae"] }],
    defaultPath: `${defaultName}.dae`,
  });
  if (!filePath) return null;

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
  });
  if (!outputDir) return [];

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
  });
  if (!outputDir) return null;

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
  const outputPath = await save({
    filters: [{ name: "Collada DAE", extensions: ["dae"] }],
    defaultPath: `${rootPath.split(/[/\\]/).pop() ?? "export"}.dae`,
  });
  if (!outputPath) return null;

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
