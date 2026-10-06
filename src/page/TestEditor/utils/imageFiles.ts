const SUPPORTED_IMAGE_EXTENSIONS = [
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".bmp",
  ".ico",
  ".svg",
];

export function isImageFile(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return SUPPORTED_IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}
