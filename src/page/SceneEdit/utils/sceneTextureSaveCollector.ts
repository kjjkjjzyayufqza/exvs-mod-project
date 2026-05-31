/**
 * Texture Save Collector — Integration point between the Texture Manager store
 * and the stage save pipeline (sceneSaveFolderPipeline / sceneSaveFhm2dPipeline).
 *
 * The save pipeline calls collectTextureSaveManifest() to obtain a manifest of
 * all textures that should be included when reassembling stage_image_list.
 * The manifest is then passed to a Rust command for fhm2d packing.
 */
import { useSceneTextureManagerStore } from "../store/sceneTextureManagerStore";

export interface TextureSaveManifest {
  existing: Array<{ filename: string; nutexbPath: string }>;
  added: Array<{ filename: string; nutexbPath: string | null; sourceImagePath: string | null }>;
  removed: Array<{ filename: string; nutexbPath: string | null }>;
}

/**
 * Collect all textures that should be included when saving the stage.
 * The caller (save pipeline) uses this manifest to:
 * 1. Keep existing nutexb entries in their original positions
 * 2. Append new (added) entries to the stage_image_list section
 * 3. Convert any sourceImagePath (png/dds) to nutexb before packing
 * 4. Delete removed existing nutexb files from the shared textures/ folder
 */
export function collectTextureSaveManifest(): TextureSaveManifest {
  const state = useSceneTextureManagerStore.getState();
  const existing: TextureSaveManifest["existing"] = [];
  const added: TextureSaveManifest["added"] = [];

  for (const entry of state.entries) {
    if (entry.status === "existing" && entry.nutexbPath) {
      existing.push({ filename: entry.filename, nutexbPath: entry.nutexbPath });
    } else if (entry.status === "added") {
      added.push({
        filename: entry.filename,
        nutexbPath: entry.nutexbPath,
        sourceImagePath: entry.sourceImagePath,
      });
    }
  }

  const removed: TextureSaveManifest["removed"] = state.removedExisting.map((r) => ({
    filename: r.filename,
    nutexbPath: r.nutexbPath,
  }));

  return { existing, added, removed };
}

/** True when the manifest carries texture changes that require disk writes. */
export function manifestHasTextureChanges(manifest: TextureSaveManifest): boolean {
  return manifest.added.length > 0 || manifest.removed.length > 0;
}
