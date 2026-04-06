import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  DEFAULT_FILE_TREE_VIEW_OPTIONS,
  type FileTreeViewOptions,
} from "../utils/fileTreeViewSort";
import { normalizePathForStar } from "../utils/fileTreeStars";

const STORAGE_PREFIX = "testEditor.fileTreeViewOptions:v1:";

function storageKey(workspaceRoot: string): string {
  return STORAGE_PREFIX + normalizePathForStar(workspaceRoot);
}

function isSortBy(v: unknown): v is FileTreeViewOptions["sortBy"] {
  return v === "name" || v === "dateModified" || v === "type" || v === "size";
}

function isDirection(v: unknown): v is FileTreeViewOptions["direction"] {
  return v === "asc" || v === "desc";
}

function isGroupBy(v: unknown): v is FileTreeViewOptions["groupBy"] {
  return v === "none" || v === "type" || v === "dateModified";
}

function parseStored(raw: unknown): FileTreeViewOptions {
  if (!raw || typeof raw !== "object") return DEFAULT_FILE_TREE_VIEW_OPTIONS;
  const o = raw as Record<string, unknown>;
  const sortBy = isSortBy(o.sortBy) ? o.sortBy : DEFAULT_FILE_TREE_VIEW_OPTIONS.sortBy;
  const direction = isDirection(o.direction) ? o.direction : DEFAULT_FILE_TREE_VIEW_OPTIONS.direction;
  const groupBy = isGroupBy(o.groupBy) ? o.groupBy : DEFAULT_FILE_TREE_VIEW_OPTIONS.groupBy;
  const foldersOnTop =
    typeof o.foldersOnTop === "boolean" ? o.foldersOnTop : DEFAULT_FILE_TREE_VIEW_OPTIONS.foldersOnTop;
  return { sortBy, direction, groupBy, foldersOnTop };
}

export function useFileTreeViewOptions(workspaceRoot: string | undefined) {
  const [viewOptions, setViewOptionsState] = useState<FileTreeViewOptions>(DEFAULT_FILE_TREE_VIEW_OPTIONS);

  useEffect(() => {
    if (!workspaceRoot?.trim()) {
      setViewOptionsState(DEFAULT_FILE_TREE_VIEW_OPTIONS);
      return;
    }
    try {
      const raw = localStorage.getItem(storageKey(workspaceRoot));
      if (!raw) {
        setViewOptionsState(DEFAULT_FILE_TREE_VIEW_OPTIONS);
        return;
      }
      setViewOptionsState(parseStored(JSON.parse(raw)));
    } catch (e) {
      console.error(e);
      const message = e instanceof Error ? e.message : String(e);
      toast.error(message ? `File tree view options: ${message}` : "File tree view options failed to load");
      setViewOptionsState(DEFAULT_FILE_TREE_VIEW_OPTIONS);
    }
  }, [workspaceRoot]);

  const setViewOptions = useCallback(
    (patch: Partial<FileTreeViewOptions>) => {
      if (!workspaceRoot?.trim()) {
        toast.error("No workspace root selected");
        return;
      }
      setViewOptionsState((prev) => {
        const next: FileTreeViewOptions = { ...prev, ...patch };
        try {
          localStorage.setItem(storageKey(workspaceRoot), JSON.stringify(next));
        } catch (e) {
          console.error(e);
          const message = e instanceof Error ? e.message : String(e);
          toast.error(message ? `Failed to save view options: ${message}` : "Failed to save view options");
          return prev;
        }
        return next;
      });
    },
    [workspaceRoot]
  );

  return { viewOptions, setViewOptions };
}
