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
}

/**
 * Collect all textures that should be included when saving the stage.
 * The caller (save pipeline) uses this manifest to:
 * 1. Keep existing nutexb entries in their original positions
 * 2. Append new (added) entries to the stage_image_list section
 * 3. Convert any sourceImagePath (png/dds) to nutexb before packing
 */
export function collectTextureSaveManifest(): TextureSaveManifest {
  const entries = useSceneTextureManagerStore.getState().entries;
  const existing: TextureSaveManifest["existing"] = [];
  const added: TextureSaveManifest["added"] = [];

  for (const entry of entries) {
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

  return { existing, added };
}
