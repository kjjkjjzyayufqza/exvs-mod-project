import { invoke } from "@tauri-apps/api/core";
import { exists, mkdir, readTextFile, remove, rename, writeTextFile } from "@tauri-apps/plugin-fs";

export type MotionStructureNode = MotionFolderNode | MotionItemNode;

export type MotionStructureProject = {
  Name?: string;
  HashName?: string;
  Magic: number;
  Fhm2dTotalCount: number;
  UnkCount: number;
  SubFileData: MotionSubFileData[];
  SubFileStructure: MotionSubFileStructureEntry[];
  SubFileParseStructure?: MotionParseRoot;
  [key: string]: unknown;
};

export type MotionSubFileData = {
  index: number;
  fileType: string;
  fileIndex: number;
  fileUrl: string;
  fileBaseName?: string;
  [key: string]: unknown;
};

export type MotionSubFileStructureEntry =
  | MotionSubFileStructureFolder
  | MotionSubFileStructureItem
  | MotionSubFileStructureEndMark;

export type MotionSubFileStructureFolder = {
  type: "Folder";
  Name?: string;
  unk1?: string;
  folderCount: number;
  unk2?: string;
  unk2_1?: number;
  unk3?: number;
  unk4?: number;
  unk5?: number;
  unk6?: number;
  [key: string]: unknown;
};

export type MotionSubFileStructureItem = {
  type: "Item";
  Name?: string;
  unk1?: string;
  fileIndex: number;
  unk2?: string;
  unk2_1?: number;
  unk3?: number;
  unk4?: number;
  originalFileIndex?: number;
  [key: string]: unknown;
};

export type MotionSubFileStructureEndMark = {
  type: "EndMark";
  endMarkCount?: number;
  [key: string]: unknown;
};

export type MotionParseRoot = {
  name?: string;
  children?: MotionParseNode[];
  [key: string]: unknown;
};

export type MotionParseNode = {
  type?: "Folder" | "Item" | string;
  name?: string;
  link?: boolean;
  unk1?: string;
  unk2?: string;
  unk3?: number;
  children?: MotionParseNode[];
  [key: string]: unknown;
};

type MotionNodeBase = {
  id: string;
  parentId: string | null;
  name: string;
  link: boolean;
  depth: number;
  pathSegments: string[];
  unk1: string;
  unk2: string;
  unk2_1: number;
  unk3: number;
  unk4: number;
  rawStructure: MotionSubFileStructureFolder | MotionSubFileStructureItem | null;
  rawParse: MotionParseNode | null;
};

export type MotionFolderNode = MotionNodeBase & {
  kind: "folder";
  children: MotionStructureNode[];
  unk5: number;
  unk6: number;
};

export type MotionItemNode = MotionNodeBase & {
  kind: "item";
  fileIndex: number;
  originalFileIndex: number;
  fileType: string;
  fileUrl: string;
  fileBaseName: string;
  filePath: string;
  rawSubFileData: MotionSubFileData;
};

export type MotionFolderInventory = {
  motionRoot: string;
  structureJsonPath: string;
  rootName: string;
  project: MotionStructureProject;
  nodes: MotionStructureNode[];
  flatNodes: MotionStructureNode[];
  folders: MotionFolderNode[];
  items: MotionItemNode[];
  summary: {
    totalFiles: number;
    folderCount: number;
    linkedItemCount: number;
    linkedFolderCount: number;
    nonZeroUnk1Count: number;
    nonZeroUnk2Count: number;
  };
  warnings: string[];
};

const STRUCTURE_JSON_SUFFIX = "_structure.json";
export const MOTION_EXT = ".nuanmb";
const INVALID_NAME_CHARS = /[<>:"|?*\\/]/;

function toWindowsPath(path: string): string {
  return path.replace(/\//g, "\\");
}

function trimTrailingSeparators(path: string): string {
  return path.replace(/[\\/]+$/g, "");
}

function parentDir(path: string): string {
  const normalized = trimTrailingSeparators(toWindowsPath(path));
  const idx = normalized.lastIndexOf("\\");
  return idx >= 0 ? normalized.slice(0, idx) : "";
}

function basename(path: string): string {
  const normalized = trimTrailingSeparators(toWindowsPath(path));
  const idx = normalized.lastIndexOf("\\");
  return idx >= 0 ? normalized.slice(idx + 1) : normalized;
}

function stripMotionExt(name: string): string {
  return name.replace(/\.nuanmb$/i, "");
}

function splitFileUrl(fileUrl: string): string[] {
  return fileUrl.replace(/^(\.\/|\.\\)+/g, "").split(/[\\/]+/g).filter(Boolean);
}

function joinWindowsPath(root: string, segments: string[]): string {
  const normalizedRoot = trimTrailingSeparators(toWindowsPath(root));
  return segments.length > 0 ? `${normalizedRoot}\\${segments.join("\\")}` : normalizedRoot;
}

function getRootNameFromProject(project: MotionStructureProject, motionRoot: string): string {
  for (const item of project.SubFileData ?? []) {
    if (typeof item.fileUrl !== "string") continue;
    const first = splitFileUrl(item.fileUrl)[0];
    if (first) return first;
  }
  return project.Name || basename(motionRoot);
}

function defaultString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function defaultNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeHexField(value: unknown, fallback = "00000000"): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim().replace(/^0x/i, "");
  return /^[0-9a-fA-F]{8}$/.test(trimmed) ? trimmed.toLowerCase() : fallback;
}

function defaultLink(value: unknown): boolean {
  return typeof value === "boolean" ? value : false;
}

function displayNameFromFileUrl(fileUrl: string): string {
  const fileName = splitFileUrl(fileUrl).pop() ?? "";
  return stripMotionExt(fileName);
}

function buildFileUrl(rootName: string, folderSegments: string[], itemName: string): string {
  const parts = [rootName, ...folderSegments, `${itemName}${MOTION_EXT}`];
  return `.\\${parts.join("\\")}`;
}

function filePathFromFileUrl(motionRoot: string, fileUrl: string): string {
  const segments = splitFileUrl(fileUrl);
  return joinWindowsPath(motionRoot, segments.slice(1));
}

function itemPathSegmentsFromFileUrl(fileUrl: string): string[] {
  const segments = splitFileUrl(fileUrl);
  return segments.slice(1, -1);
}

function nextId(kind: "folder" | "item", key: string): string {
  return `${kind}:${key}`;
}

function consumeParseChild(
  frame: ParseFrame,
  type: "Folder" | "Item",
  fileIndex?: number,
): MotionParseNode | null {
  const children = Array.isArray(frame.parseNode?.children) ? frame.parseNode.children : [];
  if (children.length === 0) return null;
  for (let i = frame.cursor; i < children.length; i += 1) {
    const child = children[i];
    if (child?.type !== type) continue;
    if (type === "Item" && fileIndex !== undefined && String(fileIndex) !== String(child.name ?? "")) {
      continue;
    }
    frame.cursor = i + 1;
    return child;
  }
  return null;
}

type ParseFrame = {
  node: MotionFolderNode | null;
  parseNode: MotionParseNode | MotionParseRoot | null;
  cursor: number;
};

function flattenNodes(nodes: MotionStructureNode[]): MotionStructureNode[] {
  const out: MotionStructureNode[] = [];
  const walk = (items: MotionStructureNode[]) => {
    for (const item of items) {
      out.push(item);
      if (item.kind === "folder") walk(item.children);
    }
  };
  walk(nodes);
  return out;
}

function parseMotionProject(
  project: MotionStructureProject,
  motionRoot: string,
  structureJsonPath: string,
): MotionFolderInventory {
  if (!Array.isArray(project.SubFileData)) {
    throw new Error("Motion structure JSON is missing SubFileData");
  }
  if (!Array.isArray(project.SubFileStructure)) {
    throw new Error("Motion structure JSON is missing SubFileStructure");
  }

  const rootName = getRootNameFromProject(project, motionRoot);
  const subFileDataByIndex = new Map<number, MotionSubFileData>();
  const warnings: string[] = [];
  for (const data of project.SubFileData) {
    if (typeof data.fileIndex !== "number") {
      warnings.push("SubFileData entry without numeric fileIndex was ignored");
      continue;
    }
    subFileDataByIndex.set(data.fileIndex, data);
  }

  const roots: MotionStructureNode[] = [];
  const stack: ParseFrame[] = [
    {
      node: null,
      parseNode: project.SubFileParseStructure && typeof project.SubFileParseStructure === "object"
        ? project.SubFileParseStructure
        : null,
      cursor: 0,
    },
  ];

  for (const entry of project.SubFileStructure) {
    const current = stack[stack.length - 1]!;
    if (entry.type === "Folder") {
      const parseNode = consumeParseChild(current, "Folder");
      const name = defaultString(entry.Name, defaultString(parseNode?.name, String(entry.folderCount ?? "folder")));
      const parentPath = current.node?.pathSegments ?? [];
      const pathSegments = [...parentPath, name];
      const folder: MotionFolderNode = {
        id: nextId("folder", pathSegments.join("/")),
        kind: "folder",
        parentId: current.node?.id ?? null,
        name,
        link: defaultLink(parseNode?.link),
        depth: pathSegments.length - 1,
        pathSegments,
        children: [],
        unk1: defaultString(entry.unk1, defaultString(parseNode?.unk1, "00000000")),
        unk2: normalizeHexField(entry.unk2, normalizeHexField(parseNode?.unk2)),
        unk2_1: defaultNumber(entry.unk2_1, 0),
        unk3: defaultNumber(entry.unk3, defaultNumber(parseNode?.unk3, 0)),
        unk4: defaultNumber(entry.unk4, 0),
        unk5: defaultNumber(entry.unk5, 0),
        unk6: defaultNumber(entry.unk6, 0),
        rawStructure: entry,
        rawParse: parseNode,
      };

      if (current.node) current.node.children.push(folder);
      else roots.push(folder);

      stack.push({ node: folder, parseNode, cursor: 0 });
      continue;
    }

    if (entry.type === "Item") {
      const fileData = subFileDataByIndex.get(entry.fileIndex);
      if (!fileData) {
        warnings.push(`Missing SubFileData for fileIndex=${entry.fileIndex}`);
        continue;
      }
      const parseNode = consumeParseChild(current, "Item", entry.fileIndex);
      const name = defaultString(
        entry.Name,
        defaultString(fileData.fileBaseName, displayNameFromFileUrl(fileData.fileUrl)),
      );
      const folderSegments = current.node?.pathSegments ?? itemPathSegmentsFromFileUrl(fileData.fileUrl);
      const fileUrl = typeof fileData.fileUrl === "string"
        ? fileData.fileUrl
        : buildFileUrl(rootName, folderSegments, name);
      const item: MotionItemNode = {
        id: nextId("item", String(entry.fileIndex)),
        kind: "item",
        parentId: current.node?.id ?? null,
        name,
        link: defaultLink(parseNode?.link),
        depth: folderSegments.length,
        pathSegments: folderSegments,
        unk1: defaultString(entry.unk1, defaultString(parseNode?.unk1, "00000000")),
        unk2: normalizeHexField(entry.unk2, normalizeHexField(parseNode?.unk2)),
        unk2_1: defaultNumber(entry.unk2_1, 0),
        unk3: defaultNumber(entry.unk3, defaultNumber(parseNode?.unk3, 0)),
        unk4: defaultNumber(entry.unk4, 0),
        fileIndex: entry.fileIndex,
        originalFileIndex: defaultNumber(entry.originalFileIndex, entry.fileIndex),
        fileType: defaultString(fileData.fileType, ".bin"),
        fileUrl,
        fileBaseName: defaultString(fileData.fileBaseName, name),
        filePath: filePathFromFileUrl(motionRoot, fileUrl),
        rawSubFileData: fileData,
        rawStructure: entry,
        rawParse: parseNode,
      };

      if (current.node) current.node.children.push(item);
      else roots.push(item);
      continue;
    }

    if (entry.type === "EndMark") {
      const count = defaultNumber(entry.endMarkCount, 1);
      for (let i = 0; i < count && stack.length > 1; i += 1) {
        stack.pop();
      }
    }
  }

  const flatNodes = flattenNodes(roots);
  const folders = flatNodes.filter((node): node is MotionFolderNode => node.kind === "folder");
  const items = flatNodes.filter((node): node is MotionItemNode => node.kind === "item");

  return {
    motionRoot,
    structureJsonPath,
    rootName,
    project,
    nodes: roots,
    flatNodes,
    folders,
    items,
    summary: {
      totalFiles: items.length,
      folderCount: folders.length,
      linkedItemCount: items.filter((item) => item.link).length,
      linkedFolderCount: folders.filter((folder) => folder.link).length,
      nonZeroUnk1Count: flatNodes.filter((node) => node.unk1 !== "00000000").length,
      nonZeroUnk2Count: flatNodes.filter((node) => node.unk2 !== "00000000").length,
    },
    warnings,
  };
}

function cloneProject(project: MotionStructureProject): MotionStructureProject {
  return structuredClone(project);
}

function collectItems(nodes: MotionStructureNode[]): MotionItemNode[] {
  const out: MotionItemNode[] = [];
  const walk = (items: MotionStructureNode[]) => {
    for (const item of items) {
      if (item.kind === "item") out.push(item);
      else walk(item.children);
    }
  };
  walk(nodes);
  return out;
}

function optimizeEndMarks(entries: MotionSubFileStructureEntry[]): MotionSubFileStructureEntry[] {
  const optimized: MotionSubFileStructureEntry[] = [];
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i]!;
    if (entry.type !== "EndMark") {
      optimized.push(entry);
      continue;
    }
    let count = defaultNumber(entry.endMarkCount, 1);
    let cursor = i + 1;
    while (cursor < entries.length && entries[cursor]?.type === "EndMark") {
      count += defaultNumber((entries[cursor] as MotionSubFileStructureEndMark).endMarkCount, 1);
      cursor += 1;
    }
    optimized.push({ type: "EndMark", endMarkCount: count });
    i = cursor - 1;
  }
  return optimized;
}

function buildParseNode(node: MotionStructureNode, fileIndex: number): MotionParseNode {
  if (node.kind === "item") {
    return {
      ...(node.rawParse ?? {}),
      type: "Item",
      name: String(fileIndex),
      link: node.link,
      unk1: node.unk1,
      unk2: node.unk2,
      unk3: node.unk3,
    };
  }

  return {
    ...(node.rawParse ?? {}),
    type: "Folder",
    name: node.name,
    link: node.link,
    unk1: node.unk1,
    unk2: node.unk2,
    unk3: node.unk3,
    children: node.children.map((child) => buildParseNode(child, child.kind === "item" ? child.fileIndex : -1)),
  };
}

export function serializeMotionProject(
  project: MotionStructureProject,
  nodes: MotionStructureNode[],
  rootName: string,
): MotionStructureProject {
  const nextProject = cloneProject(project);
  const items = collectItems(nodes).sort((a, b) => a.fileIndex - b.fileIndex);
  const fileIndexMap = new Map<number, number>();
  items.forEach((item, index) => {
    fileIndexMap.set(item.fileIndex, index);
  });

  const subFileData = items.map((item) => {
    const nextFileIndex = fileIndexMap.get(item.fileIndex) ?? item.fileIndex;
    const fileUrl = buildFileUrl(rootName, item.pathSegments, item.name);
    return {
      ...item.rawSubFileData,
      index: nextFileIndex,
      fileType: item.fileType || ".bin",
      fileIndex: nextFileIndex,
      fileUrl,
      fileBaseName: item.name,
    };
  });

  const subFileStructure: MotionSubFileStructureEntry[] = [];
  const emit = (branch: MotionStructureNode[]) => {
    for (const node of branch) {
      if (node.kind === "folder") {
        subFileStructure.push({
          ...(node.rawStructure ?? {}),
          type: "Folder",
          Name: node.name,
          unk1: node.unk1,
          folderCount: node.children.length,
          unk2: node.unk2,
          unk2_1: node.unk2_1,
          unk3: node.unk3,
          unk4: node.unk4,
          unk5: node.unk5,
          unk6: node.unk6,
        });
        emit(node.children);
        subFileStructure.push({ type: "EndMark", endMarkCount: 1 });
        continue;
      }

      const nextFileIndex = fileIndexMap.get(node.fileIndex) ?? node.fileIndex;
      subFileStructure.push({
        ...(node.rawStructure ?? {}),
        type: "Item",
        Name: node.name,
        unk1: node.unk1,
        fileIndex: nextFileIndex,
        unk2: node.unk2,
        unk2_1: node.unk2_1,
        unk3: node.unk3,
        unk4: node.unk4,
        originalFileIndex: node.originalFileIndex,
      });
    }
  };
  emit(nodes);

  const parseRoot: MotionParseRoot = {
    ...(nextProject.SubFileParseStructure ?? { name: "Root" }),
    name: nextProject.SubFileParseStructure?.name ?? "Root",
    children: nodes.map((node) => buildParseNode(
      node,
      node.kind === "item" ? fileIndexMap.get(node.fileIndex) ?? node.fileIndex : -1,
    )),
  };

  return {
    ...nextProject,
    Fhm2dTotalCount: subFileData.length,
    SubFileData: subFileData,
    SubFileStructure: optimizeEndMarks(subFileStructure),
    SubFileParseStructure: parseRoot,
  };
}

export function inferMotionFolderStructurePath(motionRoot: string): string {
  const normalized = trimTrailingSeparators(toWindowsPath(motionRoot));
  const parent = parentDir(normalized);
  const name = basename(normalized);
  if (!parent || !name) {
    throw new Error(`Cannot infer structure JSON path from motion root: ${motionRoot}`);
  }
  return `${parent}\\${name}${STRUCTURE_JSON_SUFFIX}`;
}

export async function inspectMotionFolder(
  motionRoot: string,
  structureJsonPath = inferMotionFolderStructurePath(motionRoot),
): Promise<MotionFolderInventory> {
  const raw = await readTextFile(toWindowsPath(structureJsonPath));
  const parsed = JSON.parse(raw) as MotionStructureProject;
  return parseMotionProject(parsed, toWindowsPath(motionRoot), toWindowsPath(structureJsonPath));
}

export async function saveMotionFolderStructure(params: {
  project: MotionStructureProject;
  nodes: MotionStructureNode[];
  rootName: string;
  structureJsonPath: string;
}): Promise<MotionStructureProject> {
  const nextProject = serializeMotionProject(params.project, params.nodes, params.rootName);
  await writeTextFile(toWindowsPath(params.structureJsonPath), `${JSON.stringify(nextProject, null, 2)}\n`);
  return nextProject;
}

function normalizeMotionHexInput(raw: string, fieldName: string): string {
  const trimmed = raw.trim().replace(/^0x/i, "");
  if (!/^[0-9a-fA-F]{8}$/.test(trimmed)) {
    throw new Error(`${fieldName} must be an 8-digit hex value`);
  }
  return trimmed.toLowerCase();
}

export function normalizeMotionUnk1Input(raw: string): string {
  return normalizeMotionHexInput(raw, "unk1");
}

export function normalizeMotionUnk2Input(raw: string): string {
  return normalizeMotionHexInput(raw, "unk2");
}

export function normalizeMotionEntryName(raw: string): string {
  const trimmed = stripMotionExt(raw.trim());
  if (!trimmed) throw new Error("Name is required");
  if (INVALID_NAME_CHARS.test(trimmed)) {
    throw new Error("Name cannot contain path separators or Windows filename characters");
  }
  return trimmed;
}

export function sourcePathToMotionName(sourcePath: string): string {
  return normalizeMotionEntryName(basename(sourcePath));
}

export function getMotionNodeLabel(node: MotionStructureNode): string {
  return node.kind === "folder" ? node.name : `${node.name}${MOTION_EXT}`;
}

export function getMotionNodeParentFolder(
  nodes: MotionStructureNode[],
  nodeId: string | null,
): MotionFolderNode | null {
  if (!nodeId) return null;
  const flat = flattenNodes(nodes);
  const node = flat.find((item) => item.id === nodeId);
  if (!node) return null;
  if (node.kind === "folder") return node;
  return flat.find((item): item is MotionFolderNode => item.kind === "folder" && item.id === node.parentId) ?? null;
}

export function addMotionItemNode(params: {
  nodes: MotionStructureNode[];
  parentFolderId: string;
  sourcePath: string;
  name: string;
  unk1: string;
  unk2: string;
  rootName: string;
  motionRoot: string;
}): { nodes: MotionStructureNode[]; item: MotionItemNode; targetPath: string } {
  const name = normalizeMotionEntryName(params.name);
  const unk1 = normalizeMotionUnk1Input(params.unk1);
  const unk2 = normalizeMotionUnk2Input(params.unk2);
  const items = collectItems(params.nodes);
  const nextFileIndex = items.length > 0 ? Math.max(...items.map((item) => item.fileIndex)) + 1 : 0;
  const parentFolder = flattenNodes(params.nodes).find(
    (node): node is MotionFolderNode => node.kind === "folder" && node.id === params.parentFolderId,
  );
  if (!parentFolder) throw new Error("Parent folder not found");

  const fileUrl = buildFileUrl(params.rootName, parentFolder.pathSegments, name);
  const targetPath = filePathFromFileUrl(params.motionRoot, fileUrl);
  const item: MotionItemNode = {
    id: nextId("item", String(nextFileIndex)),
    kind: "item",
    parentId: parentFolder.id,
    name,
    link: false,
    depth: parentFolder.pathSegments.length,
    pathSegments: [...parentFolder.pathSegments],
    unk1,
    unk2,
    unk2_1: 0,
    unk3: 0,
    unk4: 0,
    fileIndex: nextFileIndex,
    originalFileIndex: nextFileIndex,
    fileType: ".bin",
    fileUrl,
    fileBaseName: name,
    filePath: targetPath,
    rawSubFileData: {
      index: nextFileIndex,
      fileType: ".bin",
      fileIndex: nextFileIndex,
      fileUrl,
      fileBaseName: name,
    },
    rawStructure: null,
    rawParse: null,
  };
  const walk = (branch: MotionStructureNode[]): MotionStructureNode[] => {
    return branch.map((node) => {
      if (node.kind !== "folder") return node;
      if (node.id !== params.parentFolderId) {
        return { ...node, children: walk(node.children) };
      }

      return { ...node, children: [...node.children, item] };
    });
  };

  const nodes = walk(params.nodes);
  return { nodes, item, targetPath: item.filePath };
}

export function updateMotionNode(params: {
  nodes: MotionStructureNode[];
  nodeId: string;
  name: string;
  unk1: string;
  unk2: string;
  rootName: string;
  motionRoot: string;
}): {
  nodes: MotionStructureNode[];
  renamedPaths: Array<{ from: string; to: string }>;
} {
  const name = normalizeMotionEntryName(params.name);
  const unk1 = normalizeMotionUnk1Input(params.unk1);
  const unk2 = normalizeMotionUnk2Input(params.unk2);
  const renamedPaths: Array<{ from: string; to: string }> = [];

  const updateDescendantPaths = (
    branch: MotionStructureNode[],
    oldPrefix: string[],
    newPrefix: string[],
  ): MotionStructureNode[] => {
    return branch.map((node) => {
      if (node.kind === "folder") {
        const nextPath = [...newPrefix, ...node.pathSegments.slice(oldPrefix.length)];
        return {
          ...node,
          pathSegments: nextPath,
          children: updateDescendantPaths(node.children, oldPrefix, newPrefix),
        };
      }
      const nextPath = [...newPrefix, ...node.pathSegments.slice(oldPrefix.length)];
      const nextFileUrl = buildFileUrl(params.rootName, nextPath, node.name);
      return {
        ...node,
        pathSegments: nextPath,
        fileUrl: nextFileUrl,
        filePath: filePathFromFileUrl(params.motionRoot, nextFileUrl),
        rawSubFileData: {
          ...node.rawSubFileData,
          fileUrl: nextFileUrl,
          fileBaseName: node.name,
        },
      };
    });
  };

  const walk = (branch: MotionStructureNode[]): MotionStructureNode[] => {
    return branch.map((node) => {
      if (node.id === params.nodeId) {
        if (node.kind === "item") {
          const nextFileUrl = buildFileUrl(params.rootName, node.pathSegments, name);
          const nextFilePath = filePathFromFileUrl(params.motionRoot, nextFileUrl);
          if (nextFilePath !== node.filePath) {
            renamedPaths.push({ from: node.filePath, to: nextFilePath });
          }
          return {
            ...node,
            name,
            unk1,
            unk2,
            fileUrl: nextFileUrl,
            fileBaseName: name,
            filePath: nextFilePath,
            rawSubFileData: {
              ...node.rawSubFileData,
              fileUrl: nextFileUrl,
              fileBaseName: name,
            },
          };
        }

        const oldPath = node.pathSegments;
        const newPath = [...oldPath.slice(0, -1), name];
        const oldFolderPath = joinWindowsPath(params.motionRoot, oldPath);
        const newFolderPath = joinWindowsPath(params.motionRoot, newPath);
        if (oldFolderPath !== newFolderPath) {
          renamedPaths.push({ from: oldFolderPath, to: newFolderPath });
        }
        return {
          ...node,
          name,
          unk1,
          unk2,
          pathSegments: newPath,
          children: updateDescendantPaths(node.children, oldPath, newPath),
        };
      }

      if (node.kind === "folder") {
        return { ...node, children: walk(node.children) };
      }
      return node;
    });
  };

  return { nodes: walk(params.nodes), renamedPaths };
}

export function removeMotionNode(
  nodes: MotionStructureNode[],
  nodeId: string,
): { nodes: MotionStructureNode[]; removed: MotionStructureNode | null } {
  let removed: MotionStructureNode | null = null;
  const walk = (branch: MotionStructureNode[]): MotionStructureNode[] => {
    const next: MotionStructureNode[] = [];
    for (const node of branch) {
      if (node.id === nodeId) {
        removed = node;
        continue;
      }
      if (node.kind === "folder") {
        next.push({ ...node, children: walk(node.children) });
      } else {
        next.push(node);
      }
    }
    return next;
  };
  return { nodes: walk(nodes), removed };
}

export async function copyMotionSourceToItem(
  sourcePath: string,
  targetPath: string,
  options?: { overwrite?: boolean },
): Promise<void> {
  const normalizedSource = toWindowsPath(sourcePath);
  if (!normalizedSource.toLowerCase().endsWith(MOTION_EXT)) {
    throw new Error("Only .nuanmb files are supported for now");
  }
  const normalizedTarget = toWindowsPath(targetPath);
  if (!options?.overwrite && (await exists(normalizedTarget))) {
    throw new Error(`Target already exists: ${normalizedTarget}`);
  }
  await invoke("copy_file_to_path", {
    sourcePath: normalizedSource,
    targetPath: normalizedTarget,
    overwrite: options?.overwrite ?? false,
  });
}

export async function replaceMotionItemFile(sourcePath: string, item: MotionItemNode): Promise<void> {
  await copyMotionSourceToItem(sourcePath, item.filePath, { overwrite: true });
}

export async function renameMotionDiskPaths(paths: Array<{ from: string; to: string }>): Promise<void> {
  for (const path of paths) {
    const from = toWindowsPath(path.from);
    const to = toWindowsPath(path.to);
    if (from === to) continue;
    if (!(await exists(from))) continue;
    const targetDir = parentDir(to);
    if (targetDir && !(await exists(targetDir))) {
      await mkdir(targetDir, { recursive: true });
    }
    if (await exists(to)) {
      throw new Error(`Target already exists: ${to}`);
    }
    await rename(from, to);
  }
}

export async function deleteMotionNodeFiles(node: MotionStructureNode, motionRoot: string): Promise<void> {
  if (node.kind === "folder") {
    const folderPath = joinWindowsPath(motionRoot, node.pathSegments);
    if (await exists(folderPath)) {
      await remove(folderPath, { recursive: true });
    }
    return;
  }
  if (await exists(node.filePath)) {
    await remove(node.filePath);
  }
}

export function motionNodeMatchesQuery(node: MotionStructureNode, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const fields = [
    node.name,
    node.unk2,
    node.unk1,
    node.kind,
    node.pathSegments.join("/"),
    node.kind === "item" ? String(node.fileIndex) : "",
    node.kind === "item" ? node.fileUrl : "",
  ];
  return fields.some((field) => field.toLowerCase().includes(q));
}
