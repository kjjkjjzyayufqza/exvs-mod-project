import type { NutexbRgbaData } from "@/page/TestEditor/components/ssbh-model-preview/nutexbPreviewCache";
import type { NutexbTextureData, NutexbTextureDataMap } from "../hooks/useSceneTextureLoader";
import { normalizeTexturePathKey } from "./sceneTextureInventory";
import {
  decodeSceneNutexbRgba,
  type SceneTextureDecodeContext,
} from "./sceneTextureDecode";

const THUMB_MAX_DIM = 64;
const PREVIEW_MAX_DIM = 512;

const thumbnailCache = new Map<string, string>();
const previewCache = new Map<string, string>();
const inflightThumbnails = new Map<string, Promise<string | null>>();

export function clearSceneTextureThumbnailCache(): void {
  thumbnailCache.clear();
  previewCache.clear();
  inflightThumbnails.clear();
}

export function lookupSceneTextureData(
  textureDataMap: NutexbTextureDataMap,
  path: string,
): NutexbTextureData | null {
  return (
    textureDataMap.get(path) ??
    textureDataMap.get(normalizeTexturePathKey(path)) ??
    null
  );
}

export function extractRgbaFromTextureData(
  data: NutexbTextureData | null,
): NutexbRgbaData | null {
  if (!data) return null;
  if (data.kind === "rgba") {
    return { width: data.width, height: data.height, rgba: data.rgba };
  }
  if (data.kind === "compressed" && data.formatId === 0) {
    return { width: data.width, height: data.height, rgba: data.data };
  }
  return null;
}

export function rgbaToPngDataUrl(
  width: number,
  height: number,
  rgba: Uint8Array,
  maxDim: number,
): string {
  const scale = Math.min(1, maxDim / Math.max(width, height, 1));
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));

  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = width;
  sourceCanvas.height = height;
  const sourceCtx = sourceCanvas.getContext("2d");
  if (!sourceCtx) return "";

  const clamped = new Uint8ClampedArray(rgba);
  sourceCtx.putImageData(new ImageData(clamped, width, height), 0, 0);

  if (targetWidth === width && targetHeight === height) {
    return sourceCanvas.toDataURL("image/png");
  }

  const targetCanvas = document.createElement("canvas");
  targetCanvas.width = targetWidth;
  targetCanvas.height = targetHeight;
  const targetCtx = targetCanvas.getContext("2d");
  if (!targetCtx) return sourceCanvas.toDataURL("image/png");
  targetCtx.drawImage(sourceCanvas, 0, 0, targetWidth, targetHeight);
  return targetCanvas.toDataURL("image/png");
}

function cacheKeyForPath(path: string, maxDim: number): string {
  return `${normalizeTexturePathKey(path)}@${maxDim}`;
}

export function tryCacheThumbnailFromMap(
  path: string,
  textureDataMap: NutexbTextureDataMap,
): string | null {
  const key = cacheKeyForPath(path, THUMB_MAX_DIM);
  const cached = thumbnailCache.get(key);
  if (cached) return cached;

  const rgba = extractRgbaFromTextureData(lookupSceneTextureData(textureDataMap, path));
  if (!rgba) return null;

  const dataUrl = rgbaToPngDataUrl(rgba.width, rgba.height, rgba.rgba, THUMB_MAX_DIM);
  thumbnailCache.set(key, dataUrl);
  return dataUrl;
}

export function getSceneTextureThumbnailDataUrl(
  path: string,
  textureDataMap: NutexbTextureDataMap,
): string | null {
  return tryCacheThumbnailFromMap(path, textureDataMap);
}

export async function ensureSceneTextureThumbnailDataUrl(
  path: string,
  textureDataMap: NutexbTextureDataMap,
  decodeContext: SceneTextureDecodeContext,
): Promise<string | null> {
  const fromMap = tryCacheThumbnailFromMap(path, textureDataMap);
  if (fromMap) return fromMap;

  const key = cacheKeyForPath(path, THUMB_MAX_DIM);
  const cached = thumbnailCache.get(key);
  if (cached) return cached;

  const pending = inflightThumbnails.get(key);
  if (pending) return pending;

  const task = (async () => {
    try {
      const rgba = await decodeSceneNutexbRgba(path, decodeContext);
      const dataUrl = rgbaToPngDataUrl(rgba.width, rgba.height, rgba.rgba, THUMB_MAX_DIM);
      thumbnailCache.set(key, dataUrl);
      return dataUrl;
    } catch {
      return null;
    } finally {
      inflightThumbnails.delete(key);
    }
  })();

  inflightThumbnails.set(key, task);
  return task;
}

export async function resolveSceneTexturePreviewDataUrl(
  path: string,
  textureDataMap: NutexbTextureDataMap,
  decodeContext: SceneTextureDecodeContext,
): Promise<string | null> {
  const previewKey = cacheKeyForPath(path, PREVIEW_MAX_DIM);
  const cachedPreview = previewCache.get(previewKey);
  if (cachedPreview) return cachedPreview;

  let rgba = extractRgbaFromTextureData(lookupSceneTextureData(textureDataMap, path));
  if (!rgba) {
    try {
      rgba = await decodeSceneNutexbRgba(path, decodeContext);
    } catch {
      return null;
    }
  }

  const dataUrl = rgbaToPngDataUrl(rgba.width, rgba.height, rgba.rgba, PREVIEW_MAX_DIM);
  previewCache.set(previewKey, dataUrl);
  return dataUrl;
}
