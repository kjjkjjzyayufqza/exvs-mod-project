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
): { nextStructJson: StructureJson; removedFileIndex: number } {
  const cloned: StructureJson = JSON.parse(JSON.stringify(structJson ?? {}));
  const subFileData: Array<Record<string, any>> = Array.isArray(cloned.SubFileData) ? cloned.SubFileData : [];
  const subFileStructure: Array<Record<string, any>> = Array.isArray(cloned.SubFileStructure) ? cloned.SubFileStructure : [];

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
        itemCounter += 1;
        if (itemCounter === targetIndex) {
          removedIndex = i;
          const fileIndexRaw = Number(it?.fileIndex);
          removedFileIndex = Number.isFinite(fileIndexRaw) ? Math.trunc(fileIndexRaw) : null;
          break;
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
