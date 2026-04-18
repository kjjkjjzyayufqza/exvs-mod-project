import type {
  Fhm2dPreviewCandidate,
  Fhm2dVirtualEntry,
  Fhm2dVirtualTreeNode,
} from "./fhm2dMemoryPreviewTypes";

export function indexVirtualTreeEntries(
  tree: readonly Fhm2dVirtualTreeNode[],
): Record<string, Fhm2dVirtualEntry> {
  const out: Record<string, Fhm2dVirtualEntry> = {};
  const visit = (node: Fhm2dVirtualTreeNode) => {
    out[node.id] = {
      id: node.id,
      kind: node.kind,
      name: node.name,
      virtualPath: node.virtualPath,
      relativePath: node.relativePath,
      parentRelativePath: node.parentRelativePath,
      fileIndex: node.fileIndex,
      fileType: node.fileType,
      size: node.size,
      childCount: node.childCount,
      isModelRelated: node.isModelRelated,
      hasReferenceIssue: node.hasReferenceIssue,
      selectedCandidate: node.selectedCandidate,
    };
    for (const child of node.children) {
      visit(child);
    }
  };
  for (const root of tree) {
    visit(root);
  }
  return out;
}

export type FlattenedVirtualTreeRow = {
  node: Fhm2dVirtualTreeNode;
  depth: number;
};

export function flattenVirtualTree(
  tree: Fhm2dVirtualTreeNode[],
  collapsedFolderIds: ReadonlySet<string>,
  searchText: string,
  modelRelatedOnly: boolean,
): FlattenedVirtualTreeRow[] {
  const query = searchText.trim().toLowerCase();
  const rows: FlattenedVirtualTreeRow[] = [];

  const nodeMatches = (node: Fhm2dVirtualTreeNode): boolean => {
    if (modelRelatedOnly && !node.isModelRelated) {
      return false;
    }
    if (!query) {
      return true;
    }
    return (
      node.name.toLowerCase().includes(query) ||
      node.relativePath.toLowerCase().includes(query) ||
      node.fileType?.toLowerCase().includes(query) === true
    );
  };

  const includeNode = (node: Fhm2dVirtualTreeNode): boolean => {
    if (nodeMatches(node)) {
      return true;
    }
    return node.children.some(includeNode);
  };

  const visit = (node: Fhm2dVirtualTreeNode, depth: number) => {
    if (!includeNode(node)) {
      return;
    }
    rows.push({ node, depth });
    if (node.kind === "folder" && !collapsedFolderIds.has(node.id)) {
      for (const child of node.children) {
        visit(child, depth + 1);
      }
    }
  };

  for (const node of tree) {
    visit(node, 0);
  }
  return rows;
}

export function groupPreviewCandidatesByFolder(
  candidates: readonly Fhm2dPreviewCandidate[],
): Array<{
  folderRelativePath: string;
  folderVirtualPath: string;
  candidates: Fhm2dPreviewCandidate[];
  completeCount: number;
}> {
  const byFolder = new Map<
    string,
    {
      folderRelativePath: string;
      folderVirtualPath: string;
      candidates: Fhm2dPreviewCandidate[];
      completeCount: number;
    }
  >();
  for (const candidate of candidates) {
    const existing = byFolder.get(candidate.folderRelativePath);
    if (existing) {
      existing.candidates.push(candidate);
      if (candidate.complete) {
        existing.completeCount += 1;
      }
      continue;
    }
    byFolder.set(candidate.folderRelativePath, {
      folderRelativePath: candidate.folderRelativePath,
      folderVirtualPath: candidate.folderVirtualPath,
      candidates: [candidate],
      completeCount: candidate.complete ? 1 : 0,
    });
  }
  return [...byFolder.values()].sort((a, b) => a.folderRelativePath.localeCompare(b.folderRelativePath));
}

export function toggleCandidateGroupSelection(
  previous: ReadonlySet<string>,
  candidates: readonly Fhm2dPreviewCandidate[],
  checked: boolean,
): Set<string> {
  const next = new Set(previous);
  for (const candidate of candidates) {
    if (checked) {
      next.add(candidate.id);
    } else {
      next.delete(candidate.id);
    }
  }
  return next;
}
