import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { toast } from "sonner";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import MainView from "./components/MainView";
import InfoPanel from "./components/InfoPanel";
import { SsbhModelPreviewProvider } from "./components/ssbh-model-preview/SsbhModelPreviewPanel";
import { FolderChangePayload, TestTreeNode } from "./types";
import { FileTreePane } from "./components/FileTreePane";
import { useConfigStore } from "@/store/configStore";
import { TestEditorToolbar } from "./components/TestEditorToolbar";
import ListeningRepackDialog from "./components/ListeningRepackDialog";
import { normalizePackFolderName } from "./utils/packName";
import { NumdlbEditorModalHost } from "./components/ssbh-model-preview/NumdlbEditorModalHost";
import type { NumdlbEditorWindowSession } from "./components/ssbh-model-preview/NumdlbEditorModalWindow";
import {
  cloneNumdlbReadResult,
  assertNumdlbValidForSave,
  isNumdlbDraftDirty,
} from "./components/ssbh-model-preview/numdlbEditorUtils";
import {
  ssbhReadNumdlbMapping,
  ssbhWriteNumdlbMapping,
  type NumdlbReadResult,
} from "./components/ssbh-model-preview/ssbhDaeIoService";

const WATCH_EVENT = "test-editor:folder-change";
const WATCH_COMMAND = "watch_folder";
const TEST_EDITOR_FOLDER_STORE_KEY = "testEditorFolder";

type RawTreeNode = Partial<TestTreeNode> & {
  id: string;
  name: string;
  path: string;
  isDir?: boolean;
  is_dir?: boolean;
  children?: RawTreeNode[];
};

function normalizeNode(node: RawTreeNode): TestTreeNode {
  const isDir = node.isDir ?? node.is_dir ?? false;
  const children = node.children?.map(normalizeNode);
  return {
    id: node.id,
    name: node.name,
    path: node.path,
    isDir,
    children: isDir ? children ?? [] : undefined,
  };
}

function normalizeTree(nodes: RawTreeNode[] = []): TestTreeNode[] {
  return nodes.map(normalizeNode);
}

function findNode(nodes: TestTreeNode[], id: string | null): TestTreeNode | null {
  if (!id) return null;
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.children) {
      const child = findNode(node.children, id);
      if (child) return child;
    }
  }
  return null;
}

function removeNode(nodes: TestTreeNode[], targetId: string): TestTreeNode[] {
  let changed = false;
  const filtered = nodes
    .map((node) => {
      if (node.id === targetId) {
        changed = true;
        return null;
      }
      if (node.children) {
        const nextChildren = removeNode(node.children, targetId);
        if (nextChildren !== node.children) {
          changed = true;
          return { ...node, children: nextChildren };
        }
      }
      return node;
    })
    .filter(Boolean) as TestTreeNode[];
  return changed ? filtered : nodes;
}

function upsertNode(nodes: TestTreeNode[], incoming: TestTreeNode, parentId?: string): TestTreeNode[] {
  if (!parentId) {
    const existingIndex = nodes.findIndex((n) => n.id === incoming.id);
    if (existingIndex >= 0) {
      const next = [...nodes];
      next[existingIndex] = incoming;
      return next;
    }
    return [...nodes, incoming];
  }

  let changed = false;
  const nextNodes = nodes.map((node) => {
    if (node.id === parentId) {
      const children = node.children ? [...node.children] : [];
      const idx = children.findIndex((c) => c.id === incoming.id);
      if (idx >= 0) {
        children[idx] = incoming;
      } else {
        children.push(incoming);
      }
      changed = true;
      return { ...node, children };
    }
    if (node.children) {
      const nextChildren = upsertNode(node.children, incoming, parentId);
      if (nextChildren !== node.children) {
        changed = true;
        return { ...node, children: nextChildren };
      }
    }
    return node;
  });

  return changed ? nextNodes : nodes;
}

function applyPayload(current: TestTreeNode[], payload?: FolderChangePayload): TestTreeNode[] {
  if (!payload) return current;
  if (payload.fullTree) return normalizeTree(payload.fullTree);
  if (!payload.ops) return current;

  return payload.ops.reduce((acc, op) => {
    if (op.type === "remove") {
      return removeNode(acc, op.node.id);
    }
    return upsertNode(acc, normalizeNode(op.node), op.parentId);
  }, current);
}

function filterTree(nodes: TestTreeNode[], term: string): TestTreeNode[] {
  if (!term) return nodes;
  const lower = term.toLowerCase();

  const walk = (items: TestTreeNode[], includeAll: boolean): TestTreeNode[] => {
    const next: TestTreeNode[] = [];
    for (const item of items) {
      const nameHit = item.name.toLowerCase().includes(lower);
      const childHits = item.children ? walk(item.children, includeAll || nameHit) : [];
      const hasChildHits = childHits.length > 0;
      if (nameHit || hasChildHits) {
        // If this node matches, keep all its children (unfiltered) for navigation; otherwise keep only matching descendants.
        const children = nameHit ? item.children ?? [] : childHits;
        next.push({ ...item, children, isLeaf: !item.isDir });
      }
    }
    return next;
  };

  return walk(nodes, false);
}

function normalizeSlashes(input: string): string {
  return input.replace(/\\/g, "/");
}

function getTopLevelFolderName(nodePath: string, rootPath: string, isDir?: boolean): string | null {
  if (!nodePath || !rootPath) return null;
  const normalizedRoot = normalizeSlashes(rootPath).replace(/\/+$/, "");
  const normalizedNode = normalizeSlashes(nodePath);
  if (!normalizedNode.startsWith(normalizedRoot)) return null;
  const relative = normalizedNode.slice(normalizedRoot.length).replace(/^\/+/, "");
  if (!relative) return null;
  const segments = relative.split("/");
  if (segments.length === 1 && !relative.includes("/")) {
    // This is either a top-level folder or a root-level file; only keep folders.
    return isDir === false ? null : segments[0];
  }
  return segments[0] ?? null;
}

function getDirtyFolderNameFromPath(nodePath: string, rootPath: string, isDir?: boolean): string | null {
  const topLevel = getTopLevelFolderName(nodePath, rootPath, isDir);
  if (topLevel) return normalizePackFolderName(topLevel);

  // If a root-level *_structure.json changed, it should mark the corresponding folder as dirty.
  if (isDir === false && nodePath && rootPath) {
    const normalizedRoot = normalizeSlashes(rootPath).replace(/\/+$/, "");
    const normalizedNode = normalizeSlashes(nodePath);
    if (!normalizedNode.startsWith(normalizedRoot)) return null;
    const relative = normalizedNode.slice(normalizedRoot.length).replace(/^\/+/, "");
    if (!relative || relative.includes("/")) return null;
    const lower = relative.toLowerCase();
    const suffix = "_structure.json";
    if (!lower.endsWith(suffix)) return null;
    const base = relative.slice(0, -suffix.length);
    if (!base) return null;
    return normalizePackFolderName(base);
  }

  return null;
}

const TestEditorPage = () => {
  const store = useConfigStore((s) => s.store);
  const getSetting = useConfigStore((s) => s.getSetting);
  const [treeData, setTreeData] = useState<TestTreeNode[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [currentDir, setCurrentDir] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedJsonPath, setSelectedJsonPath] = useState<string | null>(null);
  const [pendingJsonPath, setPendingJsonPath] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [dirtyFolders, setDirtyFolders] = useState<Set<string>>(new Set());
  const [isRepackDialogOpen, setIsRepackDialogOpen] = useState(false);
  const [obModPath, setObModPath] = useState("");
  const pendingPayloadsRef = useRef<FolderChangePayload[]>([]);
  const rafIdRef = useRef<number | null>(null);
  const [numdlbSessions, setNumdlbSessions] = useState<NumdlbEditorWindowSession[]>([]);
  const numdlbZIndexRef = useRef(1000);
  const numdlbSessionsRef = useRef(numdlbSessions);
  numdlbSessionsRef.current = numdlbSessions;
  const [numdlbGuard, setNumdlbGuard] = useState<{ sessionId: string; action: "close" | "reload" } | null>(
    null,
  );

  const revealInTreeByPath = useCallback((targetPath: string) => {
    // 1. Clear search term
    setSearchTerm("");

    // 2. Find node in full treeData
    const findNodeByPath = (nodes: TestTreeNode[], path: string): TestTreeNode | null => {
      const normalizedTarget = path.replace(/\\/g, "/").toLowerCase();
      for (const node of nodes) {
        const normalizedNodePath = node.path.replace(/\\/g, "/").toLowerCase();
        if (normalizedNodePath === normalizedTarget && node.isDir) return node;
        if (node.children) {
          const found = findNodeByPath(node.children, path);
          if (found) return found;
        }
      }
      return null;
    };

    const node = findNodeByPath(treeData, targetPath);
    if (node) {
      setSelectedId(node.id);
      toast.success(`Revealed folder: ${node.name}`);
    } else {
      toast.error("Folder not found in current workspace root");
    }
  }, [treeData]);

  const flushPendingPayloads = useCallback(() => {
    const queued = pendingPayloadsRef.current;
    pendingPayloadsRef.current = [];
    rafIdRef.current = null;
    if (!queued.length) return;

    setTreeData((prev) => queued.reduce((acc, payload) => applyPayload(acc, payload), prev));

    const nextDirty = new Set<string>();
    queued.forEach((payload) => {
      payload.ops?.forEach((op) => {
        const isDir = (op.node as any).isDir ?? (op.node as any).is_dir;
        const name = getDirtyFolderNameFromPath(op.node.path, currentDir, isDir);
        if (!name) return;
        nextDirty.add(name);
      });
    });

    if (nextDirty.size > 0) {
      setDirtyFolders((prev) => {
        const merged = new Set(prev);
        nextDirty.forEach((name) => merged.add(name));
        return merged;
      });
    }
  }, [currentDir]);

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;

    const setup = async () => {
      unlisten = await listen<FolderChangePayload>(WATCH_EVENT, (event) => {
        pendingPayloadsRef.current.push(event.payload);
        if (rafIdRef.current === null) {
          rafIdRef.current = requestAnimationFrame(flushPendingPayloads);
        }
      });
    };

    setup();

    return () => {
      unlisten?.();
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      pendingPayloadsRef.current = [];
    };
  }, [flushPendingPayloads]);

  const loadFolder = useCallback(async (directoryPath: string) => {
    setIsLoading(true);
    try {
      setCurrentDir(directoryPath);
      const initial = await invoke<RawTreeNode[]>(WATCH_COMMAND, { path: directoryPath });
      setTreeData(normalizeTree(initial ?? []));
      setSelectedId(null);
      setDirtyFolders(new Set());
      setNumdlbSessions([]);
      setNumdlbGuard(null);
    } catch (error) {
      console.error(error);
      toast.error("Failed to start folder watch");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshFolder = useCallback(async () => {
    if (!currentDir) return;
    setIsLoading(true);
    try {
      const fresh = await invoke<RawTreeNode[]>(WATCH_COMMAND, { path: currentDir });
      setTreeData(normalizeTree(fresh ?? []));
    } catch (error) {
      console.error(error);
      toast.error("Failed to refresh folder");
    } finally {
      setIsLoading(false);
    }
  }, [currentDir]);

  useEffect(() => {
    const hydrate = async () => {
      if (!store) return;
      const saved = await getSetting<string>(TEST_EDITOR_FOLDER_STORE_KEY);
      if (!saved) return;
      await loadFolder(saved);
    };

    hydrate();
  }, [store, getSetting, loadFolder]);

  useEffect(() => {
    const loadObModPath = async () => {
      const path = (await getSetting<string>("obModPath")) ?? "";
      setObModPath(path);
    };
    loadObModPath();
  }, [getSetting]);

  const filteredData = useMemo(() => filterTree(treeData, searchTerm), [treeData, searchTerm]);
  const workspaceTopLevelFolderNames = useMemo(
    () => treeData.filter((n) => n.isDir).map((n) => n.name),
    [treeData]
  );

  const fileTreeStructureScanKey = useMemo(() => {
    const dirs = treeData
      .filter((n) => n.isDir)
      .map((n) => n.name)
      .sort()
      .join("\0");
    const rootStructureJson = treeData
      .filter((n) => !n.isDir && n.name.toLowerCase().endsWith("_structure.json"))
      .map((n) => n.name.toLowerCase())
      .sort()
      .join("\0");
    return `${dirs}|${rootStructureJson}`;
  }, [treeData]);
  const selectedNode = useMemo(() => findNode(treeData, selectedId), [treeData, selectedId]);
  const dirtyFolderList = useMemo(() => Array.from(dirtyFolders), [dirtyFolders]);
  const hasDirtyFolders = dirtyFolderList.length > 0;

  const handleDiscardChanges = useCallback(() => {
    if (pendingJsonPath) {
      setSelectedJsonPath(pendingJsonPath);
      setHasUnsavedChanges(false);

      // Find and select the new JSON file node
      const findNodeByPath = (nodes: TestTreeNode[], path: string): TestTreeNode | null => {
        for (const node of nodes) {
          if (node.path === path) return node;
          if (node.children) {
            const found = findNodeByPath(node.children, path);
            if (found) return found;
          }
        }
        return null;
      };

      const newNode = findNodeByPath(treeData, pendingJsonPath);
      if (newNode) {
        setSelectedId(newNode.id);
      }

      setPendingJsonPath(null);
    }
    setShowUnsavedDialog(false);
  }, [pendingJsonPath, treeData]);

  const handleCancelSelection = useCallback(() => {
    setPendingJsonPath(null);
    setShowUnsavedDialog(false);
  }, []);

  const handleRepackSuccess = useCallback((folderName: string) => {
    const normalizedFolderName = normalizePackFolderName(folderName);
    setDirtyFolders((prev) => {
      if (!prev.has(normalizedFolderName)) return prev;
      const next = new Set(prev);
      next.delete(normalizedFolderName);
      return next;
    });
  }, []);

  const handleRepackComplete = useCallback(() => {
    setIsRepackDialogOpen(false);
  }, []);

  const openNumdlbSession = useCallback((filePath: string) => {
    const normalized = filePath.trim().toLowerCase();
    setNumdlbSessions((prev) => {
      const existing = prev.find((s) => s.filePath.trim().toLowerCase() === normalized);
      if (existing) {
        const nextZ = ++numdlbZIndexRef.current;
        return prev.map((s) => (s.id === existing.id ? { ...s, zIndex: nextZ } : s));
      }
      const id = crypto.randomUUID();
      const nextZ = ++numdlbZIndexRef.current;
      const newSession: NumdlbEditorWindowSession = {
        id,
        filePath,
        loading: true,
        saving: false,
        loadError: null,
        baseData: null,
        draftData: null,
        zIndex: nextZ,
      };
      void ssbhReadNumdlbMapping(filePath)
        .then((data) => {
          const base = cloneNumdlbReadResult(data);
          const draft = cloneNumdlbReadResult(data);
          setNumdlbSessions((p) =>
            p.map((s) =>
              s.id === id
                ? {
                    ...s,
                    loading: false,
                    loadError: null,
                    baseData: base,
                    draftData: draft,
                  }
                : s,
            ),
          );
        })
        .catch((err) => {
          setNumdlbSessions((p) =>
            p.map((s) =>
              s.id === id ? { ...s, loading: false, loadError: String(err) } : s,
            ),
          );
        });
      return [...prev, newSession];
    });
  }, []);

  const activateNumdlbSession = useCallback((sessionId: string) => {
    setNumdlbSessions((prev) => {
      const nextZ = ++numdlbZIndexRef.current;
      return prev.map((s) => (s.id === sessionId ? { ...s, zIndex: nextZ } : s));
    });
  }, []);

  const updateNumdlbDraft = useCallback((sessionId: string, next: NumdlbReadResult) => {
    setNumdlbSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, draftData: next } : s)),
    );
  }, []);

  const saveNumdlbSession = useCallback(async (sessionId: string) => {
    const snapshot = numdlbSessionsRef.current.find((x) => x.id === sessionId);
    if (!snapshot?.draftData) return;
    try {
      assertNumdlbValidForSave(snapshot.draftData);
    } catch (e) {
      toast.error(String(e));
      return;
    }
    const draft = snapshot.draftData;
    const path = snapshot.filePath;
    setNumdlbSessions((prev) =>
      prev.map((x) => (x.id === sessionId ? { ...x, saving: true } : x)),
    );
    try {
      await ssbhWriteNumdlbMapping({
        filePath: path,
        modelName: draft.modelName,
        skeletonFileName: draft.skeletonFileName,
        materialFileNames: draft.materialFileNames,
        meshFileName: draft.meshFileName,
        animationFileName: draft.animationFileName,
        entries: draft.entries,
      });
      const saved = cloneNumdlbReadResult(draft);
      setNumdlbSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId
            ? { ...s, saving: false, baseData: saved, draftData: saved }
            : s,
        ),
      );
      toast.success("Saved NUMDLB");
    } catch (e) {
      toast.error(String(e));
      setNumdlbSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, saving: false } : s)));
    }
  }, []);

  const resetNumdlbSession = useCallback((sessionId: string) => {
    setNumdlbSessions((prev) =>
      prev.map((s) => {
        if (s.id !== sessionId || !s.baseData) return s;
        return { ...s, draftData: cloneNumdlbReadResult(s.baseData) };
      }),
    );
  }, []);

  const reloadNumdlbSession = useCallback(async (sessionId: string) => {
    let fp = "";
    setNumdlbSessions((prev) => {
      const s = prev.find((x) => x.id === sessionId);
      if (!s) return prev;
      fp = s.filePath;
      return prev.map((x) => (x.id === sessionId ? { ...x, loading: true, loadError: null } : x));
    });
    if (!fp) return;
    try {
      const data = await ssbhReadNumdlbMapping(fp);
      const base = cloneNumdlbReadResult(data);
      const draft = cloneNumdlbReadResult(data);
      setNumdlbSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId
            ? { ...s, loading: false, loadError: null, baseData: base, draftData: draft }
            : s,
        ),
      );
      toast.success("Reloaded NUMDLB from disk");
    } catch (e) {
      const msg = String(e);
      setNumdlbSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, loading: false, loadError: msg } : s)),
      );
      toast.error(msg);
    }
  }, []);

  const requestCloseNumdlbSession = useCallback((sessionId: string) => {
    const s = numdlbSessionsRef.current.find((x) => x.id === sessionId);
    if (!s) return;
    if (isNumdlbDraftDirty(s.baseData, s.draftData)) {
      setNumdlbGuard({ sessionId, action: "close" });
      return;
    }
    setNumdlbSessions((prev) => prev.filter((x) => x.id !== sessionId));
  }, []);

  const requestReloadNumdlbSession = useCallback(
    (sessionId: string) => {
      const s = numdlbSessionsRef.current.find((x) => x.id === sessionId);
      if (!s) return;
      if (isNumdlbDraftDirty(s.baseData, s.draftData)) {
        setNumdlbGuard({ sessionId, action: "reload" });
        return;
      }
      void reloadNumdlbSession(sessionId);
    },
    [reloadNumdlbSession],
  );

  const dismissNumdlbGuard = useCallback(() => {
    setNumdlbGuard(null);
  }, []);

  const discardNumdlbGuard = useCallback(() => {
    setNumdlbGuard((g) => {
      if (!g) return null;
      const { sessionId, action } = g;
      if (action === "close") {
        setNumdlbSessions((prev) => prev.filter((x) => x.id !== sessionId));
      } else {
        void reloadNumdlbSession(sessionId);
      }
      return null;
    });
  }, [reloadNumdlbSession]);

  const saveAndFinishNumdlbGuard = useCallback(async () => {
    if (!numdlbGuard) return;
    const { sessionId, action } = numdlbGuard;
    await saveNumdlbSession(sessionId);
    const s = numdlbSessionsRef.current.find((x) => x.id === sessionId);
    if (!s) return;
    if (isNumdlbDraftDirty(s.baseData, s.draftData)) {
      return;
    }
    setNumdlbGuard(null);
    if (action === "close") {
      setNumdlbSessions((prev) => prev.filter((x) => x.id !== sessionId));
    } else {
      void reloadNumdlbSession(sessionId);
    }
  }, [numdlbGuard, saveNumdlbSession, reloadNumdlbSession]);

  const handleFileSelect = useCallback(
    (node: TestTreeNode | null) => {
      if (!node || node.isDir) {
        setSelectedId(node?.id ?? null);
        return;
      }

      const lower = node.name.toLowerCase();
      if (lower.endsWith(".numdlb")) {
        setSelectedId(node.id);
        openNumdlbSession(node.path);
        return;
      }

      if (!lower.endsWith(".json")) {
        setSelectedId(node.id);
        return;
      }

      if (hasUnsavedChanges && selectedJsonPath !== node.path) {
        setPendingJsonPath(node.path);
        setShowUnsavedDialog(true);
        return;
      }

      setSelectedJsonPath(node.path);
      setSelectedId(node.id);
    },
    [hasUnsavedChanges, selectedJsonPath, openNumdlbSession],
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-xs overflow-hidden">
      <div className="shrink-0">
        <TestEditorToolbar
        currentDir={currentDir}
        folderStoreKey={TEST_EDITOR_FOLDER_STORE_KEY}
        isLoading={isLoading}
        hasDirtyFolders={hasDirtyFolders}
        onPickFolder={loadFolder}
        onRefresh={refreshFolder}
        onRepack={() => setIsRepackDialogOpen(true)}
        onClearDirty={() => setDirtyFolders(new Set())}
      />
      </div>

      <div className="flex-1 min-h-0 p-2 overflow-hidden">
        <SsbhModelPreviewProvider workspaceRoot={currentDir}>
          <ResizablePanelGroup
            orientation="horizontal"
            className="h-full min-h-0 rounded-lg border bg-card shadow-sm"
          >
          <ResizablePanel defaultSize={20} minSize={15}>
            <div className="h-full">
              <FileTreePane
                data={filteredData}
                onSelect={handleFileSelect}
                selectedId={selectedId}
                searchTerm={searchTerm}
                onSearchChange={setSearchTerm}
                onPickFolder={loadFolder}
                onRefresh={refreshFolder}
                folderStoreKey={TEST_EDITOR_FOLDER_STORE_KEY}
                isLoading={isLoading}
                currentDir={currentDir}
                currentJsonPath={selectedJsonPath}
                hasUnsavedChanges={hasUnsavedChanges}
                dirtyTopLevelFolderNames={dirtyFolderList}
                workspaceTopLevelFolderNames={workspaceTopLevelFolderNames}
                fileTreeStructureScanKey={fileTreeStructureScanKey}
                modFolderPath={obModPath || undefined}
                onFolderRepacked={handleRepackSuccess}
              />
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle className="w-1 bg-border hover:bg-primary/20 transition-colors" />

          <ResizablePanel defaultSize={60} minSize={40}>
            <div className="h-full min-h-0 bg-muted/30">
              <MainView
                jsonFilePath={selectedJsonPath}
                folderPath={currentDir}
                onUnsavedChanges={setHasUnsavedChanges}
                onRevealTreeFolder={revealInTreeByPath}
              />
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle className="w-1 bg-border hover:bg-primary/20 transition-colors" />

          <ResizablePanel defaultSize={20} minSize={15}>
            <div className="h-full min-h-0">
              <InfoPanel selected={selectedNode} />
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
        </SsbhModelPreviewProvider>
      </div>

      <ListeningRepackDialog
        open={isRepackDialogOpen}
        onOpenChange={setIsRepackDialogOpen}
        rootDir={currentDir}
        dirtyFolders={dirtyFolderList}
        modFolderPath={obModPath || undefined}
        onFolderRepacked={handleRepackSuccess}
        onComplete={handleRepackComplete}
      />

      <AlertDialog open={showUnsavedDialog} onOpenChange={setShowUnsavedDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes in the current file. Do you want to discard them and load the new file?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelSelection}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDiscardChanges}>Discard Changes</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <NumdlbEditorModalHost
        sessions={numdlbSessions}
        onActivateSession={activateNumdlbSession}
        onCloseRequest={requestCloseNumdlbSession}
        onReloadRequest={requestReloadNumdlbSession}
        onDraftChange={updateNumdlbDraft}
        onSave={saveNumdlbSession}
        onReset={resetNumdlbSession}
      />

      <AlertDialog
        open={numdlbGuard !== null}
        onOpenChange={(open) => {
          if (!open) setNumdlbGuard(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved NUMDLB changes</AlertDialogTitle>
            <AlertDialogDescription>
              {numdlbGuard?.action === "close"
                ? "Save before closing, discard edits, or cancel."
                : "Save before reloading from disk, discard edits, or cancel."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
            <AlertDialogCancel type="button" onClick={dismissNumdlbGuard}>
              Cancel
            </AlertDialogCancel>
            <Button type="button" variant="outline" onClick={discardNumdlbGuard}>
              Discard
            </Button>
            <Button type="button" onClick={() => void saveAndFinishNumdlbGuard()}>
              {numdlbGuard?.action === "close" ? "Save and close" : "Save and reload"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default TestEditorPage;

