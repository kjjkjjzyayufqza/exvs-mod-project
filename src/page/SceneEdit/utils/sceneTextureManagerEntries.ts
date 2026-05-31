import { exists, readDir } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import type { SsbhModelPreviewBundle } from "@/components/ssbh-model-preview/types";
import type { TextureManagerEntry } from "../store/sceneTextureManagerStore";

function createExistingTextureEntry(
  filename: string,
  nutexbPath: string,
  referencedBy: string[],
): TextureManagerEntry {
  const key = filename.toLowerCase();
  return {
    id: `existing_${key}`,
    filename,
    status: "existing",
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
    const key = filename.toLowerCase();
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
    const key = filename.toLowerCase();
    if (seen.has(key)) continue;
    seen.set(key, createExistingTextureEntry(filename, path, []));
  }

  return Array.from(seen.values());
}

export async function listStageTextureFilePaths(stageRoot: string): Promise<string[]> {
  if (/^[a-z]+:\/\//i.test(stageRoot)) {
    return [];
  }

  const texturesDir = await join(stageRoot, "textures");
  if (!(await exists(texturesDir))) {
    return [];
  }

  const entries = await readDir(texturesDir);
  const nutexbPaths = await Promise.all(
    entries
      .filter((entry) => !entry.isDirectory && /\.nutexb$/i.test(entry.name))
      .map((entry) => join(texturesDir, entry.name)),
  );

  return nutexbPaths.sort((a, b) =>
    filenameFromPath(a).localeCompare(filenameFromPath(b), undefined, {
      sensitivity: "base",
    }),
  );
}
