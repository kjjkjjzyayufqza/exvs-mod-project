export function splitNativePath(path: string): string[] {
  return path.replace(/\\/g, "/").replace(/\/+$/g, "").split("/").filter(Boolean);
}

export function basenameFromPath(path: string): string {
  const parts = splitNativePath(path);
  return parts[parts.length - 1] ?? "";
}

export function parentFromPath(path: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/\/+$/g, "");
  const index = normalized.lastIndexOf("/");
  return index >= 0 ? normalized.slice(0, index) : "";
}

export function joinPreviewPath(parent: string, child: string): string {
  if (!parent) return child;
  return `${parent.replace(/[\\/]+$/g, "")}/${child}`;
}

