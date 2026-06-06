import {
  buildStagePackStructureJsonCandidates,
  parseStagePackFolderName,
} from "@/lib/stagePackNaming";

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
  structurePathCandidates: string[];
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

export function resolveStagePackStructureTarget(stageRoot: string): StagePackStructureTarget {
  const parts = splitPath(stageRoot);
  let packIndex = -1;
  let parsed: ReturnType<typeof parseStagePackFolderName> = null;

  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const candidate = parseStagePackFolderName(parts[index]);
    if (candidate) {
      packIndex = index;
      parsed = candidate;
      break;
    }
  }

  if (packIndex < 0 || !parsed) {
    throw new Error(`Unable to resolve stage pack root from '${stageRoot}'`);
  }

  const packFolderName = parsed.folderName;
  const hashHex = parsed.assetHashHex;
  const parentParts = parts.slice(0, packIndex);
  const packRoot = joinPath(...parts.slice(0, packIndex + 1));
  const parentDir = joinPath(...parentParts);
  const structurePathCandidates = buildStagePackStructureJsonCandidates(
    parentDir,
    packFolderName,
    hashHex,
  );
  const structurePath = structurePathCandidates[0];

  return {
    packRoot,
    structurePath,
    structurePathCandidates,
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

function unk2ForItem(name: string, parentFolder: string): string {
  const ext = name.lastIndexOf(".") >= 0 ? name.slice(name.lastIndexOf(".")).toLowerCase() : "";
  if (ext === ".nutexb" && parentFolder === "post_effect") return "01010000";
  return "00000000";
}

function createItemEntry(fileIndex: number, name: string, parentFolder: string): Record<string, unknown> {
  return {
    type: "Item",
    unk1: "00000000",
    fileIndex,
    unk2: unk2ForItem(name, parentFolder),
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

function appendStructureForFolder(node: FileTreeNode, out: Array<Record<string, unknown>>, folderName: string): void {
  const folders = [...node.folders.entries()].sort(([a], [b]) => a.localeCompare(b));
  const files = [...node.files].sort((a, b) => a.name.localeCompare(b.name));
  out.push(createFolderEntry(folders.length + files.length));
  for (const file of files) {
    out.push(createItemEntry(file.fileIndex, file.name, folderName));
  }
  for (const [name, child] of folders) {
    appendStructureForFolder(child, out, name);
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
  for (const [name, child] of [...tree.folders.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    appendStructureForFolder(child, subFileStructure, name);
  }
  for (const file of [...tree.files].sort((a, b) => a.name.localeCompare(b.name))) {
    subFileStructure.push(createItemEntry(file.fileIndex, file.name, ""));
  }

  return {
    Magic: STAGE_FHM2D_MAGIC_OB_SIGNED,
    Fhm2dTotalCount: subFileData.length,
    UnkCount: 0,
    SubFileData: subFileData,
    SubFileStructure: subFileStructure,
  };
}
