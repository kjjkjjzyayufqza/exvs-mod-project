export type PathSeparator = "/" | "\\";

export interface HasFileUrl {
  fileUrl?: string;
  fileIndex?: number;
}

export interface HasSubFileData<TItem extends HasFileUrl = HasFileUrl> {
  SubFileData: TItem[];
}

export function normalizeWindowsLikePathForCompare(p: string): string {
  return p
    .trim()
    .replace(/\//g, "\\")
    .replace(/\\+/g, "\\")
    .toLowerCase();
}

export function assertNoDuplicateFileUrls(structure: HasSubFileData): void {
  const map = new Map<string, HasFileUrl[]>();
  for (const item of structure.SubFileData) {
    const url = item.fileUrl || "";
    const key = normalizeWindowsLikePathForCompare(url);
    if (!key) continue;
    const list = map.get(key);
    if (list) list.push(item);
    else map.set(key, [item]);
  }

  const duplicates: Array<{ fileUrl: string; items: HasFileUrl[] }> = [];
  for (const [key, items] of map.entries()) {
    if (items.length > 1) {
      duplicates.push({ fileUrl: key, items });
    }
  }

  if (duplicates.length > 0) {
    const details = duplicates
      .slice(0, 20)
      .map((d) => {
        const indices = d.items.map((i) => i.fileIndex).join(", ");
        return `${d.fileUrl} <- fileIndex: [${indices}]`;
      })
      .join("\n");
    throw new Error(`Duplicate fileUrl detected (${duplicates.length}):\n${details}`);
  }
}

export function getPathSeparatorFromFileUrl(fileUrl: string): PathSeparator {
  return fileUrl.includes("\\") ? "\\" : "/";
}

export function stripLeadingDotSlash(p: string): string {
  return p.replace(/^(\.\/|\.\\)+/g, "");
}

export function splitPathSegments(p: string): string[] {
  const trimmed = stripLeadingDotSlash(p);
  return trimmed.split(/[\\/]+/g).filter(Boolean);
}

export function buildFileUrl(prefixSegments: string[], fileName: string, sep: PathSeparator): string {
  const base = prefixSegments.join(sep);
  if (base.length === 0) return `.${sep}${fileName}`;
  return `.${sep}${base}${sep}${fileName}`;
}


