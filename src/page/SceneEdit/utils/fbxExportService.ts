import * as THREE from "three";
import { FBXExporter } from "@comfyorg/fbx-exporter-three";
import { invoke } from "@tauri-apps/api/core";
import { copyFile, writeFile } from "@tauri-apps/plugin-fs";

export type ModelExportUpAxis = "y_up" | "z_up";

interface ExportedTextureRef {
  sourcePath: string;
  relativePath: string;
}

export interface FbxTextureNameState {
  usedNames: Set<string>;
  sourceToRelative: Map<string, string>;
}

const TEXTURE_SLOT_KEYS = [
  "map",
  "normalMap",
  "emissiveMap",
  "aoMap",
  "alphaMap",
  "specularMap",
  "bumpMap",
  "displacementMap",
  "envMap",
] as const;

function sanitizeExportName(value: string): string {
  const cleaned = value.trim().replace(/[\\/:*?"<>|]/g, "_");
  return cleaned || "export";
}

function normalizePathKey(value: string): string {
  return value.trim().replace(/\\/g, "/").toLowerCase();
}

function fileStem(value: string): string {
  const name = value.replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? value;
  const idx = name.lastIndexOf(".");
  return idx > 0 ? name.slice(0, idx) : name;
}

function fileExtension(value: string): string {
  const name = value.replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? value;
  const idx = name.lastIndexOf(".");
  return idx >= 0 ? name.slice(idx + 1).toLowerCase() : "";
}

function nextUniqueExportName(baseName: string, usedNames: Set<string>): string {
  let candidate = sanitizeExportName(baseName);
  if (!usedNames.has(candidate.toLowerCase())) {
    usedNames.add(candidate.toLowerCase());
    return candidate;
  }
  const extIdx = candidate.lastIndexOf(".");
  const stem = extIdx > 0 ? candidate.slice(0, extIdx) : candidate;
  const ext = extIdx > 0 ? candidate.slice(extIdx) : "";
  let index = 1;
  do {
    candidate = `${stem}_${index}${ext}`;
    index += 1;
  } while (usedNames.has(candidate.toLowerCase()));
  usedNames.add(candidate.toLowerCase());
  return candidate;
}

function materialArray(material: THREE.Material | THREE.Material[] | undefined): THREE.Material[] {
  if (!material) return [];
  return Array.isArray(material) ? material : [material];
}

function materialMap(material: THREE.Material | null): THREE.Texture | null {
  const candidate = material as (THREE.Material & { map?: THREE.Texture | null }) | null;
  return candidate?.map ?? null;
}

function textureSourcePath(texture: THREE.Texture | null): string | null {
  const data = texture?.userData as { sceneTexturePath?: unknown; sourcePath?: unknown } | undefined;
  const value = typeof data?.sceneTexturePath === "string"
    ? data.sceneTexturePath
    : typeof data?.sourcePath === "string"
      ? data.sourcePath
      : null;
  return value?.trim() || null;
}

async function exportTextureReference(
  sourcePath: string,
  outputDir: string,
  state: FbxTextureNameState,
): Promise<ExportedTextureRef> {
  const sourceKey = normalizePathKey(sourcePath);
  const cached = state.sourceToRelative.get(sourceKey);
  if (cached) return { sourcePath, relativePath: cached };

  const ext = fileExtension(sourcePath);
  const relativePath = nextUniqueExportName(
    ext === "nutexb" ? `${fileStem(sourcePath)}.png` : (sourcePath.replace(/\\/g, "/").split("/").pop() ?? "texture"),
    state.usedNames,
  );
  const outputPath = `${outputDir.replace(/[/\\]+$/, "")}/${relativePath}`;
  if (ext === "nutexb") {
    await invoke("nutexb_export_png", { inputPath: sourcePath, outputPath });
  } else {
    await copyFile(sourcePath, outputPath);
  }
  state.sourceToRelative.set(sourceKey, relativePath);
  return { sourcePath, relativePath };
}

function resolveFbxExportPreset(upAxis: ModelExportUpAxis): "threejs" | "unreal" {
  return upAxis === "z_up" ? "unreal" : "threejs";
}

function stripMaterialTextures(object: THREE.Object3D): void {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const material of materialArray(mesh.material)) {
      const typed = material as THREE.Material & Record<string, THREE.Texture | null | undefined>;
      for (const slot of TEXTURE_SLOT_KEYS) {
        if (slot in typed) {
          typed[slot] = null;
        }
      }
    }
  });
}

async function prepareTexturesForFbxExport(
  object: THREE.Object3D,
  outputDir: string,
  textureState: FbxTextureNameState,
): Promise<void> {
  const texturePromises = new Map<THREE.Texture, Promise<string | null>>();

  const resolveRelativePath = async (texture: THREE.Texture): Promise<string | null> => {
    let promise = texturePromises.get(texture);
    if (!promise) {
      promise = (async () => {
        const sourcePath = textureSourcePath(texture);
        if (!sourcePath) return null;
        const ref = await exportTextureReference(sourcePath, outputDir, textureState);
        return ref.relativePath;
      })();
      texturePromises.set(texture, promise);
    }
    return promise;
  };

  const textures = new Set<THREE.Texture>();
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const material of materialArray(mesh.material)) {
      const map = materialMap(material);
      if (map) textures.add(map);
    }
  });

  await Promise.all([...textures].map(async (texture) => {
    const relativePath = await resolveRelativePath(texture);
    if (!relativePath) return;
    (texture.userData as Record<string, unknown>).fbxExportRelativePath = relativePath;
  }));
}

function disposeClonedExportRoot(exportRoot: THREE.Object3D): void {
  exportRoot.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose?.();
    for (const material of materialArray(mesh.material)) {
      material.dispose?.();
    }
  });
}

export async function buildFbxExportBytes(
  object: THREE.Object3D,
  options?: {
    outputDir?: string;
    exportTextures?: boolean;
    upAxis?: ModelExportUpAxis;
    textureState?: FbxTextureNameState;
  },
): Promise<Uint8Array> {
  const exportTextures = options?.exportTextures ?? false;
  const upAxis = options?.upAxis ?? "y_up";
  const outputDir = options?.outputDir ?? "";
  const textureState = options?.textureState ?? {
    usedNames: new Set<string>(),
    sourceToRelative: new Map<string, string>(),
  };

  object.updateMatrixWorld(true);
  const exportRoot = object.clone(true);

  if (exportTextures && outputDir.trim().length > 0) {
    await prepareTexturesForFbxExport(exportRoot, outputDir, textureState);
  } else if (!exportTextures) {
    stripMaterialTextures(exportRoot);
  }

  const exporter = new FBXExporter();
  if (exportTextures) {
    exporter.register((sceneData) => {
      const textureEntries = sceneData.textures?.textures as
        | Map<THREE.Texture, { fileName?: string; texture?: THREE.Texture }>
        | undefined;
      if (!textureEntries) return;
      for (const [, entry] of textureEntries) {
        const relativePath = (entry.texture?.userData as { fbxExportRelativePath?: unknown })
          .fbxExportRelativePath;
        if (typeof relativePath === "string" && relativePath.length > 0) {
          entry.fileName = relativePath;
        }
      }
    });
  }

  try {
    const bytes = await exporter.parseAsync(exportRoot, {
      preset: resolveFbxExportPreset(upAxis),
      embedTextures: false,
      includeAnimations: false,
      creator: "EXVS2 Model Editor",
    });
    if (bytes.byteLength === 0) {
      throw new Error("FBX export found no mesh geometry");
    }
    return bytes;
  } finally {
    disposeClonedExportRoot(exportRoot);
  }
}

export async function buildFbxExportContent(
  object: THREE.Object3D,
  options?: {
    outputDir?: string;
    exportTextures?: boolean;
    upAxis?: ModelExportUpAxis;
    textureState?: FbxTextureNameState;
  },
): Promise<Uint8Array> {
  return buildFbxExportBytes(object, options);
}

export async function writeObjectAsFBX(
  object: THREE.Object3D,
  filePath: string,
  options?: {
    outputDir?: string;
    exportTextures?: boolean;
    upAxis?: ModelExportUpAxis;
    textureState?: FbxTextureNameState;
  },
): Promise<string> {
  const outputDir = options?.outputDir ?? filePath.replace(/[/\\][^/\\]*$/, "");
  const textureState = options?.textureState ?? {
    usedNames: new Set<string>(),
    sourceToRelative: new Map<string, string>(),
  };
  const bytes = await buildFbxExportBytes(object, {
    outputDir,
    exportTextures: options?.exportTextures ?? false,
    upAxis: options?.upAxis ?? "y_up",
    textureState,
  });
  await writeFile(filePath, bytes);
  return filePath;
}

export { sanitizeExportName };
