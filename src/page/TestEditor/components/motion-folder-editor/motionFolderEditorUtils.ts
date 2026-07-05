import { classifyWorkspacePackPath } from "@/services/testEditorWorkspace/packIdentity";
import type { TestEditorWorkspaceDocument, WorkspacePackIdentity } from "@/services/testEditorWorkspace/types";
import type { TreeDataItem } from "@/lib/utils";
import {
  getMotionNodeLabel,
  inferMotionFolderStructurePath,
  motionNodeMatchesQuery,
  MOTION_EXT,
  type MotionFolderNode,
  type MotionStructureNode,
} from "@/services/motionFolder/motionFolderService";
import { resolveMigratedFhm2dFolderPath } from "@/utils/fhm2dFolderPathResolution";
import { STRUCTURE_JSON_SUFFIX } from "../fileTreeNodeRowUtils";

export function motionStructureBaseNameFromJsonPath(jsonPath: string): string | null {
  const normalized = jsonPath.replace(/\\/g, "/");
  const fileName = normalized.split("/").pop() ?? "";
  const lower = fileName.toLowerCase();
  if (!lower.endsWith(STRUCTURE_JSON_SUFFIX)) return null;
  const base = fileName.slice(0, fileName.length - STRUCTURE_JSON_SUFFIX.length);
  return base || null;
}

export function motionParentDirOf(path: string): string | null {
  const trimmed = path.replace(/[\\/]+$/, "");
  const lastSlash = trimmed.lastIndexOf("/");
  const lastBackslash = trimmed.lastIndexOf("\\");
  const idx = Math.max(lastSlash, lastBackslash);
  if (idx < 0) return null;
  const parent = trimmed.slice(0, idx);
  if (/^[a-zA-Z]:$/.test(parent)) return `${parent}\\`;
  if (parent === "" && trimmed.startsWith("/")) return "/";
  return parent;
}

export function resolveMotionPackFromStructureJson(
  workspaceRoot: string,
  structureJsonPath: string | null | undefined,
  document: TestEditorWorkspaceDocument,
): WorkspacePackIdentity | null {
  if (!workspaceRoot.trim() || !structureJsonPath?.trim()) return null;
  const baseName = motionStructureBaseNameFromJsonPath(structureJsonPath);
  if (!baseName) return null;
  const parentPath = motionParentDirOf(structureJsonPath);
  if (!parentPath) return null;
  const separator = parentPath.includes("\\") ? "\\" : "/";
  const folderPath = `${parentPath.replace(/[\\/]+$/, "")}${separator}${baseName}`;
  const identity = classifyWorkspacePackPath({
    workspaceRoot,
    nodePath: folderPath,
    nodeIsDirectory: true,
    document,
  });
  if (!identity || identity.routeId !== "unit.motion") return null;
  return identity;
}

export function resolveMotionPackFromFolderPath(
  workspaceRoot: string,
  folderPath: string,
  document: TestEditorWorkspaceDocument,
): WorkspacePackIdentity | null {
  const trimmed = folderPath.trim();
  if (!trimmed) return null;
  const identity = classifyWorkspacePackPath({
    workspaceRoot,
    nodePath: trimmed,
    nodeIsDirectory: true,
    document,
  });
  if (identity?.routeId === "unit.motion") {
    return {
      ...identity,
      folderPath: trimmed,
      structureJsonPath: inferMotionFolderStructurePath(trimmed),
    };
  }

  const normalized = trimmed.replace(/[\\/]+$/, "");
  const hashFolderName = normalized.split(/[\\/]/).filter(Boolean).pop() ?? normalized;
  const route = document.assetRoutes["unit.motion"];
  const prefix = route?.prefix ?? "003motion";
  return {
    packKey: `${prefix}/${hashFolderName}`,
    routeId: "unit.motion",
    prefix,
    hashFolderName,
    folderPath: trimmed,
    structureJsonPath: inferMotionFolderStructurePath(trimmed),
    sourceLayout: "configured",
  };
}

export async function resolveMotionPackFromFolderPathAsync(
  workspaceRoot: string,
  folderPath: string,
  document: TestEditorWorkspaceDocument,
): Promise<WorkspacePackIdentity | null> {
  const remappedFolderPath = await resolveMigratedFhm2dFolderPath(folderPath);
  return resolveMotionPackFromFolderPath(workspaceRoot, remappedFolderPath, document);
}

export function flattenMotionNodes(nodes: MotionStructureNode[]): MotionStructureNode[] {
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

export function motionNodeDepthPadding(node: MotionStructureNode): string {
  return `${Math.min(node.depth, 8) * 14}px`;
}

export type MotionInventoryCategory = "folders" | "items";

export function motionListItemKey(node: MotionStructureNode): string {
  return node.id;
}

export function motionListItemLabel(node: MotionStructureNode): string {
  return getMotionNodeLabel(node);
}

export function motionListItemSubtitle(node: MotionStructureNode): string {
  if (node.kind === "folder") {
    return `${node.children.length} child node(s) / unk1 ${node.unk1} / unk2 ${node.unk2}`;
  }
  return `fileIndex ${node.fileIndex} / unk1 ${node.unk1} / unk2 ${node.unk2}`;
}

export function motionListItemPath(node: MotionStructureNode): string {
  const segments = node.pathSegments.join("\\");
  if (node.kind === "item") {
    return `${segments}\\${node.name}${MOTION_EXT}`;
  }
  return segments || node.name;
}

export function filterMotionListNodes(
  nodes: MotionStructureNode[],
  category: MotionInventoryCategory | "all",
  query: string,
): MotionStructureNode[] {
  const byCategory =
    category === "all"
      ? nodes
      : nodes.filter((node) => (category === "folders" ? node.kind === "folder" : node.kind === "item"));
  return byCategory.filter((node) => motionNodeMatchesQuery(node, query));
}

export function countMotionNodesByCategory(
  nodes: MotionStructureNode[],
): Record<MotionInventoryCategory | "all", number> {
  const counts: Record<MotionInventoryCategory | "all", number> = {
    all: nodes.length,
    folders: 0,
    items: 0,
  };
  for (const node of nodes) {
    if (node.kind === "folder") counts.folders += 1;
    else counts.items += 1;
  }
  return counts;
}

function motionNodeToTreeDataItem(node: MotionStructureNode): TreeDataItem {
  if (node.kind === "folder") {
    const folder = node as MotionFolderNode;
    return {
      id: folder.id,
      name: folder.name,
      children: folder.children.map(motionNodeToTreeDataItem),
      data: {
        type: "Folder",
        folderCount: folder.children.length,
        link: folder.link,
        unk1: folder.unk1,
        unk2: folder.unk2,
        unk2_1: folder.unk2_1,
        unk3: folder.unk3,
        unk4: folder.unk4,
        unk5: folder.unk5,
        unk6: folder.unk6,
      },
    };
  }

  return {
    id: node.id,
    name: getMotionNodeLabel(node),
    data: {
      type: "Item",
      fileIndex: node.fileIndex,
      fileType: MOTION_EXT,
      fileUrl: node.fileUrl,
      originalFileIndex: node.originalFileIndex,
      link: node.link,
      unk1: node.unk1,
      unk2: node.unk2,
      unk2_1: node.unk2_1,
      unk3: node.unk3,
      unk4: node.unk4,
    },
  };
}

export function motionNodesToTreeData(nodes: MotionStructureNode[]): TreeDataItem[] {
  return nodes.map(motionNodeToTreeDataItem);
}

export function motionTreeSearchMatch(node: TreeDataItem, term: string): boolean {
  const q = term.trim().toLowerCase();
  if (!q) return true;
  const fields = [
    node.name,
    node.data?.unk1,
    node.data?.unk2,
    node.data?.type,
    node.data?.fileIndex != null ? String(node.data.fileIndex) : "",
    node.data?.fileUrl,
  ];
  return fields.some((field) => typeof field === "string" && field.toLowerCase().includes(q));
}
