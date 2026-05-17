export type StagePackFileEntry = {
  relativePath: string;
  fileType: string;
};

type StageStructureJson = {
  Magic: number;
  Fhm2dTotalCount: number;
  UnkCount: number;
  SubFileData: Array<Record<string, unknown>>;
  SubFileStructure: Array<Record<string, unknown>>;
};

export type StagePackStructureTarget = {
  packRoot: string;
  structurePath: string;
  packFolderName: string;
  hashHex: string;
};

const STAGE_FHM2D_MAGIC_OB_SIGNED = -843925575;
const GAME_READY_STAGE_FILE_TYPES = new Set([
  ".bin",
  ".csv",
  ".hkt",
  ".jnttbl",
  ".numatb",
  ".numdlb",
  ".numshb",
  ".nuanmb",
  ".nudnbb",
  ".nufxlb",
  ".nuhlpb",
  ".nurpdb",
  ".nushdb",
  ".nus3bank",
  ".nusktb",
  ".nutexb",
  ".spbin",
]);

type FileTreeNode = {
  folders: Map<string, FileTreeNode>;
  files: Array<{ name: string; fileIndex: number }>;
};

function normalizeSlashes(path: string): string {
  return path.trim().replace(/\\/g, "/").replace(/\/+/g, "/").replace(/\/$/g, "");
}

function joinPath(...parts: string[]): string {
  return parts
    .map((part, index) => {
      const normalized = normalizeSlashes(part);
      return index === 0 ? normalized : normalized.replace(/^\/+/g, "");
    })
    .filter(Boolean)
    .join("/");
}

function splitPath(path: string): string[] {
  return normalizeSlashes(path).split("/").filter(Boolean);
}

function isHashFolderName(name: string): boolean {
  return /^(?:0x)?[0-9a-fA-F]{8}$/.test(name);
}

export function resolveStagePackStructureTarget(stageRoot: string): StagePackStructureTarget {
  const parts = splitPath(stageRoot);
  const hashIndex = [...parts].reverse().findIndex(isHashFolderName);
  if (hashIndex < 0) {
    throw new Error(`Unable to resolve a hash-named stage pack root from '${stageRoot}'`);
  }

  const packIndex = parts.length - 1 - hashIndex;
  const packFolderName = parts[packIndex];
  const hashBody = packFolderName.replace(/^0x/i, "").toUpperCase();
  const hashHex = `0x${hashBody}`;
  const parentParts = parts.slice(0, packIndex);
  const packRoot = joinPath(...parts.slice(0, packIndex + 1));
  const structurePath = joinPath(...parentParts, `${hashHex}_structure.json`);

  return {
    packRoot,
    structurePath,
    packFolderName,
    hashHex,
  };
}

function isGameReadyStageFile(fileType: string): boolean {
  return GAME_READY_STAGE_FILE_TYPES.has(fileType.trim().toLowerCase());
}

function createFolderEntry(childCount: number): Record<string, unknown> {
  return {
    type: "Folder",
    unk1: "00000000",
    folderCount: childCount,
    unk2: "00000000",
    unk2_1: 0,
    unk3: 0,
    unk4: 0,
    unk5: 0,
    unk6: 0,
  };
}

function createItemEntry(fileIndex: number, name: string): Record<string, unknown> {
  return {
    type: "Item",
    unk1: "00000000",
    fileIndex,
    unk2: "00000000",
    unk2_1: 0,
    unk3: 0,
    unk4: 0,
    originalFileIndex: fileIndex,
    Name: name,
  };
}

function insertFile(root: FileTreeNode, relativePath: string, fileIndex: number): void {
  const parts = splitPath(relativePath);
  const fileName = parts.pop();
  if (!fileName) {
    throw new Error(`Invalid stage pack file path: '${relativePath}'`);
  }

  let cursor = root;
  for (const folder of parts) {
    let child = cursor.folders.get(folder);
    if (!child) {
      child = { folders: new Map(), files: [] };
      cursor.folders.set(folder, child);
    }
    cursor = child;
  }
  cursor.files.push({ name: fileName, fileIndex });
}

function appendStructureForFolder(node: FileTreeNode, out: Array<Record<string, unknown>>): void {
  const folders = [...node.folders.entries()].sort(([a], [b]) => a.localeCompare(b));
  const files = [...node.files].sort((a, b) => a.name.localeCompare(b.name));
  out.push(createFolderEntry(folders.length + files.length));
  for (const file of files) {
    out.push(createItemEntry(file.fileIndex, file.name));
  }
  for (const [, child] of folders) {
    appendStructureForFolder(child, out);
  }
  out.push({ type: "EndMark", endMarkCount: 1 });
}

export function buildStageStructureJsonFromFiles(params: {
  packFolderName: string;
  files: readonly StagePackFileEntry[];
}): StageStructureJson {
  const entries = params.files
    .filter((file) => isGameReadyStageFile(file.fileType))
    .map((file) => ({
      relativePath: normalizeSlashes(file.relativePath),
      fileType: file.fileType.trim().toLowerCase(),
    }));

  const tree: FileTreeNode = { folders: new Map(), files: [] };
  const subFileData = entries.map((file, index) => {
    insertFile(tree, file.relativePath, index);
    return {
      index,
      fileType: file.fileType,
      fileIndex: index,
      fileUrl: joinPath(params.packFolderName, file.relativePath),
      fileBaseName: file.relativePath.split("/").pop()?.replace(/\.[^.]+$/, "") ?? "",
    };
  });

  const subFileStructure: Array<Record<string, unknown>> = [];
  for (const [, child] of [...tree.folders.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    appendStructureForFolder(child, subFileStructure);
  }
  for (const file of [...tree.files].sort((a, b) => a.name.localeCompare(b.name))) {
    subFileStructure.push(createItemEntry(file.fileIndex, file.name));
  }

  return {
    Magic: STAGE_FHM2D_MAGIC_OB_SIGNED,
    Fhm2dTotalCount: subFileData.length,
    UnkCount: 0,
    SubFileData: subFileData,
    SubFileStructure: subFileStructure,
  };
}
