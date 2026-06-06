import { exists, readDir } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import type { SsbhModelPreviewBundle } from "@/components/ssbh-model-preview/types";
import type {
  InfoTextureCategory,
  TextureEntryScope,
  TextureManagerEntry,
} from "../store/sceneTextureManagerStore";

const INFO_TEXTURE_CATEGORIES: InfoTextureCategory[] = [
  "fog",
  "light",
  "post_effect",
];

export interface StageTextureFilePathInventory {
  modelTexturePaths: string[];
  infoTexturePaths: Array<{
    path: string;
    category: InfoTextureCategory;
  }>;
}

function createExistingTextureEntry(
  filename: string,
  nutexbPath: string,
  referencedBy: string[],
  scope: TextureEntryScope = "model",
  infoCategory: InfoTextureCategory | null = null,
): TextureManagerEntry {
  const key = `${scope}_${infoCategory ?? "shared"}_${nutexbPath.toLowerCase()}`;
  return {
    id: `existing_${key}`,
    filename,
    status: "existing",
    scope,
    infoCategory,
    format: "unknown",
    width: 0,
    height: 0,
    sizeBytes: 0,
    referencedBy,
    thumbnailDataUrl: null,
    nutexbPath,
    sourceImagePath: null,
  };
}

function filenameFromPath(path: string): string {
  return path.split(/[/\\]/).pop() ?? path;
}

function processReferencedBundleTextures(
  seen: Map<string, TextureManagerEntry>,
  bundle: SsbhModelPreviewBundle,
  objectLabel: string,
): void {
  const pathToName = new Map<string, string>();
  for (const tr of bundle.textureResolve ?? []) {
    if (!tr.nutexbPath) continue;
    const ref = tr.reference?.trim().replace(/\\/g, "/").split("/").pop() ?? "";
    const name = ref ? (ref.toLowerCase().endsWith(".nutexb") ? ref : `${ref}.nutexb`) : "";
    if (name) {
      pathToName.set(tr.nutexbPath, name);
    }
  }

  for (const path of bundle.resolvedNutexbPaths) {
    const filename = pathToName.get(path) ?? filenameFromPath(path);
    const key = `model:${filename.toLowerCase()}`;
    const existing = seen.get(key);
    if (existing) {
      if (!existing.referencedBy.includes(objectLabel)) {
        existing.referencedBy.push(objectLabel);
      }
      continue;
    }
    seen.set(key, createExistingTextureEntry(filename, path, [objectLabel]));
  }
}

export function collectSceneTextureManagerEntries(
  baseModel: SsbhModelPreviewBundle | null,
  subModels: Array<{ folderName: string; bundle: SsbhModelPreviewBundle }>,
  sharedTexturePaths: string[] = [],
  infoTexturePaths: StageTextureFilePathInventory["infoTexturePaths"] = [],
): TextureManagerEntry[] {
  const seen = new Map<string, TextureManagerEntry>();

  if (baseModel) {
    processReferencedBundleTextures(seen, baseModel, "base");
  }
  for (const sub of subModels) {
    processReferencedBundleTextures(seen, sub.bundle, sub.folderName);
  }

  for (const path of sharedTexturePaths) {
    const filename = filenameFromPath(path);
    const key = `model:${filename.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.set(key, createExistingTextureEntry(filename, path, []));
  }

  for (const { path, category } of infoTexturePaths) {
    const filename = filenameFromPath(path);
    const key = `info:${category}:${path.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.set(key, createExistingTextureEntry(filename, path, [], "info", category));
  }

  return Array.from(seen.values());
}

async function listNutexbFilesInDir(dir: string): Promise<string[]> {
  if (!(await exists(dir))) {
    return [];
  }

  const entries = await readDir(dir);
  const files: string[] = [];

  for (const entry of entries) {
    const childPath = await join(dir, entry.name);
    if (entry.isDirectory) {
      files.push(...(await listNutexbFilesInDir(childPath)));
    } else if (/\.nutexb$/i.test(entry.name)) {
      files.push(childPath);
    }
  }

  return files;
}

export async function listStageTextureFilePaths(
  stageRoot: string,
): Promise<StageTextureFilePathInventory> {
  if (/^[a-z]+:\/\//i.test(stageRoot)) {
    return { modelTexturePaths: [], infoTexturePaths: [] };
  }

  const texturesDir = await join(stageRoot, "textures");
  const modelTexturePaths = await listNutexbFilesInDir(texturesDir);
  const infoTexturePaths: StageTextureFilePathInventory["infoTexturePaths"] = [];

  for (const category of INFO_TEXTURE_CATEGORIES) {
    const infoDir = await join(stageRoot, "info", category);
    const paths = await listNutexbFilesInDir(infoDir);
    for (const path of paths) {
      infoTexturePaths.push({ path, category });
    }
  }

  modelTexturePaths.sort((a, b) =>
    filenameFromPath(a).localeCompare(filenameFromPath(b), undefined, {
      sensitivity: "base",
    }),
  );
  infoTexturePaths.sort((a, b) => {
    const categoryOrder =
      INFO_TEXTURE_CATEGORIES.indexOf(a.category) -
      INFO_TEXTURE_CATEGORIES.indexOf(b.category);
    if (categoryOrder !== 0) return categoryOrder;
    return filenameFromPath(a.path).localeCompare(filenameFromPath(b.path), undefined, {
      sensitivity: "base",
    });
  });

  return { modelTexturePaths, infoTexturePaths };
}
