type StructureJson = {
  SubFileData?: Array<Record<string, any>>;
  SubFileStructure?: Array<Record<string, any>>;
  Fhm2dTotalCount?: number;
  [key: string]: any;
};

export type CardIconItem = {
  itemIndex: number;
  name: string | null;
  fileIndex: number | null;
  fileUrl?: string | null;
};

function collectDirectCardIconItemIndices(items: Array<Record<string, any>>): number[] {
  let depth = 0;
  let firstFolderDepth: number | null = null;
  let collecting = false;
  const indices: number[] = [];

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const type = String(it?.type ?? "");

    if (type === "Folder") {
      depth += 1;
      if (firstFolderDepth === null) {
        firstFolderDepth = depth;
        collecting = true;
      }
      continue;
    }

    if (type === "Item") {
      if (!collecting || firstFolderDepth === null) continue;
      if (depth !== firstFolderDepth) continue;
      indices.push(i);
      continue;
    }

    if (type === "EndMark") {
      const cRaw = Number(it?.endMarkCount);
      const c = Number.isFinite(cRaw) && cRaw > 0 ? Math.trunc(cRaw) : 1;
      depth = Math.max(0, depth - c);
      if (collecting && firstFolderDepth !== null && depth < firstFolderDepth) {
        break;
      }
    }
  }

  return indices;
}

function parseDirectCardIconItems(items: Array<Record<string, any>>): CardIconItem[] {
  let depth = 0;
  let firstFolderDepth: number | null = null;
  let collecting = false;
  const results: CardIconItem[] = [];

  for (const it of items) {
    const type = String(it?.type ?? "");

    if (type === "Folder") {
      depth += 1;
      if (firstFolderDepth === null) {
        firstFolderDepth = depth;
        collecting = true;
      }
      continue;
    }

    if (type === "Item") {
      if (!collecting || firstFolderDepth === null) continue;
      if (depth !== firstFolderDepth) continue;
      const rawName = typeof it?.Name === "string" ? it.Name.trim() : "";
      const name = rawName ? rawName : null;
      const fileIndexRaw = Number(it?.fileIndex);
      const fileIndex = Number.isFinite(fileIndexRaw) ? Math.trunc(fileIndexRaw) : null;
      results.push({ itemIndex: results.length, name, fileIndex });
      continue;
    }

    if (type === "EndMark") {
      const cRaw = Number(it?.endMarkCount);
      const c = Number.isFinite(cRaw) && cRaw > 0 ? Math.trunc(cRaw) : 1;
      depth = Math.max(0, depth - c);
      if (collecting && firstFolderDepth !== null && depth < firstFolderDepth) {
        break;
      }
    }
  }

  return results;
}

export function extractCardIconItems(structureJson: unknown): CardIconItem[] {
  const root = structureJson as any;
  const items: Array<Record<string, any>> = Array.isArray(root?.SubFileStructure) ? root.SubFileStructure : [];
  if (items.length === 0) return [];
  return parseDirectCardIconItems(items);
}

export function moveCardIconInStructureJson(
  structJson: unknown,
  params: { fromIndex: number; toIndex: number }
): { nextStructJson: StructureJson } {
  const cloned: StructureJson = JSON.parse(JSON.stringify(structJson ?? {}));
  const subFileStructure: Array<Record<string, any>> = Array.isArray(cloned.SubFileStructure) ? cloned.SubFileStructure : [];
  if (subFileStructure.length === 0) {
    throw new Error("SubFileStructure is empty");
  }

  const itemIndices = collectDirectCardIconItemIndices(subFileStructure);
  const total = itemIndices.length;
  if (total === 0) {
    throw new Error("No direct card icon items found in SubFileStructure");
  }

  const fromIndex = Math.trunc(params.fromIndex);
  const toIndex = Math.trunc(params.toIndex);
  if (fromIndex < 0 || fromIndex >= total) {
    throw new Error(`fromIndex out of range: ${fromIndex}`);
  }
  if (toIndex < 0 || toIndex >= total) {
    throw new Error(`toIndex out of range: ${toIndex}`);
  }
  if (fromIndex === toIndex) {
    return { nextStructJson: cloned };
  }

  const directItems = itemIndices.map((idx) => subFileStructure[idx]);
  const [moved] = directItems.splice(fromIndex, 1);
  directItems.splice(toIndex, 0, moved);

  for (let i = 0; i < itemIndices.length; i++) {
    subFileStructure[itemIndices[i]] = directItems[i];
  }

  cloned.SubFileStructure = subFileStructure;
  return { nextStructJson: cloned };
}

function normalizeFileIndex(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

export function reorderCardIconsInStructureJson(
  structJson: unknown,
  desiredFileIndexOrder: Array<number | null>
): { nextStructJson: StructureJson } {
  const cloned: StructureJson = JSON.parse(JSON.stringify(structJson ?? {}));
  const subFileStructure: Array<Record<string, any>> = Array.isArray(cloned.SubFileStructure) ? cloned.SubFileStructure : [];
  if (subFileStructure.length === 0) {
    throw new Error("SubFileStructure is empty");
  }

  const itemIndices = collectDirectCardIconItemIndices(subFileStructure);
  if (itemIndices.length === 0) {
    throw new Error("No direct card icon items found in SubFileStructure");
  }

  const buckets = new Map<string, Array<Record<string, any>>>();
  const put = (key: string, entry: Record<string, any>) => {
    const arr = buckets.get(key);
    if (arr) {
      arr.push(entry);
      return;
    }
    buckets.set(key, [entry]);
  };

  for (const idx of itemIndices) {
    const entry = subFileStructure[idx];
    const fileIndex = normalizeFileIndex(entry?.fileIndex);
    const key = fileIndex === null ? "null" : String(fileIndex);
    put(key, entry);
  }

  const nextDirectItems: Array<Record<string, any>> = [];
  for (const desired of desiredFileIndexOrder) {
    const key = desired === null ? "null" : String(Math.trunc(desired));
    const arr = buckets.get(key);
    if (!arr || arr.length === 0) continue;
    const moved = arr.shift();
    if (moved) nextDirectItems.push(moved);
  }

  // Append anything not explicitly ordered (keeps original relative order per bucket).
  for (const arr of buckets.values()) {
    for (const entry of arr) {
      nextDirectItems.push(entry);
    }
  }

  const count = Math.min(itemIndices.length, nextDirectItems.length);
  for (let i = 0; i < count; i++) {
    subFileStructure[itemIndices[i]] = nextDirectItems[i];
  }

  cloned.SubFileStructure = subFileStructure;
  return { nextStructJson: cloned };
}

function resolveFileUrlPrefix(subFileData: Array<Record<string, any>>): string {
  for (const item of subFileData) {
    const fileUrl = typeof item?.fileUrl === "string" ? item.fileUrl : "";
    const type = typeof item?.fileType === "string" ? item.fileType : "";
    if (!fileUrl && !type.includes("nutexb")) continue;
    const sepIndex = Math.max(fileUrl.lastIndexOf("/"), fileUrl.lastIndexOf("\\"));
    if (sepIndex >= 0) {
      return fileUrl.slice(0, sepIndex + 1);
    }
  }
  return "0x49235031/";
}

function updateFolderCount(
  folderEntry: Record<string, any>,
  subFileStructure: Array<Record<string, any>>,
  delta: number
): void {
  const current = Number(folderEntry?.folderCount);
  if (Number.isFinite(current)) {
    folderEntry.folderCount = Math.max(0, current + delta);
    return;
  }
  folderEntry.folderCount = parseDirectCardIconItems(subFileStructure).length;
}

export function appendCardIconToStructureJson(
  structJson: unknown,
  params: { name: string }
): { nextStructJson: StructureJson; newFileIndex: number } {
  const cloned: StructureJson = JSON.parse(JSON.stringify(structJson ?? {}));
  const subFileData: Array<Record<string, any>> = Array.isArray(cloned.SubFileData) ? cloned.SubFileData : [];
  const subFileStructure: Array<Record<string, any>> = Array.isArray(cloned.SubFileStructure) ? cloned.SubFileStructure : [];

  let maxFileIndex = -1;
  for (const item of subFileData) {
    const v = Number(item?.fileIndex);
    if (Number.isFinite(v) && v > maxFileIndex) {
      maxFileIndex = v;
    }
  }
  const newFileIndex = maxFileIndex + 1;

  const prefix = resolveFileUrlPrefix(subFileData);
  const normalized = prefix.endsWith("/") || prefix.endsWith("\\") ? prefix : `${prefix}/`;
  const fileUrl = `${normalized}${params.name}.nutexb`;

  subFileData.push({
    index: newFileIndex,
    fileType: ".nutexb",
    fileIndex: newFileIndex,
    fileUrl,
    fileBaseName: params.name,
  });

  let depth = 0;
  let firstFolderDepth: number | null = null;
  let collecting = false;
  let insertionIndex = subFileStructure.length;
  let folderEntry: Record<string, any> | null = null;
  let lastItemTemplate: Record<string, any> | null = null;

  for (let i = 0; i < subFileStructure.length; i++) {
    const it = subFileStructure[i];
    const type = String(it?.type ?? "");

    if (type === "Folder") {
      depth += 1;
      if (firstFolderDepth === null) {
        firstFolderDepth = depth;
        collecting = true;
        folderEntry = it;
      }
      continue;
    }

    if (type === "Item") {
      if (collecting && firstFolderDepth !== null && depth === firstFolderDepth) {
        lastItemTemplate = it;
      }
      continue;
    }

    if (type === "EndMark") {
      const cRaw = Number(it?.endMarkCount);
      const c = Number.isFinite(cRaw) && cRaw > 0 ? Math.trunc(cRaw) : 1;

      if (collecting && firstFolderDepth !== null && depth === firstFolderDepth) {
        insertionIndex = i;
        break;
      }

      depth = Math.max(0, depth - c);
      if (collecting && firstFolderDepth !== null && depth < firstFolderDepth) {
        insertionIndex = i;
        break;
      }
    }
  }

  if (!collecting || firstFolderDepth === null || !folderEntry) {
    throw new Error("Failed to locate the first Folder in SubFileStructure");
  }

  const newItem = {
    ...(lastItemTemplate ?? {}),
    type: "Item",
    Name: params.name,
    fileIndex: newFileIndex,
  };

  subFileStructure.splice(insertionIndex, 0, newItem);

  updateFolderCount(folderEntry, subFileStructure, 1);
  if (typeof cloned.Fhm2dTotalCount === "number") {
    cloned.Fhm2dTotalCount = subFileData.length;
  }

  cloned.SubFileData = subFileData;
  cloned.SubFileStructure = subFileStructure;

  return {
    nextStructJson: cloned,
    newFileIndex,
  };
}

export function removeCardIconFromStructureJson(
  structJson: unknown,
  targetIndex: number
): { nextStructJson: StructureJson; removedFileIndex: number };
export function removeCardIconFromStructureJson(
  structJson: unknown,
  target: { itemIndex?: number; fileIndex?: number | null }
): { nextStructJson: StructureJson; removedFileIndex: number };
export function removeCardIconFromStructureJson(
  structJson: unknown,
  target: number | { itemIndex?: number; fileIndex?: number | null }
): { nextStructJson: StructureJson; removedFileIndex: number } {
  const cloned: StructureJson = JSON.parse(JSON.stringify(structJson ?? {}));
  let subFileData: Array<Record<string, any>> = Array.isArray(cloned.SubFileData) ? cloned.SubFileData : [];
  const subFileStructure: Array<Record<string, any>> = Array.isArray(cloned.SubFileStructure) ? cloned.SubFileStructure : [];

  const targetIndex = typeof target === "number" ? Math.trunc(target) : (typeof target?.itemIndex === "number" ? Math.trunc(target.itemIndex) : null);
  const targetFileIndexRaw = typeof target === "object" && target ? target.fileIndex : null;
  const targetFileIndex = typeof targetFileIndexRaw === "number" && Number.isFinite(targetFileIndexRaw) ? Math.trunc(targetFileIndexRaw) : null;

  let depth = 0;
  let firstFolderDepth: number | null = null;
  let collecting = false;
  let folderEntry: Record<string, any> | null = null;
  let itemCounter = -1;
  let removedIndex = -1;
  let removedFileIndex: number | null = null;

  for (let i = 0; i < subFileStructure.length; i++) {
    const it = subFileStructure[i];
    const type = String(it?.type ?? "");

    if (type === "Folder") {
      depth += 1;
      if (firstFolderDepth === null) {
        firstFolderDepth = depth;
        collecting = true;
        folderEntry = it;
      }
      continue;
    }

    if (type === "Item") {
      if (collecting && firstFolderDepth !== null && depth === firstFolderDepth) {
        const fileIndex = normalizeFileIndex(it?.fileIndex);
        if (targetFileIndex !== null) {
          if (fileIndex === targetFileIndex) {
            removedIndex = i;
            removedFileIndex = targetFileIndex;
            break;
          }
        } else if (targetIndex !== null) {
          itemCounter += 1;
          if (itemCounter === targetIndex) {
            removedIndex = i;
            removedFileIndex = fileIndex;
            break;
          }
        }
      }
      continue;
    }

    if (type === "EndMark") {
      const cRaw = Number(it?.endMarkCount);
      const c = Number.isFinite(cRaw) && cRaw > 0 ? Math.trunc(cRaw) : 1;
      depth = Math.max(0, depth - c);
      if (collecting && firstFolderDepth !== null && depth < firstFolderDepth) {
        break;
      }
    }
  }

  if (!collecting || firstFolderDepth === null || !folderEntry) {
    throw new Error("Failed to locate the first Folder in SubFileStructure");
  }

  if (removedIndex < 0) {
    throw new Error("Target item not found in SubFileStructure");
  }

  if (removedFileIndex === null) {
    throw new Error("Selected item has no valid fileIndex");
  }

  subFileStructure.splice(removedIndex, 1);

  const dataIndex = subFileData.findIndex((d) => Number(d?.fileIndex) === removedFileIndex);
  if (dataIndex < 0) {
    throw new Error(`SubFileData entry not found for fileIndex=${removedFileIndex}`);
  }
  subFileData.splice(dataIndex, 1);

  // Renumber SubFileData/index and synchronize SubFileStructure fileIndex.
  // Many consumers expect fileIndex/index to be contiguous: 0..N-1.
  const oldToNew = new Map<number, number>();
  const seen = new Set<number>();
  const indexed = subFileData.map((entry, originalPos) => {
    const old = normalizeFileIndex(entry?.fileIndex);
    if (old === null) {
      throw new Error("SubFileData contains an entry with invalid fileIndex");
    }
    return { entry, originalPos, old };
  });
  indexed.sort((a, b) => (a.old - b.old) || (a.originalPos - b.originalPos));
  for (let i = 0; i < indexed.length; i++) {
    const { entry, old } = indexed[i];
    if (seen.has(old)) {
      throw new Error(`Duplicate fileIndex found in SubFileData: ${old}`);
    }
    seen.add(old);
    oldToNew.set(old, i);
    entry.index = i;
    entry.fileIndex = i;
  }
  subFileData = indexed.map((x) => x.entry);

  for (const it of subFileStructure) {
    if (String(it?.type ?? "") !== "Item") continue;
    const old = normalizeFileIndex(it?.fileIndex);
    if (old === null) continue;
    const next = oldToNew.get(old);
    if (next === undefined) {
      throw new Error(`SubFileStructure references missing fileIndex=${old}`);
    }
    it.fileIndex = next;
  }

  updateFolderCount(folderEntry, subFileStructure, -1);
  if (typeof cloned.Fhm2dTotalCount === "number") {
    cloned.Fhm2dTotalCount = subFileData.length;
  }

  cloned.SubFileData = subFileData;
  cloned.SubFileStructure = subFileStructure;

  return {
    nextStructJson: cloned,
    removedFileIndex,
  };
}
