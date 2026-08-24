import type { Fhm2dVirtualTreeNode } from "@/components/ssbh-model-preview/fhm2dMemoryPreviewTypes";

export type Fhm2dImageViewFile = {
  id: string;
  name: string;
  relativePath: string;
  virtualPath: string;
  fileType: string;
  size: number | null;
};

const IMAGE_TYPES = new Set([".nutexb", ".png", ".jpg", ".jpeg", ".bmp", ".tga", ".dds"]);

export function isFhm2dImageFile(fileType: string | null | undefined, name: string): boolean {
  const type = (fileType ?? "").trim().toLowerCase();
  if (IMAGE_TYPES.has(type)) return true;
  const lower = name.trim().toLowerCase();
  for (const ext of IMAGE_TYPES) {
    if (lower.endsWith(ext)) return true;
  }
  return false;
}

export function collectVirtualFiles(tree: readonly Fhm2dVirtualTreeNode[]): Fhm2dImageViewFile[] {
  const files: Fhm2dImageViewFile[] = [];
  const visit = (node: Fhm2dVirtualTreeNode) => {
    if (node.kind === "file") {
      files.push({
        id: node.id,
        name: node.name,
        relativePath: node.relativePath,
        virtualPath: node.virtualPath,
        fileType: node.fileType ?? "",
        size: node.size,
      });
    }
    for (const child of node.children) {
      visit(child);
    }
  };
  for (const root of tree) {
    visit(root);
  }
  return files;
}

export function partitionFhm2dImageViewFiles(files: readonly Fhm2dImageViewFile[]): {
  images: Fhm2dImageViewFile[];
  others: Fhm2dImageViewFile[];
} {
  const images: Fhm2dImageViewFile[] = [];
  const others: Fhm2dImageViewFile[] = [];
  for (const file of files) {
    if (isFhm2dImageFile(file.fileType, file.name)) {
      images.push(file);
    } else {
      others.push(file);
    }
  }
  return { images, others };
}

export function formatByteSize(size: number | null): string {
  if (size == null || size <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = size;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value >= 100 || index === 0 ? 0 : 1)} ${units[index]}`;
}

export function pngBytesToObjectUrl(raw: ArrayBuffer | Uint8Array): string {
  const u8 = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
  const copy = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
  return URL.createObjectURL(new Blob([copy], { type: "image/png" }));
}

const decodeWaiters: Array<() => void> = [];
let decodeActive = 0;
const DECODE_LIMIT = 3;

export async function withImageDecodeSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (decodeActive >= DECODE_LIMIT) {
    await new Promise<void>((resolve) => {
      decodeWaiters.push(resolve);
    });
  }
  decodeActive += 1;
  try {
    return await fn();
  } finally {
    decodeActive -= 1;
    decodeWaiters.shift()?.();
  }
}
