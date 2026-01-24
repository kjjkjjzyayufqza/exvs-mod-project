import { getPathSeparatorFromFileUrl } from "@/lib/fhm2d_fileUrlUtils";

export function sanitizeNutexbNameForPng(rawName: string): string {
  const trimmed = rawName.trim();
  const sanitized = trimmed.replace(/[\\/:*?"<>|]/g, "_");
  return sanitized ? sanitized : "texture";
}

export function buildCardIconPngFileName(rawName: string): string | null {
  if (!rawName.trim()) return null;
  const safe = sanitizeNutexbNameForPng(rawName);
  return `${safe}.png`;
}

export function buildCardIconPreviewPath(convertDirPath: string, rawName: string): string | null {
  const fileName = buildCardIconPngFileName(rawName);
  if (!fileName) return null;
  const sep = getPathSeparatorFromFileUrl(convertDirPath);
  return convertDirPath.endsWith(sep) ? `${convertDirPath}${fileName}` : `${convertDirPath}${sep}${fileName}`;
}
