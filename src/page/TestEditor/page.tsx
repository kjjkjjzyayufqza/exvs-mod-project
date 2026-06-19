import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from "react";
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
import { FolderChangePayload, TestTreeNode } from "./types";
import {
  applyPayloadQueue,
  filterTree,
  findNode,
  findTreeNodeByPath,
  getDirtyFolderNameFromPath,
  normalizeTree,
  type RawTreeNode,
} from "./utils/testEditorTreeOps";
import { useTestEditorPageActive } from "./hooks/useTestEditorPageActive";
import { useTestEditorFolderWatch } from "./hooks/useTestEditorFolderWatch";
import { TestEditorWorkspaceArea } from "./components/TestEditorWorkspaceArea";
import { useConfigStore } from "@/store/configStore";
import { TestEditorToolbar } from "./components/TestEditorToolbar";
import ListeningRepackDialog from "./components/ListeningRepackDialog";
import { folderContainsMscScriptFiles } from "./utils/mscWorkspaceUtils";
import { normalizePackFolderName } from "./utils/packName";
import { applyFileTreeViewSort } from "./utils/fileTreeViewSort";
import { sortTreeByStarOrder, useFileTreeStarOrder } from "./utils/fileTreeStars";
import { useFileTreeViewOptions } from "./hooks/useFileTreeViewOptions";
import { useTestEditorWorkspace } from "@/hooks/useTestEditorWorkspace";
import { WorkspaceLayoutDialog } from "./components/workspace-layout/WorkspaceLayoutDialog";
import { NumdlbEditorModalHost } from "@/components/ssbh-model-preview/NumdlbEditorModalHost";
import type { NumdlbEditorWindowSession } from "@/components/ssbh-model-preview/NumdlbEditorModalWindow";
import {
  cloneNumdlbReadResult,
  assertNumdlbValidForSave,
  isNumdlbDraftDirty,
} from "@/components/ssbh-model-preview/numdlbEditorUtils";
import { NuhlpbEditorModalHost } from "@/components/ssbh-model-preview/NuhlpbEditorModalHost";
import type { NuhlpbEditorWindowSession } from "@/components/ssbh-model-preview/NuhlpbEditorModalWindow";
import {
  cloneNuhlpbReadResult,
  isNuhlpbDraftDirty,
} from "@/components/ssbh-model-preview/nuhlpbEditorUtils";
import { JnttblEditorModalHost } from "@/components/ssbh-model-preview/JnttblEditorModalHost";
import type { JnttblEditorWindowSession } from "@/components/ssbh-model-preview/JnttblEditorModalWindow";
import {
  assertJnttblValidForSave,
  cloneJnttblEditorDocument,
  computeNextJnttblDirtyState,
  readResultToEditorDocument,
  resolveJnttblBoneCountForSave,
} from "@/components/ssbh-model-preview/jnttblEditorUtils";
import {
  jnttblReadFile,
  jnttblWriteFile,
  type JnttblEditorDocument,
} from "@/components/ssbh-model-preview/jnttblIoService";
import {
  ssbhReadNumdlbMapping,
  ssbhWriteNumdlbMapping,
  ssbhReadNuhlpb,
  ssbhWriteNuhlpb,
  ssbhTemplateReadNumatb,
  ssbhTemplateWriteNumatb,
  type NumdlbReadResult,
  type NuhlpbReadResult,
} from "@/components/ssbh-model-preview/ssbhDaeIoService";
import { ensureMatlDataSerdeFields, type NumatbProfileKind } from "@/components/ssbh-model-preview/daeSsbhTypes";
import { NumatbEditorModalHost } from "@/components/ssbh-model-preview/NumatbEditorModalHost";
import type { NumatbEditorWindowSession } from "@/components/ssbh-model-preview/NumatbEditorModalWindow";
import {
  buildNumatbModalBundleFromLoadedFile,
  cloneNumatbBundle,
  detectNumatbProfileFromPath,
  type NumatbModalBundle,
} from "@/components/ssbh-model-preview/numatbEditorUtils";
import { EffectProjectEditorModalHost } from "@/components/ssbh-model-preview/EffectProjectEditorModalHost";
import type { EffectProjectEditorWindowSession } from "@/components/ssbh-model-preview/EffectProjectEditorModalWindow";
import {
  effectProjectReadFile,
  effectProjectWriteFile,
} from "@/components/ssbh-model-preview/effectProjectIoService";
import {
  assertEffectProjectValidForSave,
  cloneEffectProjectDocument,
  computeNextEffectProjectDirtyState,
  sortEffectProjectRowsByEffectProjectIdAscending,
  type EffectProjectEditorDocument,
} from "@/components/ssbh-model-preview/effectProjectEditorUtils";
import {
  EffectProjectAuxiliaryCacheService,
  createIdleAuxiliarySnapshot,
} from "@/components/ssbh-model-preview/effectProjectAuxiliaryCache";

const WATCH_COMMAND = "watch_folder";
const TEST_EDITOR_FOLDER_STORE_KEY = "testEditorFolder";

const TestEditorPage = () => {
  const store = useConfigStore((s) => s.store);
  const getSetting = useConfigStore((s) => s.getSetting);
  const [treeData, setTreeData] = useState<TestTreeNode[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [pendingRevealPath, setPendingRevealPath] = useState<string | null>(null);
  const pendingRevealRefreshAttemptedRef = useRef(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [currentDir, setCurrentDir] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedJsonPath, setSelectedJsonPath] = useState<string | null>(null);
  const [pendingJsonPath, setPendingJsonPath] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [dirtyFolders, setDirtyFolders] = useState<Set<string>>(new Set());
  const [isRepackDialogOpen, setIsRepackDialogOpen] = useState(false);
  const [isWorkspaceLayoutOpen, setIsWorkspaceLayoutOpen] = useState(false);
  const [obModPath, setObModPath] = useState("");
  const isPageActive = useTestEditorPageActive();
  const workspaceLayout = useTestEditorWorkspace(currentDir || null);
  // NOTE: This inline SSBH editor session management is LEGACY. The canonical,
  // reusable implementation now lives in
  // `@/components/ssbh-model-preview/useSsbhFileEditorSessions` + `SsbhFileEditorHosts`
  // (used by the Unit Model Editor). For the unit-model flow this inline copy is
  // deprecated; new consumers MUST use the shared hook. TestEditor is intentionally
  // left on this copy to avoid a risky refactor -- migrate when convenient.
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

  const [numatbSessions, setNumatbSessions] = useState<NumatbEditorWindowSession[]>([]);
  const [, startTreeTransition] = useTransition();
  const [, startNumatbTransition] = useTransition();
  const [, startEffectProjectTransition] = useTransition();
  const numatbZIndexRef = useRef(4000);
  const numatbSessionsRef = useRef(numatbSessions);
  numatbSessionsRef.current = numatbSessions;
  const [numatbGuard, setNumatbGuard] = useState<{ sessionId: string; action: "close" | "reload" } | null>(
    null,
  );

  const [effectProjectSessions, setEffectProjectSessions] = useState<EffectProjectEditorWindowSession[]>([]);
  const effectProjectZIndexRef = useRef(5000);
  const effectProjectZLayerSettersRef = useRef(new Map<string, (z: number) => void>());
  const effectProjectSessionsRef = useRef(effectProjectSessions);
  effectProjectSessionsRef.current = effectProjectSessions;
  const [effectProjectGuard, setEffectProjectGuard] = useState<{
    sessionId: string;
    action: "close" | "reload";
  } | null>(null);
  const effectProjectAuxiliaryCacheRef = useRef(new EffectProjectAuxiliaryCacheService());

  const flushQueuedPayloads = useCallback((queued: FolderChangePayload[]) => {
    if (!queued.length) return;
    startTreeTransition(() => {
      setTreeData((prev) => applyPayloadQueue(prev, queued));
    });

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
  }, [currentDir, startTreeTransition]);

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
      setNumatbSessions([]);
      setNumatbGuard(null);
      effectProjectAuxiliaryCacheRef.current.clearAllSessions();
      setEffectProjectSessions([]);
      setEffectProjectGuard(null);
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

  const deferredSearchTerm = useDeferredValue(searchTerm);

  const revealInTreeByPath = useCallback((targetPath: string) => {
    const trimmed = targetPath.trim();
    if (!trimmed) return;
    setSearchTerm("");
    pendingRevealRefreshAttemptedRef.current = false;
    setPendingRevealPath(trimmed);
  }, []);

  useEffect(() => {
    if (!pendingRevealPath || !currentDir) return;
    if (deferredSearchTerm.trim()) return;

    const node = findTreeNodeByPath(treeData, pendingRevealPath, currentDir);
    if (node) {
      setSelectedId(node.id);
      setPendingRevealPath(null);
      toast.success(`Revealed folder: ${node.name}`);
      return;
    }

    if (!pendingRevealRefreshAttemptedRef.current) {
      pendingRevealRefreshAttemptedRef.current = true;
      void refreshFolder();
      return;
    }

    setPendingRevealPath(null);
    toast.error("Folder not found in current workspace root");
  }, [pendingRevealPath, deferredSearchTerm, treeData, currentDir, refreshFolder]);

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
  const workspaceRootStructureJsonNames = useMemo(
    () =>
      treeData
        .filter((n) => !n.isDir && n.name.toLowerCase().endsWith("_structure.json"))
        .map((n) => n.name),
    [treeData],
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

  const registerEffectProjectZLayer = useCallback((sessionId: string, setZ: (z: number) => void) => {
    effectProjectZLayerSettersRef.current.set(sessionId, setZ);
    return () => {
      effectProjectZLayerSettersRef.current.delete(sessionId);
    };
  }, []);

  const closeEffectProjectSessionImmediately = useCallback((sessionId: string) => {
    effectProjectAuxiliaryCacheRef.current.cancelSession(sessionId);
    setEffectProjectSessions((prev) => prev.filter((x) => x.id !== sessionId));
  }, []);

  const startAuxiliaryScanForEffectProject = useCallback((sessionId: string, filePath: string) => {
    effectProjectAuxiliaryCacheRef.current.startScan({
      sessionId,
      effectProjectPath: filePath,
      onUpdate: (auxiliary) => {
        setEffectProjectSessions((prev) =>
          prev.map((session) => (session.id === sessionId ? { ...session, auxiliary } : session)),
        );
      },
    });
  }, []);

  const openEffectProjectSession = useCallback((filePath: string) => {
    const normalized = filePath.trim().toLowerCase();
    setEffectProjectSessions((prev) => {
      const existing = prev.find((s) => s.filePath.trim().toLowerCase() === normalized);
      if (existing) {
        const nextZ = ++effectProjectZIndexRef.current;
        queueMicrotask(() => {
          const setter = effectProjectZLayerSettersRef.current.get(existing.id);
          if (setter) setter(nextZ);
        });
        return prev;
      }
      const id = crypto.randomUUID();
      const nextZ = ++effectProjectZIndexRef.current;
      const newSession: EffectProjectEditorWindowSession = {
        id,
        filePath,
        loading: true,
        saving: false,
        loadError: null,
        baseData: null,
        draftData: null,
        draftSyncGeneration: 0,
        isDirty: false,
        zIndex: nextZ,
        auxiliary: createIdleAuxiliarySnapshot(),
      };
      void effectProjectReadFile(filePath)
        .then((data) => {
          const base = cloneEffectProjectDocument(data);
          const draft = cloneEffectProjectDocument(data);
          setEffectProjectSessions((p) =>
            p.map((s) =>
              s.id === id
                ? {
                    ...s,
                    loading: false,
                    loadError: null,
                    baseData: base,
                    draftData: draft,
                    draftSyncGeneration: 1,
                    isDirty: false,
                    auxiliary: createIdleAuxiliarySnapshot(),
                  }
                : s,
            ),
          );
          queueMicrotask(() => {
            startAuxiliaryScanForEffectProject(id, filePath);
          });
        })
        .catch((err) => {
          setEffectProjectSessions((p) =>
            p.map((s) => (s.id === id ? { ...s, loading: false, loadError: String(err) } : s)),
          );
        });
      return [...prev, newSession];
    });
  }, [startAuxiliaryScanForEffectProject]);

  const activateEffectProjectSession = useCallback((sessionId: string) => {
    const nextZ = ++effectProjectZIndexRef.current;
    const setter = effectProjectZLayerSettersRef.current.get(sessionId);
    if (setter) setter(nextZ);
  }, []);

  const updateEffectProjectDraft = useCallback((sessionId: string, next: EffectProjectEditorDocument) => {
    startEffectProjectTransition(() => {
      setEffectProjectSessions((prev) =>
        prev.map((s) => {
          if (s.id !== sessionId) return s;
          return {
            ...s,
            draftData: next,
            isDirty: computeNextEffectProjectDirtyState({
              base: s.baseData,
              draft: next,
            }),
          };
        }),
      );
    });
  }, [startEffectProjectTransition]);

  const saveEffectProjectSession = useCallback(async (sessionId: string, forcedDraft?: EffectProjectEditorDocument) => {
    const snapshot = effectProjectSessionsRef.current.find((x) => x.id === sessionId);
    if (!snapshot) return;
    const draft = forcedDraft ?? snapshot.draftData;
    if (!draft) return;
    const sortedForSave = sortEffectProjectRowsByEffectProjectIdAscending(cloneEffectProjectDocument(draft));
    try {
      assertEffectProjectValidForSave(sortedForSave);
    } catch (e) {
      toast.error(String(e));
      return;
    }
    const path = snapshot.filePath;
    setEffectProjectSessions((prev) => prev.map((x) => (x.id === sessionId ? { ...x, saving: true } : x)));
    try {
      await effectProjectWriteFile({ filePath: path, document: sortedForSave });
      const fresh = await effectProjectReadFile(path);
      const saved = cloneEffectProjectDocument(fresh);
      setEffectProjectSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId
            ? {
                ...s,
                saving: false,
                baseData: saved,
                draftData: saved,
                isDirty: false,
                draftSyncGeneration: (s.draftSyncGeneration ?? 0) + 1,
              }
            : s,
        ),
      );
      toast.success("Saved effect project");
    } catch (e) {
      toast.error(String(e));
      setEffectProjectSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, saving: false } : s)));
    }
  }, []);

  const resetEffectProjectSession = useCallback((sessionId: string) => {
    setEffectProjectSessions((prev) =>
      prev.map((s) => {
        if (s.id !== sessionId || !s.baseData) return s;
        return {
          ...s,
          draftData: cloneEffectProjectDocument(s.baseData),
          isDirty: false,
          draftSyncGeneration: (s.draftSyncGeneration ?? 0) + 1,
        };
      }),
    );
  }, []);

  const reloadEffectProjectSession = useCallback(async (sessionId: string) => {
    let fp = "";
    effectProjectAuxiliaryCacheRef.current.cancelSession(sessionId);
    setEffectProjectSessions((prev) => {
      const s = prev.find((x) => x.id === sessionId);
      if (!s) return prev;
      fp = s.filePath;
      return prev.map((x) =>
        x.id === sessionId
          ? { ...x, loading: true, loadError: null, auxiliary: createIdleAuxiliarySnapshot() }
          : x,
      );
    });
    if (!fp) return;
    try {
      const data = await effectProjectReadFile(fp);
      const base = cloneEffectProjectDocument(data);
      const draft = cloneEffectProjectDocument(data);
      setEffectProjectSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId
            ? {
                ...s,
                loading: false,
                loadError: null,
                baseData: base,
                draftData: draft,
                isDirty: false,
                draftSyncGeneration: (s.draftSyncGeneration ?? 0) + 1,
                auxiliary: createIdleAuxiliarySnapshot(),
              }
            : s,
        ),
      );
      queueMicrotask(() => {
        startAuxiliaryScanForEffectProject(sessionId, fp);
      });
      toast.success("Reloaded effect project from disk");
    } catch (e) {
      const msg = String(e);
      setEffectProjectSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, loading: false, loadError: msg } : s)),
      );
      toast.error(msg);
    }
  }, [startAuxiliaryScanForEffectProject]);

  const requestCloseEffectProjectSession = useCallback((sessionId: string) => {
    const s = effectProjectSessionsRef.current.find((x) => x.id === sessionId);
    if (!s) return;
    if (s.isDirty) {
      setEffectProjectGuard({ sessionId, action: "close" });
      return;
    }
    closeEffectProjectSessionImmediately(sessionId);
  }, [closeEffectProjectSessionImmediately]);

  const requestReloadEffectProjectSession = useCallback(
    (sessionId: string) => {
      const s = effectProjectSessionsRef.current.find((x) => x.id === sessionId);
      if (!s) return;
      if (s.isDirty) {
        setEffectProjectGuard({ sessionId, action: "reload" });
        return;
      }
      void reloadEffectProjectSession(sessionId);
    },
    [reloadEffectProjectSession],
  );

  const dismissEffectProjectGuard = useCallback(() => {
    setEffectProjectGuard(null);
  }, []);

  const discardEffectProjectGuard = useCallback(() => {
    setEffectProjectGuard((g) => {
      if (!g) return null;
      const { sessionId, action } = g;
      if (action === "close") {
        closeEffectProjectSessionImmediately(sessionId);
      } else {
        void reloadEffectProjectSession(sessionId);
      }
      return null;
    });
  }, [closeEffectProjectSessionImmediately, reloadEffectProjectSession]);

  const saveAndFinishEffectProjectGuard = useCallback(async () => {
    if (!effectProjectGuard) return;
    const { sessionId, action } = effectProjectGuard;
    await saveEffectProjectSession(sessionId);
    const s = effectProjectSessionsRef.current.find((x) => x.id === sessionId);
    if (!s) return;
    if (s.isDirty) return;
    setEffectProjectGuard(null);
    if (action === "close") {
      closeEffectProjectSessionImmediately(sessionId);
    } else {
      void reloadEffectProjectSession(sessionId);
    }
  }, [
    closeEffectProjectSessionImmediately,
    effectProjectGuard,
    saveEffectProjectSession,
    reloadEffectProjectSession,
  ]);

  const openNumatbSession = useCallback((filePath: string) => {
    const normalized = filePath.trim().toLowerCase();
    setNumatbSessions((prev) => {
      const existing = prev.find((s) => s.filePath.trim().toLowerCase() === normalized);
      if (existing) {
        const nextZ = ++numatbZIndexRef.current;
        return prev.map((s) => (s.id === existing.id ? { ...s, zIndex: nextZ } : s));
      }
      const id = crypto.randomUUID();
      const nextZ = ++numatbZIndexRef.current;
      const primaryProfile = detectNumatbProfileFromPath(filePath);
      const newSession: NumatbEditorWindowSession = {
        id,
        filePath,
        primaryProfile,
        loading: true,
        saving: false,
        loadError: null,
        baseData: null,
        draftData: null,
        isDirty: false,
        zIndex: nextZ,
      };
      void ssbhTemplateReadNumatb(filePath)
        .then((data) => {
          const bundle = buildNumatbModalBundleFromLoadedFile(data, primaryProfile);
          const base = cloneNumatbBundle(bundle);
          const draft = cloneNumatbBundle(bundle);
          setNumatbSessions((p) =>
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
          setNumatbSessions((p) =>
            p.map((s) => (s.id === id ? { ...s, loading: false, loadError: String(err) } : s)),
          );
        });
      return [...prev, newSession];
    });
  }, []);

  const activateNumatbSession = useCallback((sessionId: string) => {
    setNumatbSessions((prev) => {
      const nextZ = ++numatbZIndexRef.current;
      return prev.map((s) => (s.id === sessionId ? { ...s, zIndex: nextZ } : s));
    });
  }, []);

  const updateNumatbDraft = useCallback((sessionId: string, next: NumatbModalBundle) => {
    startNumatbTransition(() => {
      setNumatbSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, draftData: next, isDirty: true } : s)),
      );
    });
  }, [startNumatbTransition]);

  const saveNumatbSession = useCallback(async (sessionId: string) => {
    const snapshot = numatbSessionsRef.current.find((x) => x.id === sessionId);
    if (!snapshot?.draftData) return;
    const draft = snapshot.draftData;
    const path = snapshot.filePath;
    const matl =
      snapshot.primaryProfile === "maya"
        ? ensureMatlDataSerdeFields(draft.mayaFile)
        : ensureMatlDataSerdeFields(draft.nustFile);
    setNumatbSessions((prev) => prev.map((x) => (x.id === sessionId ? { ...x, saving: true } : x)));
    try {
      await ssbhTemplateWriteNumatb(path, matl);
      const savedBundle = cloneNumatbBundle(draft);
      setNumatbSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId
            ? {
                ...s,
                saving: false,
                baseData: savedBundle,
                draftData: savedBundle,
                isDirty: false,
              }
            : s,
        ),
      );
      toast.success("Saved NUMATB");
    } catch (e) {
      toast.error(String(e));
      setNumatbSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, saving: false } : s)));
    }
  }, []);

  const resetNumatbSession = useCallback((sessionId: string) => {
    setNumatbSessions((prev) =>
      prev.map((s) => {
        if (s.id !== sessionId || !s.baseData) return s;
        return { ...s, draftData: cloneNumatbBundle(s.baseData), isDirty: false };
      }),
    );
  }, []);

  const reloadNumatbSession = useCallback(async (sessionId: string) => {
    let fp = "";
    let profile: NumatbProfileKind = "nust";
    setNumatbSessions((prev) => {
      const s = prev.find((x) => x.id === sessionId);
      if (!s) return prev;
      fp = s.filePath;
      profile = s.primaryProfile;
      return prev.map((x) => (x.id === sessionId ? { ...x, loading: true, loadError: null } : x));
    });
    if (!fp) return;
    try {
      const data = await ssbhTemplateReadNumatb(fp);
      const bundle = buildNumatbModalBundleFromLoadedFile(data, profile);
      const base = cloneNumatbBundle(bundle);
      const draft = cloneNumatbBundle(bundle);
      setNumatbSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId
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
      toast.success("Reloaded NUMATB from disk");
    } catch (e) {
      const msg = String(e);
      setNumatbSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, loading: false, loadError: msg } : s)),
      );
      toast.error(msg);
    }
  }, []);

  const requestCloseNumatbSession = useCallback((sessionId: string) => {
    const s = numatbSessionsRef.current.find((x) => x.id === sessionId);
    if (!s) return;
    if (s.isDirty) {
      setNumatbGuard({ sessionId, action: "close" });
      return;
    }
    setNumatbSessions((prev) => prev.filter((x) => x.id !== sessionId));
  }, []);

  const requestReloadNumatbSession = useCallback(
    (sessionId: string) => {
      const s = numatbSessionsRef.current.find((x) => x.id === sessionId);
      if (!s) return;
      if (s.isDirty) {
        setNumatbGuard({ sessionId, action: "reload" });
        return;
      }
      void reloadNumatbSession(sessionId);
    },
    [reloadNumatbSession],
  );

  const dismissNumatbGuard = useCallback(() => {
    setNumatbGuard(null);
  }, []);

  const discardNumatbGuard = useCallback(() => {
    setNumatbGuard((g) => {
      if (!g) return null;
      const { sessionId, action } = g;
      if (action === "close") {
        setNumatbSessions((prev) => prev.filter((x) => x.id !== sessionId));
      } else {
        void reloadNumatbSession(sessionId);
      }
      return null;
    });
  }, [reloadNumatbSession]);

  const saveAndFinishNumatbGuard = useCallback(async () => {
    if (!numatbGuard) return;
    const { sessionId, action } = numatbGuard;
    await saveNumatbSession(sessionId);
    const s = numatbSessionsRef.current.find((x) => x.id === sessionId);
    if (!s) return;
    if (s.isDirty) {
      return;
    }
    setNumatbGuard(null);
    if (action === "close") {
      setNumatbSessions((prev) => prev.filter((x) => x.id !== sessionId));
    } else {
      void reloadNumatbSession(sessionId);
    }
  }, [numatbGuard, saveNumatbSession, reloadNumatbSession]);

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

      if (lower.endsWith(".numatb")) {
        setSelectedId(node.id);
        openNumatbSession(node.path);
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
    [hasUnsavedChanges, selectedJsonPath, openNumdlbSession, openNuhlpbSession, openJnttblSession, openNumatbSession],
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
        onOpenWorkspaceLayout={() => setIsWorkspaceLayoutOpen(true)}
        onRepack={() => setIsRepackDialogOpen(true)}
        onClearDirty={() => setDirtyFolders(new Set())}
      />
      </div>

      <div className="flex-1 min-h-0 p-2 overflow-hidden">
        <TestEditorWorkspaceArea
          folderStoreKey={TEST_EDITOR_FOLDER_STORE_KEY}
          currentDir={currentDir}
          fileTreeData={fileTreeData}
          onFileSelect={handleFileSelect}
          selectedId={selectedId}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          onPickFolder={loadFolder}
          onRefresh={refreshFolder}
          isLoading={isLoading}
          selectedJsonPath={selectedJsonPath}
          hasUnsavedChanges={hasUnsavedChanges}
          dirtyFolderList={dirtyFolderList}
          workspaceTopLevelFolderNames={workspaceTopLevelFolderNames}
          workspaceRootStructureJsonNames={workspaceRootStructureJsonNames}
          fileTreeStructureScanKey={fileTreeStructureScanKey}
          obModPath={obModPath}
          onFolderRepacked={handleRepackSuccess}
          starredPathSet={starredPathSet}
          onToggleStar={toggleStar}
          viewOptions={viewOptions}
          onViewOptionsChange={setViewOptions}
          mscWorkspaceFolderPath={mscWorkspaceFolderPath}
          onMscWorkspaceFolderChange={setMscWorkspaceFolderPath}
          onUnsavedChanges={setHasUnsavedChanges}
          onRevealTreeFolder={revealInTreeByPath}
          selectedNode={selectedNode}
          onOpenAsEffectProject={openEffectProjectSession}
        />
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

      <WorkspaceLayoutDialog
        open={isWorkspaceLayoutOpen}
        controller={workspaceLayout}
        onOpenChange={setIsWorkspaceLayoutOpen}
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

      <NumatbEditorModalHost
        sessions={numatbSessions}
        onActivateSession={activateNumatbSession}
        onCloseRequest={requestCloseNumatbSession}
        onReloadRequest={requestReloadNumatbSession}
        onDraftChange={updateNumatbDraft}
        onSave={saveNumatbSession}
        onReset={resetNumatbSession}
      />

      <AlertDialog
        open={numatbGuard !== null}
        onOpenChange={(open) => {
          if (!open) setNumatbGuard(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved NUMATB changes</AlertDialogTitle>
            <AlertDialogDescription>
              {numatbGuard?.action === "close"
                ? "Save before closing, discard edits, or cancel."
                : "Save before reloading from disk, discard edits, or cancel."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
            <AlertDialogCancel type="button" onClick={dismissNumatbGuard}>
              Cancel
            </AlertDialogCancel>
            <Button type="button" variant="outline" onClick={discardNumatbGuard}>
              Discard
            </Button>
            <Button type="button" onClick={() => void saveAndFinishNumatbGuard()}>
              {numatbGuard?.action === "close" ? "Save and close" : "Save and reload"}
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

      <EffectProjectEditorModalHost
        sessions={effectProjectSessions}
        onRegisterZLayer={registerEffectProjectZLayer}
        onActivateSession={activateEffectProjectSession}
        onCloseRequest={requestCloseEffectProjectSession}
        onReloadRequest={requestReloadEffectProjectSession}
        onDraftChange={updateEffectProjectDraft}
        onSave={saveEffectProjectSession}
        onReset={resetEffectProjectSession}
      />

      <AlertDialog
        open={effectProjectGuard !== null}
        onOpenChange={(open) => {
          if (!open) setEffectProjectGuard(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved effect project changes</AlertDialogTitle>
            <AlertDialogDescription>
              {effectProjectGuard?.action === "close"
                ? "Save before closing, discard edits, or cancel."
                : "Save before reloading from disk, discard edits, or cancel."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
            <AlertDialogCancel type="button" onClick={dismissEffectProjectGuard}>
              Cancel
            </AlertDialogCancel>
            <Button type="button" variant="outline" onClick={discardEffectProjectGuard}>
              Discard
            </Button>
            <Button type="button" onClick={() => void saveAndFinishEffectProjectGuard()}>
              {effectProjectGuard?.action === "close" ? "Save and close" : "Save and reload"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default TestEditorPage;

