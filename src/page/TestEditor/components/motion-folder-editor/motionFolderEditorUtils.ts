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

/**
 * Structure JSON stores motion/action/model ids as 8 lowercase hex chars in on-disk
 * little-endian byte order (e.g. "a621fd5e").
 * MSC C sources and runtime hashes use the integer value, which is the byte-swapped form
 * (e.g. 0x5efd21a6). UI may toggle which spelling is shown; storage stays LE.
 */
export type MotionHexDisplayEndian = "le" | "be";

export function normalizeMotionHex8(raw: string): string | null {
  const trimmed = raw.trim().replace(/^0x/i, "").toLowerCase();
  if (!/^[0-9a-f]{8}$/.test(trimmed)) return null;
  return trimmed;
}

/** Reverse byte pairs of an 8-digit hex string (a621fd5e ↔ 5efd21a6). */
export function swapMotionHex8Bytes(hex8: string): string {
  const normalized = normalizeMotionHex8(hex8);
  if (!normalized) return hex8.trim().replace(/^0x/i, "").toLowerCase();
  return (
    normalized.slice(6, 8) +
    normalized.slice(4, 6) +
    normalized.slice(2, 4) +
    normalized.slice(0, 2)
  );
}

/** Format structure-stored LE hex for UI (LE = as stored, BE = MSC-style integer spelling). */
export function formatMotionStoredHexForDisplay(
  storedLe: string,
  endian: MotionHexDisplayEndian,
): string {
  const normalized = normalizeMotionHex8(storedLe);
  if (!normalized) return storedLe.trim().replace(/^0x/i, "").toLowerCase();
  return endian === "le" ? normalized : swapMotionHex8Bytes(normalized);
}

/**
 * Parse UI hex text into structure-stored LE form.
 * - le: digits as typed are storage
 * - be: digits are MSC-style; store the byte-swapped LE dump
 */
export function parseMotionHexDisplayToStored(
  display: string,
  endian: MotionHexDisplayEndian,
): string {
  const normalized = normalizeMotionHex8(display);
  if (!normalized) {
    throw new Error("Value must be an 8-digit hex id (optional 0x prefix)");
  }
  return endian === "le" ? normalized : swapMotionHex8Bytes(normalized);
}

export function motionHexDisplayLabel(endian: MotionHexDisplayEndian): string {
  return endian === "le" ? "LE (structure)" : "BE (MSC value)";
}

export function motionHexMatchesQuery(storedLe: string, queryLower: string): boolean {
  const normalized = normalizeMotionHex8(storedLe);
  if (!normalized) return storedLe.toLowerCase().includes(queryLower);
  if (normalized.includes(queryLower)) return true;
  return swapMotionHex8Bytes(normalized).includes(queryLower);
}

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

export function motionListItemSubtitle(
  node: MotionStructureNode,
  endian: MotionHexDisplayEndian = "le",
): string {
  const unk1 = formatMotionStoredHexForDisplay(node.unk1, endian);
  const unk2 = formatMotionStoredHexForDisplay(node.unk2, endian);
  if (node.kind === "folder") {
    return `${node.children.length} child node(s) / unk1 ${unk1} / unk2 ${unk2}`;
  }
  return `fileIndex ${node.fileIndex} / unk1 ${unk1} / unk2 ${unk2}`;
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
  if (typeof node.name === "string" && node.name.toLowerCase().includes(q)) return true;
  if (typeof node.data?.type === "string" && node.data.type.toLowerCase().includes(q)) return true;
  if (node.data?.fileIndex != null && String(node.data.fileIndex).includes(q)) return true;
  if (typeof node.data?.fileUrl === "string" && node.data.fileUrl.toLowerCase().includes(q)) return true;
  if (typeof node.data?.unk1 === "string" && motionHexMatchesQuery(node.data.unk1, q)) return true;
  if (typeof node.data?.unk2 === "string" && motionHexMatchesQuery(node.data.unk2, q)) return true;
  return false;
}
