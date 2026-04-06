import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { dirname } from "@tauri-apps/api/path";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
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
import {
  applyPayloadQueue,
  filterTree,
  findNode,
  getDirtyFolderNameFromPath,
  normalizeTree,
  type RawTreeNode,
} from "./utils/testEditorTreeOps";
import { useTestEditorPageActive } from "./hooks/useTestEditorPageActive";
import { useTestEditorFolderWatch } from "./hooks/useTestEditorFolderWatch";
import { FileTreePane } from "./components/FileTreePane";
import { TestEditorWorkspacePanels } from "./components/TestEditorWorkspacePanels";
import { useConfigStore } from "@/store/configStore";
import { TestEditorToolbar } from "./components/TestEditorToolbar";
import ListeningRepackDialog from "./components/ListeningRepackDialog";
import { folderContainsMscScriptFiles } from "./utils/mscWorkspaceUtils";
import { normalizePackFolderName } from "./utils/packName";
import { applyFileTreeViewSort } from "./utils/fileTreeViewSort";
import { sortTreeByStarOrder, useFileTreeStarOrder } from "./utils/fileTreeStars";
import { useFileTreeViewOptions } from "./hooks/useFileTreeViewOptions";
import { NumdlbEditorModalHost } from "./components/ssbh-model-preview/NumdlbEditorModalHost";
import type { NumdlbEditorWindowSession } from "./components/ssbh-model-preview/NumdlbEditorModalWindow";
import {
  cloneNumdlbReadResult,
  assertNumdlbValidForSave,
  isNumdlbDraftDirty,
} from "./components/ssbh-model-preview/numdlbEditorUtils";
import { NuhlpbEditorModalHost } from "./components/ssbh-model-preview/NuhlpbEditorModalHost";
import type { NuhlpbEditorWindowSession } from "./components/ssbh-model-preview/NuhlpbEditorModalWindow";
import {
  cloneNuhlpbReadResult,
  isNuhlpbDraftDirty,
} from "./components/ssbh-model-preview/nuhlpbEditorUtils";
import { JnttblEditorModalHost } from "./components/ssbh-model-preview/JnttblEditorModalHost";
import type { JnttblEditorWindowSession } from "./components/ssbh-model-preview/JnttblEditorModalWindow";
import {
  assertJnttblValidForSave,
  cloneJnttblEditorDocument,
  computeNextJnttblDirtyState,
  readResultToEditorDocument,
  resolveJnttblBoneCountForSave,
} from "./components/ssbh-model-preview/jnttblEditorUtils";
import {
  jnttblReadFile,
  jnttblWriteFile,
  type JnttblEditorDocument,
} from "./components/ssbh-model-preview/jnttblIoService";
import {
  ssbhReadNumdlbMapping,
  ssbhWriteNumdlbMapping,
  ssbhReadNuhlpb,
  ssbhWriteNuhlpb,
  type NumdlbReadResult,
  type NuhlpbReadResult,
} from "./components/ssbh-model-preview/ssbhDaeIoService";

const WATCH_COMMAND = "watch_folder";
const TEST_EDITOR_FOLDER_STORE_KEY = "testEditorFolder";

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
  const isPageActive = useTestEditorPageActive();
  const [numdlbSessions, setNumdlbSessions] = useState<NumdlbEditorWindowSession[]>([]);
  const numdlbZIndexRef = useRef(1000);
  const numdlbSessionsRef = useRef(numdlbSessions);
  numdlbSessionsRef.current = numdlbSessions;
  const [numdlbGuard, setNumdlbGuard] = useState<{ sessionId: string; action: "close" | "reload" } | null>(
    null,
  );

  const [nuhlpbSessions, setNuhlpbSessions] = useState<NuhlpbEditorWindowSession[]>([]);
  const nuhlpbZIndexRef = useRef(2000);
  const nuhlpbSessionsRef = useRef(nuhlpbSessions);
  nuhlpbSessionsRef.current = nuhlpbSessions;
  const [nuhlpbGuard, setNuhlpbGuard] = useState<{ sessionId: string; action: "close" | "reload" } | null>(
    null,
  );

  const [jnttblSessions, setJnttblSessions] = useState<JnttblEditorWindowSession[]>([]);
  const jnttblZIndexRef = useRef(3000);
  const jnttblZLayerSettersRef = useRef(new Map<string, (z: number) => void>());
  const jnttblSessionsRef = useRef(jnttblSessions);
  jnttblSessionsRef.current = jnttblSessions;
  const [jnttblGuard, setJnttblGuard] = useState<{ sessionId: string; action: "close" | "reload" } | null>(
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

  const flushQueuedPayloads = useCallback((queued: FolderChangePayload[]) => {
    if (!queued.length) return;
    setTreeData((prev) => applyPayloadQueue(prev, queued));

    const nextDirty = new Set<string>();
    queued.forEach((payload) => {
      payload.ops?.forEach((op) => {
        const isDir = (op.node as { isDir?: boolean; is_dir?: boolean }).isDir ?? (op.node as { is_dir?: boolean }).is_dir;
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

  useTestEditorFolderWatch({ isPageActive, onFlush: flushQueuedPayloads });

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
      setNuhlpbSessions([]);
      setNuhlpbGuard(null);
      setJnttblSessions([]);
      setJnttblGuard(null);
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

  const { starOrder, toggleStar, starredPathSet } = useFileTreeStarOrder(
    currentDir || undefined
  );
  const { viewOptions, setViewOptions } = useFileTreeViewOptions(currentDir || undefined);
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const fileTreeData = useMemo(
    () =>
      sortTreeByStarOrder(
        applyFileTreeViewSort(filterTree(treeData, deferredSearchTerm), viewOptions),
        starOrder
      ),
    [treeData, deferredSearchTerm, starOrder, viewOptions],
  );
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
  const [mscWorkspaceFolderPath, setMscWorkspaceFolderPath] = useState<string | null>(null);
  const dirtyFolderList = useMemo(() => Array.from(dirtyFolders), [dirtyFolders]);

  useEffect(() => {
    let cancelled = false;
    const sync = async () => {
      if (!selectedNode) {
        if (!cancelled) setMscWorkspaceFolderPath(null);
        return;
      }
      try {
        const dirPath = selectedNode.isDir
          ? selectedNode.path
          : await dirname(selectedNode.path);
        const ok = await folderContainsMscScriptFiles(dirPath);
        if (!cancelled) {
          setMscWorkspaceFolderPath(ok ? dirPath : null);
        }
      } catch {
        if (!cancelled) setMscWorkspaceFolderPath(null);
      }
    };
    void sync();
    return () => {
      cancelled = true;
    };
  }, [selectedNode]);
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

  const openNuhlpbSession = useCallback((filePath: string) => {
    const normalized = filePath.trim().toLowerCase();
    setNuhlpbSessions((prev) => {
      const existing = prev.find((s) => s.filePath.trim().toLowerCase() === normalized);
      if (existing) {
        const nextZ = ++nuhlpbZIndexRef.current;
        return prev.map((s) => (s.id === existing.id ? { ...s, zIndex: nextZ } : s));
      }
      const id = crypto.randomUUID();
      const nextZ = ++nuhlpbZIndexRef.current;
      const newSession: NuhlpbEditorWindowSession = {
        id,
        filePath,
        loading: true,
        saving: false,
        loadError: null,
        baseData: null,
        draftData: null,
        zIndex: nextZ,
      };
      void ssbhReadNuhlpb(filePath)
        .then((data) => {
          const base = cloneNuhlpbReadResult(data);
          const draft = cloneNuhlpbReadResult(data);
          setNuhlpbSessions((p) =>
            p.map((s) =>
              s.id === id ? { ...s, loading: false, loadError: null, baseData: base, draftData: draft } : s,
            ),
          );
        })
        .catch((err) => {
          setNuhlpbSessions((p) =>
            p.map((s) => (s.id === id ? { ...s, loading: false, loadError: String(err) } : s)),
          );
        });
      return [...prev, newSession];
    });
  }, []);

  const activateNuhlpbSession = useCallback((sessionId: string) => {
    setNuhlpbSessions((prev) => {
      const nextZ = ++nuhlpbZIndexRef.current;
      return prev.map((s) => (s.id === sessionId ? { ...s, zIndex: nextZ } : s));
    });
  }, []);

  const updateNuhlpbDraft = useCallback((sessionId: string, next: NuhlpbReadResult) => {
    setNuhlpbSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, draftData: next } : s)),
    );
  }, []);

  const saveNuhlpbSession = useCallback(async (sessionId: string) => {
    const snapshot = nuhlpbSessionsRef.current.find((x) => x.id === sessionId);
    if (!snapshot?.draftData) return;
    const draft = snapshot.draftData;
    const path = snapshot.filePath;
    setNuhlpbSessions((prev) =>
      prev.map((x) => (x.id === sessionId ? { ...x, saving: true } : x)),
    );
    try {
      await ssbhWriteNuhlpb({
        filePath: path,
        majorVersion: draft.majorVersion,
        minorVersion: draft.minorVersion,
        aimConstraints: draft.aimConstraints,
        orientConstraints: draft.orientConstraints,
      });
      const saved = cloneNuhlpbReadResult(draft);
      setNuhlpbSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId ? { ...s, saving: false, baseData: saved, draftData: saved } : s,
        ),
      );
      toast.success("Saved NUHLPB");
    } catch (e) {
      toast.error(String(e));
      setNuhlpbSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, saving: false } : s)));
    }
  }, []);

  const resetNuhlpbSession = useCallback((sessionId: string) => {
    setNuhlpbSessions((prev) =>
      prev.map((s) => {
        if (s.id !== sessionId || !s.baseData) return s;
        return { ...s, draftData: cloneNuhlpbReadResult(s.baseData) };
      }),
    );
  }, []);

  const reloadNuhlpbSession = useCallback(async (sessionId: string) => {
    let fp = "";
    setNuhlpbSessions((prev) => {
      const s = prev.find((x) => x.id === sessionId);
      if (!s) return prev;
      fp = s.filePath;
      return prev.map((x) => (x.id === sessionId ? { ...x, loading: true, loadError: null } : x));
    });
    if (!fp) return;
    try {
      const data = await ssbhReadNuhlpb(fp);
      const base = cloneNuhlpbReadResult(data);
      const draft = cloneNuhlpbReadResult(data);
      setNuhlpbSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId ? { ...s, loading: false, loadError: null, baseData: base, draftData: draft } : s,
        ),
      );
      toast.success("Reloaded NUHLPB from disk");
    } catch (e) {
      const msg = String(e);
      setNuhlpbSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, loading: false, loadError: msg } : s)),
      );
      toast.error(msg);
    }
  }, []);

  const requestCloseNuhlpbSession = useCallback((sessionId: string) => {
    const s = nuhlpbSessionsRef.current.find((x) => x.id === sessionId);
    if (!s) return;
    if (isNuhlpbDraftDirty(s.baseData, s.draftData)) {
      setNuhlpbGuard({ sessionId, action: "close" });
      return;
    }
    setNuhlpbSessions((prev) => prev.filter((x) => x.id !== sessionId));
  }, []);

  const requestReloadNuhlpbSession = useCallback(
    (sessionId: string) => {
      const s = nuhlpbSessionsRef.current.find((x) => x.id === sessionId);
      if (!s) return;
      if (isNuhlpbDraftDirty(s.baseData, s.draftData)) {
        setNuhlpbGuard({ sessionId, action: "reload" });
        return;
      }
      void reloadNuhlpbSession(sessionId);
    },
    [reloadNuhlpbSession],
  );

  const dismissNuhlpbGuard = useCallback(() => {
    setNuhlpbGuard(null);
  }, []);

  const discardNuhlpbGuard = useCallback(() => {
    setNuhlpbGuard((g) => {
      if (!g) return null;
      const { sessionId, action } = g;
      if (action === "close") {
        setNuhlpbSessions((prev) => prev.filter((x) => x.id !== sessionId));
      } else {
        void reloadNuhlpbSession(sessionId);
      }
      return null;
    });
  }, [reloadNuhlpbSession]);

  const saveAndFinishNuhlpbGuard = useCallback(async () => {
    if (!nuhlpbGuard) return;
    const { sessionId, action } = nuhlpbGuard;
    await saveNuhlpbSession(sessionId);
    const s = nuhlpbSessionsRef.current.find((x) => x.id === sessionId);
    if (!s) return;
    if (isNuhlpbDraftDirty(s.baseData, s.draftData)) return;
    setNuhlpbGuard(null);
    if (action === "close") {
      setNuhlpbSessions((prev) => prev.filter((x) => x.id !== sessionId));
    } else {
      void reloadNuhlpbSession(sessionId);
    }
  }, [nuhlpbGuard, saveNuhlpbSession, reloadNuhlpbSession]);

  const registerJnttblZLayer = useCallback((sessionId: string, setZ: (z: number) => void) => {
    jnttblZLayerSettersRef.current.set(sessionId, setZ);
    return () => {
      jnttblZLayerSettersRef.current.delete(sessionId);
    };
  }, []);

  const openJnttblSession = useCallback((filePath: string) => {
    const normalized = filePath.trim().toLowerCase();
    setJnttblSessions((prev) => {
      const existing = prev.find((s) => s.filePath.trim().toLowerCase() === normalized);
      if (existing) {
        const nextZ = ++jnttblZIndexRef.current;
        queueMicrotask(() => {
          const setter = jnttblZLayerSettersRef.current.get(existing.id);
          if (setter) setter(nextZ);
        });
        return prev;
      }
      const id = crypto.randomUUID();
      const nextZ = ++jnttblZIndexRef.current;
      const newSession: JnttblEditorWindowSession = {
        id,
        filePath,
        loading: true,
        saving: false,
        loadError: null,
        baseData: null,
        draftData: null,
        isDirty: false,
        zIndex: nextZ,
      };
      void jnttblReadFile(filePath)
        .then((data) => {
          const doc = readResultToEditorDocument(data);
          const base = cloneJnttblEditorDocument(doc);
          const draft = cloneJnttblEditorDocument(doc);
          setJnttblSessions((p) =>
            p.map((s) =>
              s.id === id
                ? {
                    ...s,
                    loading: false,
                    loadError: null,
                    baseData: base,
                    draftData: draft,
                    isDirty: false,
                  }
                : s,
            ),
          );
        })
        .catch((err) => {
          setJnttblSessions((p) =>
            p.map((s) => (s.id === id ? { ...s, loading: false, loadError: String(err) } : s)),
          );
        });
      return [...prev, newSession];
    });
  }, []);

  const activateJnttblSession = useCallback((sessionId: string) => {
    const nextZ = ++jnttblZIndexRef.current;
    const setter = jnttblZLayerSettersRef.current.get(sessionId);
    if (setter) setter(nextZ);
  }, []);

  const updateJnttblDraft = useCallback((sessionId: string, next: JnttblEditorDocument) => {
    setJnttblSessions((prev) =>
      prev.map((s) =>
        s.id === sessionId
          ? {
              ...s,
              draftData: next,
              isDirty: computeNextJnttblDirtyState({
                wasDirty: s.isDirty,
                base: s.baseData,
                draft: next,
              }),
            }
          : s,
      ),
    );
  }, []);

  const saveJnttblSession = useCallback(async (sessionId: string) => {
    const snapshot = jnttblSessionsRef.current.find((x) => x.id === sessionId);
    if (!snapshot?.draftData) return;
    try {
      assertJnttblValidForSave(snapshot.draftData);
    } catch (e) {
      toast.error(String(e));
      return;
    }
    const draft = snapshot.draftData;
    const path = snapshot.filePath;
    const override = draft.nusktbPathOverride;
    setJnttblSessions((prev) =>
      prev.map((x) => (x.id === sessionId ? { ...x, saving: true } : x)),
    );
    try {
      await jnttblWriteFile({
        filePath: path,
        version: draft.version,
        boneCount: resolveJnttblBoneCountForSave(draft),
        flag: draft.flag,
        entries: draft.entries,
      });
      const fresh = await jnttblReadFile(path);
      const doc = readResultToEditorDocument(fresh);
      const saved = cloneJnttblEditorDocument({
        ...doc,
        nusktbPathOverride: override,
      });
      setJnttblSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId
            ? { ...s, saving: false, baseData: saved, draftData: saved, isDirty: false }
            : s,
        ),
      );
      toast.success("Saved JNTT");
    } catch (e) {
      toast.error(String(e));
      setJnttblSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, saving: false } : s)));
    }
  }, []);

  const resetJnttblSession = useCallback((sessionId: string) => {
    setJnttblSessions((prev) =>
      prev.map((s) => {
        if (s.id !== sessionId || !s.baseData) return s;
        return { ...s, draftData: cloneJnttblEditorDocument(s.baseData), isDirty: false };
      }),
    );
  }, []);

  const reloadJnttblSession = useCallback(async (sessionId: string) => {
    let fp = "";
    setJnttblSessions((prev) => {
      const s = prev.find((x) => x.id === sessionId);
      if (!s) return prev;
      fp = s.filePath;
      return prev.map((x) => (x.id === sessionId ? { ...x, loading: true, loadError: null } : x));
    });
    if (!fp) return;
    try {
      const data = await jnttblReadFile(fp);
      const doc = readResultToEditorDocument(data);
      const base = cloneJnttblEditorDocument(doc);
      const draft = cloneJnttblEditorDocument(doc);
      setJnttblSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId
            ? { ...s, loading: false, loadError: null, baseData: base, draftData: draft, isDirty: false }
            : s,
        ),
      );
      toast.success("Reloaded JNTT from disk");
    } catch (e) {
      const msg = String(e);
      setJnttblSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, loading: false, loadError: msg } : s)),
      );
      toast.error(msg);
    }
  }, []);

  const requestCloseJnttblSession = useCallback((sessionId: string) => {
    const s = jnttblSessionsRef.current.find((x) => x.id === sessionId);
    if (!s) return;
    if (s.isDirty) {
      setJnttblGuard({ sessionId, action: "close" });
      return;
    }
    setJnttblSessions((prev) => prev.filter((x) => x.id !== sessionId));
  }, []);

  const requestReloadJnttblSession = useCallback(
    (sessionId: string) => {
      const s = jnttblSessionsRef.current.find((x) => x.id === sessionId);
      if (!s) return;
      if (s.isDirty) {
        setJnttblGuard({ sessionId, action: "reload" });
        return;
      }
      void reloadJnttblSession(sessionId);
    },
    [reloadJnttblSession],
  );

  const dismissJnttblGuard = useCallback(() => {
    setJnttblGuard(null);
  }, []);

  const discardJnttblGuard = useCallback(() => {
    setJnttblGuard((g) => {
      if (!g) return null;
      const { sessionId, action } = g;
      if (action === "close") {
        setJnttblSessions((prev) => prev.filter((x) => x.id !== sessionId));
      } else {
        void reloadJnttblSession(sessionId);
      }
      return null;
    });
  }, [reloadJnttblSession]);

  const saveAndFinishJnttblGuard = useCallback(async () => {
    if (!jnttblGuard) return;
    const { sessionId, action } = jnttblGuard;
    await saveJnttblSession(sessionId);
    const s = jnttblSessionsRef.current.find((x) => x.id === sessionId);
    if (!s) return;
    if (s.isDirty) return;
    setJnttblGuard(null);
    if (action === "close") {
      setJnttblSessions((prev) => prev.filter((x) => x.id !== sessionId));
    } else {
      void reloadJnttblSession(sessionId);
    }
  }, [jnttblGuard, saveJnttblSession, reloadJnttblSession]);

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

      if (lower.endsWith(".nuhlpb")) {
        setSelectedId(node.id);
        openNuhlpbSession(node.path);
        return;
      }

      if (lower.endsWith(".jnttbl")) {
        setSelectedId(node.id);
        openJnttblSession(node.path);
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
    [hasUnsavedChanges, selectedJsonPath, openNumdlbSession, openNuhlpbSession, openJnttblSession],
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
        <SsbhModelPreviewProvider workspaceRoot={currentDir} previewSuspended={!isPageActive}>
          <TestEditorWorkspacePanels
            left={
              <FileTreePane
                data={fileTreeData}
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
                starredPathSet={starredPathSet}
                onToggleStar={toggleStar}
                viewOptions={viewOptions}
                onViewOptionsChange={setViewOptions}
              />
            }
            center={
              <MainView
                jsonFilePath={selectedJsonPath}
                folderPath={currentDir}
                mscWorkspaceFolderPath={mscWorkspaceFolderPath}
                onMscWorkspaceFolderChange={setMscWorkspaceFolderPath}
                onUnsavedChanges={setHasUnsavedChanges}
                onRevealTreeFolder={revealInTreeByPath}
              />
            }
            right={<InfoPanel selected={selectedNode} />}
          />
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

      <NuhlpbEditorModalHost
        sessions={nuhlpbSessions}
        onActivateSession={activateNuhlpbSession}
        onCloseRequest={requestCloseNuhlpbSession}
        onReloadRequest={requestReloadNuhlpbSession}
        onDraftChange={updateNuhlpbDraft}
        onSave={saveNuhlpbSession}
        onReset={resetNuhlpbSession}
      />

      <AlertDialog
        open={nuhlpbGuard !== null}
        onOpenChange={(open) => {
          if (!open) setNuhlpbGuard(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved NUHLPB changes</AlertDialogTitle>
            <AlertDialogDescription>
              {nuhlpbGuard?.action === "close"
                ? "Save before closing, discard edits, or cancel."
                : "Save before reloading from disk, discard edits, or cancel."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
            <AlertDialogCancel type="button" onClick={dismissNuhlpbGuard}>
              Cancel
            </AlertDialogCancel>
            <Button type="button" variant="outline" onClick={discardNuhlpbGuard}>
              Discard
            </Button>
            <Button type="button" onClick={() => void saveAndFinishNuhlpbGuard()}>
              {nuhlpbGuard?.action === "close" ? "Save and close" : "Save and reload"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <JnttblEditorModalHost
        sessions={jnttblSessions}
        onRegisterZLayer={registerJnttblZLayer}
        onActivateSession={activateJnttblSession}
        onCloseRequest={requestCloseJnttblSession}
        onReloadRequest={requestReloadJnttblSession}
        onDraftChange={updateJnttblDraft}
        onSave={saveJnttblSession}
        onReset={resetJnttblSession}
      />

      <AlertDialog
        open={jnttblGuard !== null}
        onOpenChange={(open) => {
          if (!open) setJnttblGuard(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved JNTT changes</AlertDialogTitle>
            <AlertDialogDescription>
              {jnttblGuard?.action === "close"
                ? "Save before closing, discard edits, or cancel."
                : "Save before reloading from disk, discard edits, or cancel."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
            <AlertDialogCancel type="button" onClick={dismissJnttblGuard}>
              Cancel
            </AlertDialogCancel>
            <Button type="button" variant="outline" onClick={discardJnttblGuard}>
              Discard
            </Button>
            <Button type="button" onClick={() => void saveAndFinishJnttblGuard()}>
              {jnttblGuard?.action === "close" ? "Save and close" : "Save and reload"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default TestEditorPage;

