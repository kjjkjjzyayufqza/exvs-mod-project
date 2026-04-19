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

export type ConcurrencySettledSuccess<TItem, TValue> = {
  index: number;
  item: TItem;
  value: TValue;
};

export type ConcurrencySettledFailure<TItem> = {
  index: number;
  item: TItem;
  error: unknown;
};

export type ConcurrencySettledResult<TItem, TValue> = {
  successes: Array<ConcurrencySettledSuccess<TItem, TValue>>;
  failures: Array<ConcurrencySettledFailure<TItem>>;
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

  const collectRows = (
    node: Fhm2dVirtualTreeNode,
    depth: number,
  ): FlattenedVirtualTreeRow[] | null => {
    const nestedChildRows: FlattenedVirtualTreeRow[][] = [];
    let childIncluded = false;
    for (const child of node.children) {
      const childRows = collectRows(child, depth + 1);
      if (childRows) {
        childIncluded = true;
        nestedChildRows.push(childRows);
      }
    }
    const includeSelf = nodeMatches(node) || childIncluded;
    if (!includeSelf) {
      return null;
    }
    const nextRows: FlattenedVirtualTreeRow[] = [{ node, depth }];
    if (node.kind === "folder" && !collapsedFolderIds.has(node.id)) {
      for (const childRows of nestedChildRows) {
        nextRows.push(...childRows);
      }
    }
    return nextRows;
  };

  for (const node of tree) {
    const nestedRows = collectRows(node, 0);
    if (nestedRows) {
      rows.push(...nestedRows);
    }
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

export async function settleWithConcurrencyLimit<TItem, TValue>(
  items: readonly TItem[],
  concurrency: number,
  worker: (item: TItem, index: number) => Promise<TValue>,
  onSettled?: (update: {
    index: number;
    item: TItem;
    completed: number;
    total: number;
    status: "fulfilled" | "rejected";
  }) => void,
): Promise<ConcurrencySettledResult<TItem, TValue>> {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error(`concurrency must be a positive integer, got ${concurrency}`);
  }

  const successes: Array<ConcurrencySettledSuccess<TItem, TValue> | null> = new Array(items.length).fill(null);
  const failures: Array<ConcurrencySettledFailure<TItem>> = [];
  let nextIndex = 0;
  let completed = 0;

  const runWorker = async () => {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= items.length) {
        return;
      }
      const item = items[currentIndex] as TItem;
      try {
        const value = await worker(item, currentIndex);
        successes[currentIndex] = { index: currentIndex, item, value };
        completed += 1;
        onSettled?.({
          index: currentIndex,
          item,
          completed,
          total: items.length,
          status: "fulfilled",
        });
      } catch (error) {
        failures.push({ index: currentIndex, item, error });
        completed += 1;
        onSettled?.({
          index: currentIndex,
          item,
          completed,
          total: items.length,
          status: "rejected",
        });
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker()),
  );

  return {
    successes: successes.filter((entry): entry is ConcurrencySettledSuccess<TItem, TValue> => entry !== null),
    failures,
  };
}
