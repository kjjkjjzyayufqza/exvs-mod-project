// Helpers for updating 0xA0253AA0_structure.json when appending a new series icon.
export function computeNextSerMsIndex(seriesBaseNameOrder: Array<string | null> | undefined): number | null {
  if (!seriesBaseNameOrder || seriesBaseNameOrder.length === 0) return 1;
  let max = 0;
  for (const name of seriesBaseNameOrder) {
    if (typeof name !== "string") continue;
    const m = /^ser_ms_(\d{3})$/i.exec(name.trim());
    if (!m) continue;
    const v = Number.parseInt(m[1] ?? "", 10);
    if (Number.isFinite(v) && v >= 1 && v <= 999 && v > max) {
      max = v;
    }
  }
  const next = max + 1;
  if (next < 1 || next > 999) return null;
  return next;
}

type StructureJson = {
  SubFileData?: Array<Record<string, any>>;
  SubFileStructure?: Array<Record<string, any>>;
  Fhm2dTotalCount?: number;
  [key: string]: any;
};

type AppendParams = {
  baseName: string; // strict ser_ms_### already validated upstream
  explicitFileUrl?: string;
};

type AppendResult = {
  nextStructJson: StructureJson;
  newFileIndex: number;
};

export function appendSeriesIconToStructureJson(structJson: unknown, params: AppendParams): AppendResult {
  const cloned: StructureJson = JSON.parse(JSON.stringify(structJson ?? {}));
  const subFileData: Array<Record<string, any>> = Array.isArray(cloned.SubFileData) ? cloned.SubFileData : [];
  const subFileStructure: Array<Record<string, any>> = Array.isArray(cloned.SubFileStructure) ? cloned.SubFileStructure : [];

  // Compute new fileIndex (and index) as max + 1.
  let maxFileIndex = -1;
  for (const item of subFileData) {
    const v = Number(item?.fileIndex);
    if (Number.isFinite(v) && v > maxFileIndex) {
      maxFileIndex = v;
    }
  }
  const newFileIndex = maxFileIndex + 1;

  // Derive fileUrl using existing pattern if any.
  const resolveFileUrl = (): string => {
    if (params.explicitFileUrl) return params.explicitFileUrl;
    let prefix: string | null = null;
    for (const item of subFileData) {
      const fileUrl = typeof item?.fileUrl === "string" ? item.fileUrl : "";
      const type = typeof item?.fileType === "string" ? item.fileType : "";
      if (!fileUrl && !type.includes("nutexb")) continue;
      const sepIndex = Math.max(fileUrl.lastIndexOf("/"), fileUrl.lastIndexOf("\\"));
      if (sepIndex >= 0) {
        prefix = fileUrl.slice(0, sepIndex + 1);
        break;
      }
    }
    if (!prefix) {
      prefix = "0xA0253AA0/";
    }
    const normalized = prefix.endsWith("/") || prefix.endsWith("\\") ? prefix : `${prefix}/`;
    return `${normalized}${params.baseName}.nutexb`;
  };

  subFileData.push({
    index: newFileIndex,
    fileType: ".nutexb",
    fileIndex: newFileIndex,
    fileUrl: resolveFileUrl(),
    fileBaseName: params.baseName,
  });

  // Insert into SubFileStructure under the first Folder.
  let depth = 0;
  let firstFolderDepth: number | null = null;
  let collecting = false;
  let insertionIndex = subFileStructure.length;
  let folderEntry: Record<string, any> | null = null;
  let directChildCount = 0;
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
      if (collecting && depth === firstFolderDepth) {
        directChildCount += 1;
      }
      continue;
    }

    if (type === "Item") {
      if (collecting && firstFolderDepth !== null && depth === firstFolderDepth) {
        directChildCount += 1;
        lastItemTemplate = it;
      }
      continue;
    }

    if (type === "EndMark") {
      const cRaw = Number(it?.endMarkCount);
      const c = Number.isFinite(cRaw) && cRaw > 0 ? Math.trunc(cRaw) : 1;

      if (collecting && firstFolderDepth !== null && depth === firstFolderDepth) {
        // This EndMark will close the first folder; insert right before it.
        insertionIndex = i;
        break;
      }

      depth = Math.max(0, depth - c);
      if (collecting && firstFolderDepth !== null && depth < firstFolderDepth) {
        // Fallback: if we exited without placing insertionIndex, insert here.
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
    Name: params.baseName,
    fileIndex: newFileIndex,
  };

  subFileStructure.splice(insertionIndex, 0, newItem);

  const updatedChildCount = directChildCount + 1;
  folderEntry.folderCount = updatedChildCount;

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
