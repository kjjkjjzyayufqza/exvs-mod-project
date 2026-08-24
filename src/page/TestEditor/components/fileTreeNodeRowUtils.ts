import { classifyWorkspacePackPath } from "@/services/testEditorWorkspace/packIdentity";
import type { TestEditorWorkspaceDocument, WorkspacePackIdentity } from "@/services/testEditorWorkspace/types";
import type { TestTreeNode } from "../types";

export const STRUCTURE_JSON_SUFFIX = "_structure.json";

export function normalizeStructureJsonPathKey(path: string): string {
  return path.trim().replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

function structureBaseName(fileName: string): string | null {
  const lower = fileName.toLowerCase();
  if (!lower.endsWith(STRUCTURE_JSON_SUFFIX)) return null;
  const base = fileName.slice(0, fileName.length - STRUCTURE_JSON_SUFFIX.length);
  return base || null;
}

export function parseWorkspacePackNodeTarget(
  node: TestTreeNode,
  workspaceRoot: string | undefined,
  document: TestEditorWorkspaceDocument,
  structureJsonPathKeys?: ReadonlySet<string>,
): WorkspacePackIdentity | null {
  if (!workspaceRoot) return null;

  if (node.isDir) {
    const identity = classifyWorkspacePackPath({
      workspaceRoot,
      nodePath: node.path,
      nodeIsDirectory: true,
      document,
      structureJsonPathKeys,
    });
    if (!identity) return null;
    return normalizeStructureJsonPathKey(identity.folderPath) === normalizeStructureJsonPathKey(node.path)
      ? identity
      : null;
  }

  if (!structureBaseName(node.name)) return null;
  const identity = classifyWorkspacePackPath({
    workspaceRoot,
    nodePath: node.path,
    nodeIsDirectory: false,
    document,
    structureJsonPathKeys,
  });
  if (!identity) return null;
  return normalizeStructureJsonPathKey(identity.structureJsonPath) === normalizeStructureJsonPathKey(node.path)
    ? identity
    : null;
}

export function collectStructureJsonPathKeys(nodes: TestTreeNode[]): Set<string> {
  const out = new Set<string>();
  const visit = (items: TestTreeNode[]) => {
    items.forEach((node) => {
      if (!node.isDir && node.name.toLowerCase().endsWith(STRUCTURE_JSON_SUFFIX)) {
        out.add(normalizeStructureJsonPathKey(node.path));
      }
      if (node.children?.length) {
        visit(node.children);
      }
    });
  };
  visit(nodes);
  return out;
}
