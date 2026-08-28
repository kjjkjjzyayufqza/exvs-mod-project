import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { normalizePathForStar } from "../utils/fileTreeStars";

const STORAGE_PREFIX = "testEditor.fileTreeSearch:v1:";

function storageKey(workspaceRoot: string): string {
  return STORAGE_PREFIX + normalizePathForStar(workspaceRoot);
}

/**
 * File-tree search box text, persisted per workspace root.
 *
 * The workspace page stays mounted across sidebar navigation, so this only
 * matters for a full remount: window reload, Vite hot reload, or app restart.
 * Stored per root so switching workspaces does not carry a stale filter over.
 */
export function useFileTreeSearchTerm(workspaceRoot: string | undefined) {
  const [searchTerm, setSearchTermState] = useState("");

  useEffect(() => {
    if (!workspaceRoot?.trim()) {
      setSearchTermState("");
      return;
    }
    try {
      setSearchTermState(localStorage.getItem(storageKey(workspaceRoot)) ?? "");
    } catch (e) {
      console.error(e);
      const message = e instanceof Error ? e.message : String(e);
      toast.error(message ? `File tree search: ${message}` : "File tree search failed to load");
      setSearchTermState("");
    }
  }, [workspaceRoot]);

  const setSearchTerm = useCallback(
    (value: string) => {
      setSearchTermState(value);
      if (!workspaceRoot?.trim()) return;
      try {
        localStorage.setItem(storageKey(workspaceRoot), value);
      } catch (e) {
        console.error(e);
        const message = e instanceof Error ? e.message : String(e);
        toast.error(message ? `Failed to save search: ${message}` : "Failed to save search");
      }
    },
    [workspaceRoot],
  );

  return { searchTerm, setSearchTerm };
}
