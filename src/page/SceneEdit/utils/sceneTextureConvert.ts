import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { copyFile, exists, mkdir } from "@tauri-apps/plugin-fs";
import { appLocalDataDir, dirname, join } from "@tauri-apps/api/path";
import type { DdsFormat } from "@/lib/ddsFormats";

/** Mirrors Rust sanitize_file_name for __convert PNG export paths. */
function sanitizeFileName(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "texture";
  return trimmed.replace(/[\\/:*?"<>|]/g, "_");
}

export interface TextureConvertResult {
  outputNutexbPath: string;
  previewPngPath: string;
  nutexbName: string;
}

export function ddsFormatToRust(format: DdsFormat): string {
  return format;
}

export async function convertPngToNutexb(params: {
  pngPath: string;
  outputNutexbPath: string;
  ddsFormat: DdsFormat;
}): Promise<TextureConvertResult> {
  const localData = await appLocalDataDir();
  const convertDir = `${localData}/scene_texture_convert`;

  if (!(await exists(convertDir))) {
    await mkdir(convertDir, { recursive: true });
  }

  return invoke<TextureConvertResult>("card_icon_replace_from_png_with_dds_format", {
    nutexbPath: params.outputNutexbPath,
    convertDir,
    pngPath: params.pngPath,
    ddsFormat: ddsFormatToRust(params.ddsFormat),
  });
}

export async function convertImageToNutexb(params: {
  sourcePath: string;
  ddsFormat: DdsFormat;
}): Promise<TextureConvertResult> {
  const localData = await appLocalDataDir();
  const convertDir = `${localData}/scene_texture_convert`;
  const filename = params.sourcePath.split(/[/\\]/).pop() ?? "texture";
  const nutexbFilename = filename.replace(/\.[^.]+$/, ".nutexb");
  const outputNutexbPath = `${convertDir}/${nutexbFilename}`;

  if (!(await exists(convertDir))) {
    await mkdir(convertDir, { recursive: true });
  }

  return invoke<TextureConvertResult>("card_icon_replace_from_png_with_dds_format", {
    nutexbPath: outputNutexbPath,
    convertDir,
    pngPath: params.sourcePath,
    ddsFormat: ddsFormatToRust(params.ddsFormat),
  });
}

export async function reencodeNutexbWithFormat(params: {
  nutexbPath: string;
  ddsFormat: DdsFormat;
  sourceImagePath?: string | null;
}): Promise<TextureConvertResult> {
  const localData = await appLocalDataDir();
  const convertDir = `${localData}/scene_texture_convert`;
  if (!(await exists(convertDir))) {
    await mkdir(convertDir, { recursive: true });
  }

  const pngPath =
    params.sourceImagePath?.trim() ||
    (await exportNutexbPreviewPng(params.nutexbPath, convertDir));

  return invoke<TextureConvertResult>("card_icon_replace_from_png_with_dds_format", {
    nutexbPath: params.nutexbPath,
    convertDir,
    pngPath,
    ddsFormat: ddsFormatToRust(params.ddsFormat),
  });
}

export async function replaceNutexbInPlace(params: {
  sourcePath: string;
  targetNutexbPath: string;
  ddsFormat: DdsFormat;
}): Promise<TextureConvertResult | null> {
  if (params.sourcePath.toLowerCase().endsWith(".nutexb")) {
    await copyFile(params.sourcePath, params.targetNutexbPath);
    return null;
  }

  return convertPngToNutexb({
    pngPath: params.sourcePath,
    outputNutexbPath: params.targetNutexbPath,
    ddsFormat: params.ddsFormat,
  });
}

async function exportNutexbPreviewPng(
  nutexbPath: string,
  convertDir: string,
): Promise<string> {
  const info = await invoke<{ name: string }>("nutexb_read_info", {
    inputPath: nutexbPath,
  });
  const safeName = sanitizeFileName(info.name);
  const outputPath = await join(convertDir, "__convert", `${safeName}.png`);
  const outputDir = await dirname(outputPath);
  if (!(await exists(outputDir))) {
    await mkdir(outputDir, { recursive: true });
  }
  await invoke("nutexb_export_png", { inputPath: nutexbPath, outputPath });
  return outputPath;
}

function defaultPngExportName(nutexbPath: string): string {
  const filename = nutexbPath.split(/[/\\]/).pop() ?? "texture.nutexb";
  return filename.replace(/\.nutexb$/i, ".png");
}

export async function exportNutexbToPng(params: {
  nutexbPath: string;
  suggestedFilename?: string;
}): Promise<string | null> {
  const suggested =
    params.suggestedFilename?.trim() ||
    defaultPngExportName(params.nutexbPath);

  const outputPath = await save({
    title: "Export nutexb to PNG",
    defaultPath: suggested,
    filters: [{ name: "PNG", extensions: ["png"] }],
  });

  if (typeof outputPath !== "string" || !outputPath.trim()) {
    return null;
  }

  await invoke("nutexb_export_png", {
    inputPath: params.nutexbPath,
    outputPath: outputPath.trim(),
  });

  return outputPath.trim();
}

export async function importPngAsNutexb(params: {
  outputDir: string;
  textureName: string;
  ddsFormat: DdsFormat;
}): Promise<TextureConvertResult | null> {
  const selected = await open({
    title: "Select texture image",
    multiple: false,
    filters: [{ name: "Images", extensions: ["png", "dds", "tga"] }],
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
