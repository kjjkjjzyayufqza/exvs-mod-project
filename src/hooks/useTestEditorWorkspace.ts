import { useCallback, useEffect, useRef, useState } from "react";
import { join } from "@tauri-apps/api/path";
import {
  loadTestEditorWorkspace,
  saveTestEditorWorkspace,
} from "@/services/testEditorWorkspace/persistence";
import {
  type TestEditorWorkspaceDocument,
  type WorkspaceValidationIssue,
} from "@/services/testEditorWorkspace/types";
import { normalizeWorkspacePrefix, parseWorkspaceDocument } from "@/services/testEditorWorkspace/validation";

export interface UseTestEditorWorkspaceResult {
  workspaceRoot: string;
  document: TestEditorWorkspaceDocument;
  source: "defaults" | "workspace";
  issues: WorkspaceValidationIssue[];
  routeRoots: Record<string, string>;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  reload(): Promise<void>;
  save(document: TestEditorWorkspaceDocument): Promise<void>;
}

const DEFAULT_PARSED_WORKSPACE = parseWorkspaceDocument();

async function resolveRouteRoot(workspaceRoot: string, prefix: string): Promise<string> {
  const normalizedPrefix = normalizeWorkspacePrefix(prefix);
  if (!normalizedPrefix) return workspaceRoot;
  return join(workspaceRoot, ...normalizedPrefix.split("/"));
}

export function useTestEditorWorkspace(
  workspaceRoot: string | null | undefined,
): UseTestEditorWorkspaceResult {
  const resolvedWorkspaceRoot = workspaceRoot ?? "";
  const loadSequenceRef = useRef(0);
  const [document, setDocument] = useState<TestEditorWorkspaceDocument>(
    DEFAULT_PARSED_WORKSPACE.document,
  );
  const [source, setSource] = useState<"defaults" | "workspace">(
    DEFAULT_PARSED_WORKSPACE.source,
  );
  const [issues, setIssues] = useState<WorkspaceValidationIssue[]>(
    DEFAULT_PARSED_WORKSPACE.issues,
  );
  const [routeRoots, setRouteRoots] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const sequence = ++loadSequenceRef.current;
    setIsLoading(true);
    setError(null);

    try {
      const loaded = resolvedWorkspaceRoot.trim()
        ? await loadTestEditorWorkspace(resolvedWorkspaceRoot)
        : parseWorkspaceDocument();
      if (sequence !== loadSequenceRef.current) {
        return;
      }
      setDocument(loaded.document);
      setSource(loaded.source);
      setIssues(loaded.issues);
    } catch (err) {
      if (sequence !== loadSequenceRef.current) {
        return;
      }
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (sequence === loadSequenceRef.current) {
        setIsLoading(false);
      }
    }
  }, [resolvedWorkspaceRoot]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    let cancelled = false;
    const resolveRouteRoots = async () => {
      if (!resolvedWorkspaceRoot.trim()) {
        setRouteRoots({});
        return;
      }

      try {
        const entries = await Promise.all(
          Object.entries(document.assetRoutes).map(async ([routeId, route]) => [
            routeId,
            await resolveRouteRoot(resolvedWorkspaceRoot, route.prefix),
          ] as const),
        );
        if (!cancelled) {
          setRouteRoots(Object.fromEntries(entries));
        }
      } catch (err) {
        console.error("Failed to resolve TestEditor workspace route roots", err);
        if (!cancelled) {
          setRouteRoots({});
        }
      }
    };

    void resolveRouteRoots();
    return () => {
      cancelled = true;
    };
  }, [document, resolvedWorkspaceRoot]);

  const save = useCallback(
    async (nextDocument: TestEditorWorkspaceDocument) => {
      setIsSaving(true);
      setError(null);
      try {
        await saveTestEditorWorkspace(resolvedWorkspaceRoot, nextDocument);
        const parsed = parseWorkspaceDocument(nextDocument);
        setDocument(parsed.document);
        setSource("workspace");
        setIssues(parsed.issues);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [resolvedWorkspaceRoot],
  );

  return {
    workspaceRoot: resolvedWorkspaceRoot,
    document,
    source,
    issues,
    routeRoots,
    isLoading,
    isSaving,
    error,
    reload,
    save,
  };
}
