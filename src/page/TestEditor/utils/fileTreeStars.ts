import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { TestTreeNode } from "../types";

const STORAGE_PREFIX = "testEditor.fileTree.starOrder:";

export function normalizePathForStar(path: string): string {
  return path.replace(/\\/g, "/").toLowerCase();
}

function storageKey(workspaceRoot: string): string {
  return STORAGE_PREFIX + normalizePathForStar(workspaceRoot);
}

export function loadFileTreeStarOrder(workspaceRoot: string): string[] {
  if (!workspaceRoot.trim()) return [];
  const raw = localStorage.getItem(storageKey(workspaceRoot));
  if (!raw) return [];
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed) || !parsed.every((x) => typeof x === "string")) {
    throw new Error("Invalid file tree star order in storage");
  }
  return parsed;
}

export function saveFileTreeStarOrder(workspaceRoot: string, order: string[]): void {
  if (!workspaceRoot.trim()) {
    throw new Error("Workspace root is required to save star order");
  }
  localStorage.setItem(storageKey(workspaceRoot), JSON.stringify(order));
}

/**
 * Reorders siblings so starred paths (per starOrder) come first. O(1) when starOrder is empty.
 * Builds path rank map once; avoids allocating new trees when nothing changes.
 */
export function sortTreeByStarOrder(nodes: TestTreeNode[], starOrder: string[]): TestTreeNode[] {
  if (nodes.length === 0 || starOrder.length === 0) return nodes;

  const rank = new Map<string, number>();
  for (let i = 0; i < starOrder.length; i++) {
    rank.set(normalizePathForStar(starOrder[i]), i);
  }
  return sortTreeNodesWithRank(nodes, rank);
}

function sortTreeNodesWithRank(nodes: TestTreeNode[], rank: Map<string, number>): TestTreeNode[] {
  if (nodes.length === 0) return nodes;

  const starred: TestTreeNode[] = [];
  const nonStarred: TestTreeNode[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (rank.has(normalizePathForStar(n.path))) starred.push(n);
    else nonStarred.push(n);
  }

  if (starred.length > 1) {
    starred.sort(
      (a, b) =>
        (rank.get(normalizePathForStar(a.path)) ?? 0) - (rank.get(normalizePathForStar(b.path)) ?? 0)
    );
  }

  const reorderedSiblings = starred.length > 0;
  const ordered = reorderedSiblings ? [...starred, ...nonStarred] : nodes;

  if (!reorderedSiblings) {
    let anyChildChanged = false;
    const nextNodes: TestTreeNode[] = new Array(nodes.length);
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const kids = n.children;
      if (!kids?.length) {
        nextNodes[i] = n;
        continue;
      }
      const nk = sortTreeNodesWithRank(kids, rank);
      if (nk !== kids) {
        anyChildChanged = true;
        nextNodes[i] = { ...n, children: nk };
      } else {
        nextNodes[i] = n;
      }
    }
    return anyChildChanged ? nextNodes : nodes;
  }

  const result: TestTreeNode[] = new Array(ordered.length);
  for (let i = 0; i < ordered.length; i++) {
    const n = ordered[i];
    const kids = n.children;
    if (!kids?.length) {
      result[i] = n;
      continue;
    }
    const nextKids = sortTreeNodesWithRank(kids, rank);
    result[i] = nextKids !== kids ? { ...n, children: nextKids } : n;
  }
  return result;
}

export function useFileTreeStarOrder(workspaceRoot: string | undefined) {
  const [starOrder, setStarOrder] = useState<string[]>([]);

  useEffect(() => {
    if (!workspaceRoot?.trim()) {
      setStarOrder([]);
      return;
    }
    try {
      setStarOrder(loadFileTreeStarOrder(workspaceRoot));
    } catch (e) {
      console.error(e);
      const message = e instanceof Error ? e.message : String(e);
      toast.error(message ? `Star list: ${message}` : "Star list failed to load");
      setStarOrder([]);
    }
  }, [workspaceRoot]);

  const toggleStar = useCallback(
    (path: string) => {
      if (!workspaceRoot?.trim()) {
        toast.error("No workspace root selected");
        return;
      }
      setStarOrder((prev) => {
        const key = normalizePathForStar(path);
        const idx = prev.findIndex((p) => normalizePathForStar(p) === key);
        const next = idx >= 0 ? prev.filter((_, i) => i !== idx) : [...prev, path];
        try {
          saveFileTreeStarOrder(workspaceRoot, next);
        } catch (e) {
          console.error(e);
          const message = e instanceof Error ? e.message : String(e);
          toast.error(message ? `Failed to save stars: ${message}` : "Failed to save stars");
          return prev;
        }
        return next;
      });
    },
    [workspaceRoot]
  );

  const starredPathSet = useMemo(() => {
    const s = new Set<string>();
    starOrder.forEach((p) => s.add(normalizePathForStar(p)));
    return s;
  }, [starOrder]);

  return { starOrder, toggleStar, starredPathSet };
}
