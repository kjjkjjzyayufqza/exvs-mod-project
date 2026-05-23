import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { exists, mkdir } from "@tauri-apps/plugin-fs";
import { appLocalDataDir } from "@tauri-apps/api/path";
import type { DdsFormat } from "../components/TextureFormatSelect";

export interface TextureConvertResult {
  outputNutexbPath: string;
  previewPngPath: string;
  nutexbName: string;
}

/**
 * Convert a PNG file to nutexb using the Rust backend.
 * Uses `card_icon_replace_from_png_with_dds_format` which handles:
 *   PNG → DDS (with specified format) → nutexb file
 */
export async function convertPngToNutexb(params: {
  pngPath: string;
  outputNutexbPath: string;
  ddsFormat: DdsFormat;
}): Promise<TextureConvertResult> {
  // Use a temp convert dir for intermediate DDS files
  const localData = await appLocalDataDir();
  const convertDir = `${localData}/scene_texture_convert`;

  if (!(await exists(convertDir))) {
    await mkdir(convertDir, { recursive: true });
  }

  return invoke<TextureConvertResult>("card_icon_replace_from_png_with_dds_format", {
    nutexbPath: params.outputNutexbPath,
    convertDir,
    pngPath: params.pngPath,
    ddsFormat: params.ddsFormat,
  });
}

/**
 * Open file picker for PNG, convert to nutexb at target path.
 * Returns null if user cancels.
 */
export async function importPngAsNutexb(params: {
  outputDir: string;
  textureName: string;
  ddsFormat: DdsFormat;
}): Promise<TextureConvertResult | null> {
  const selected = await open({
    title: "Select PNG texture",
    multiple: false,
    filters: [{ name: "PNG Image", extensions: ["png"] }],
  });

  if (typeof selected !== "string" || !selected.trim()) return null;

  if (!(await exists(params.outputDir))) {
    await mkdir(params.outputDir, { recursive: true });
  }

  const outputNutexbPath = `${params.outputDir}/${params.textureName}.nutexb`;

  return convertPngToNutexb({
    pngPath: selected.trim(),
    outputNutexbPath,
    ddsFormat: params.ddsFormat,
  });
}
