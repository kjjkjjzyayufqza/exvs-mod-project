import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { WorkspacePackIdentity } from "@/services/testEditorWorkspace/types";
import {
  addMotionItemNode,
  copyMotionSourceToItem,
  deleteMotionNodeFiles,
  getMotionNodeParentFolder,
  inspectMotionFolder,
  motionNodeMatchesQuery,
  normalizeMotionEntryName,
  normalizeMotionUnk1Input,
  normalizeMotionUnk2Input,
  removeMotionNode,
  renameMotionDiskPaths,
  replaceMotionItemFile,
  saveMotionFolderStructure,
  updateMotionNode,
  type MotionFolderInventory,
  type MotionFolderNode,
  type MotionItemNode,
  type MotionStructureNode,
} from "@/services/motionFolder/motionFolderService";
import {
  flattenMotionNodes,
  motionListItemKey,
  motionNodesToTreeData,
} from "./motionFolderEditorUtils";
import {
  getMotionFolderPackSelection,
  rememberMotionFolderPackSelection,
  rememberMotionFolderPath,
  sanitizeMotionFolderPackSelection,
  type MotionFolderPackSelectionState,
} from "./motionFolderEditorSettings";

export type MotionFolderEditorLoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; inventory: MotionFolderInventory; pack: WorkspacePackIdentity };

type UseMotionFolderEditorParams = {
  workspaceRoot: string;
  pack: WorkspacePackIdentity;
  isActive: boolean;
  onUnsavedChanges?: (hasChanges: boolean) => void;
  onPackMutated?: (pack: WorkspacePackIdentity) => void;
  onActivePackChange?: (pack: WorkspacePackIdentity) => void;
};

export type MotionEditDraft = {
  name: string;
  unk1: string;
  unk2: string;
};

function selectionStateFromEditor(
  searchQuery: string,
  selectedKeys: Set<string>,
  focusedKey: string | null,
): MotionFolderPackSelectionState {
  return {
    category: "all",
    searchQuery,
    focusedKey,
    selectedKeys: [...selectedKeys],
  };
}

function selectedParentFolderId(nodes: MotionStructureNode[], focusedKey: string | null): string {
  const selectedParent = getMotionNodeParentFolder(nodes, focusedKey);
  if (selectedParent) return selectedParent.id;
  const firstFolder = flattenMotionNodes(nodes).find((node): node is MotionFolderNode => node.kind === "folder");
  return firstFolder?.id ?? "";
}

export function useMotionFolderEditor({
  workspaceRoot,
  pack,
  isActive,
  onUnsavedChanges,
  onPackMutated,
}: UseMotionFolderEditorParams) {
  const motionRoot = pack.folderPath;
  const structureJsonPath = pack.structureJsonPath;
  const [loadState, setLoadState] = useState<MotionFolderEditorLoadState>({ status: "idle" });
  const [nodes, setNodes] = useState<MotionStructureNode[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [searchQuery, setSearchQueryState] = useState("");
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  const [focusedKey, setFocusedKeyState] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<MotionEditDraft>({ name: "", unk1: "00000000", unk2: "00000000" });
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const lastLoadedKeyRef = useRef("");
  const selectionPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const inventory = loadState.status === "ready" ? loadState.inventory : null;

  const persistSelection = useCallback(
    (next: MotionFolderPackSelectionState) => {
      if (!workspaceRoot.trim()) return;
      if (selectionPersistTimerRef.current) {
        clearTimeout(selectionPersistTimerRef.current);
      }
      selectionPersistTimerRef.current = setTimeout(() => {
        void rememberMotionFolderPackSelection(workspaceRoot, pack.packKey, next);
      }, 250);
    },
    [pack.packKey, workspaceRoot],
  );

  const applySelection = useCallback(
    (keys: Set<string>, focused: string | null) => {
      setSelectedKeys(keys);
      setFocusedKeyState(focused);
      persistSelection(selectionStateFromEditor(searchQuery, keys, focused));
    },
    [persistSelection, searchQuery],
  );

  const markUnsaved = useCallback(() => {
    setHasUnsavedChanges(true);
  }, []);

  useEffect(() => {
    onUnsavedChanges?.(hasUnsavedChanges);
  }, [hasUnsavedChanges, onUnsavedChanges]);

  const applyPersistedSelection = useCallback(
    (flatNodes: MotionStructureNode[], persisted: MotionFolderPackSelectionState) => {
      const validKeys = new Set(flatNodes.map((node) => motionListItemKey(node)));
      const sanitized = sanitizeMotionFolderPackSelection(persisted, validKeys);
      setSearchQueryState(sanitized.searchQuery);
      setSelectedKeys(new Set(sanitized.selectedKeys));
      setFocusedKeyState(sanitized.focusedKey);
    },
    [],
  );

  const setSearchQuery = useCallback(
    (value: string) => {
      setSearchQueryState(value);
      persistSelection(selectionStateFromEditor(value, selectedKeys, focusedKey));
    },
    [focusedKey, persistSelection, selectedKeys],
  );

  const handleTreeSelectionChange = useCallback(
    (keys: Set<string>, focused: string | null) => {
      applySelection(keys, focused);
    },
    [applySelection],
  );

  const reload = useCallback(
    async (options?: { silent?: boolean; preserveSelection?: boolean; restoreSelection?: boolean }) => {
      if (!motionRoot.trim() || !structureJsonPath.trim()) {
        setLoadState({ status: "idle" });
        return;
      }

      const preserveSelection = options?.preserveSelection === true;
      const restoreSelection = options?.restoreSelection === true;
      const selectedSnapshot = preserveSelection ? new Set(selectedKeys) : new Set<string>();
      const focusedSnapshot = preserveSelection ? focusedKey : null;

      if (!options?.silent) {
        setBusyAction("load");
        setLoadState({ status: "loading" });
      }

      try {
        const nextInventory = await inspectMotionFolder(motionRoot, structureJsonPath);
        setLoadState({ status: "ready", inventory: nextInventory, pack });
        setNodes(nextInventory.nodes);
        setHasUnsavedChanges(false);

        const flatNodes = flattenMotionNodes(nextInventory.nodes);
        if (preserveSelection) {
          setSelectedKeys(selectedSnapshot);
          setFocusedKeyState(focusedSnapshot);
        } else if (restoreSelection && workspaceRoot.trim()) {
          const persisted = await getMotionFolderPackSelection(workspaceRoot, pack.packKey);
          if (persisted) {
            applyPersistedSelection(flatNodes, persisted);
          } else {
            setSelectedKeys(new Set());
            setFocusedKeyState(null);
          }
        } else {
          setSelectedKeys(new Set());
          setFocusedKeyState(null);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setLoadState({ status: "error", message });
      } finally {
        if (!options?.silent) {
          setBusyAction(null);
        }
      }
    },
    [
      applyPersistedSelection,
      focusedKey,
      motionRoot,
      pack,
      selectedKeys,
      structureJsonPath,
      workspaceRoot,
    ],
  );

  useEffect(() => {
    if (!isActive) return;
    const key = `${motionRoot}::${structureJsonPath}`;
    if (key === lastLoadedKeyRef.current) return;
    lastLoadedKeyRef.current = key;
    void reload({ restoreSelection: true });
  }, [isActive, motionRoot, reload, structureJsonPath]);

  useEffect(() => {
    return () => {
      if (selectionPersistTimerRef.current) {
        clearTimeout(selectionPersistTimerRef.current);
      }
    };
  }, []);

  const treeData = useMemo(() => motionNodesToTreeData(nodes), [nodes]);
  const flatNodes = useMemo(() => flattenMotionNodes(nodes), [nodes]);
  const folders = useMemo(
    () => flatNodes.filter((node): node is MotionFolderNode => node.kind === "folder"),
    [flatNodes],
  );

  const nodeByKey = useMemo(() => {
    const map = new Map<string, MotionStructureNode>();
    for (const node of flatNodes) {
      map.set(motionListItemKey(node), node);
    }
    return map;
  }, [flatNodes]);

  const selectedNodes = useMemo(() => {
    const out: MotionStructureNode[] = [];
    for (const key of selectedKeys) {
      const node = nodeByKey.get(key);
      if (node) out.push(node);
    }
    return out;
  }, [nodeByKey, selectedKeys]);

  const focusedNode = focusedKey ? (nodeByKey.get(focusedKey) ?? null) : null;
  const focusedItem = focusedNode?.kind === "item" ? focusedNode : null;
  const selectedItems = useMemo(
    () => selectedNodes.filter((node): node is MotionItemNode => node.kind === "item"),
    [selectedNodes],
  );
  const defaultParentFolderId = useMemo(
    () => selectedParentFolderId(nodes, focusedKey),
    [focusedKey, nodes],
  );

  useEffect(() => {
    if (!focusedNode) {
      setEditDraft({ name: "", unk1: "00000000", unk2: "00000000" });
      return;
    }
    setEditDraft({ name: focusedNode.name, unk1: focusedNode.unk1, unk2: focusedNode.unk2 });
  }, [focusedNode]);

  const selectAllSearchMatches = useCallback(() => {
    const matches = searchQuery.trim()
      ? flatNodes.filter((node) => motionNodeMatchesQuery(node, searchQuery))
      : flatNodes;
    const keys = new Set(matches.map((node) => node.id));
    applySelection(keys, matches[matches.length - 1]?.id ?? null);
  }, [applySelection, flatNodes, searchQuery]);

  const clearSelection = useCallback(() => {
    applySelection(new Set(), null);
  }, [applySelection]);

  const runAdd = useCallback(
    async (params: { sourcePath: string; name: string; unk1: string; unk2: string; parentFolderId: string }) => {
      if (!inventory) return;
      setBusyAction("add");
      try {
        const result = addMotionItemNode({
          nodes,
          parentFolderId: params.parentFolderId,
          sourcePath: params.sourcePath,
          name: params.name,
          unk1: params.unk1,
          unk2: params.unk2,
          rootName: inventory.rootName,
          motionRoot: inventory.motionRoot,
        });
        await copyMotionSourceToItem(params.sourcePath, result.targetPath);
        setNodes(result.nodes);
        applySelection(new Set([result.item.id]), result.item.id);
        markUnsaved();
        toast.success("Motion file added");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error));
        throw error;
      } finally {
        setBusyAction(null);
      }
    },
    [applySelection, inventory, markUnsaved, nodes],
  );

  const runEdit = useCallback(async () => {
    if (!inventory || !focusedNode) return;
    setBusyAction("edit");
    try {
      normalizeMotionEntryName(editDraft.name);
      normalizeMotionUnk1Input(editDraft.unk1);
      normalizeMotionUnk2Input(editDraft.unk2);
      const result = updateMotionNode({
        nodes,
        nodeId: focusedNode.id,
        name: editDraft.name,
        unk1: editDraft.unk1,
        unk2: editDraft.unk2,
        rootName: inventory.rootName,
        motionRoot: inventory.motionRoot,
      });
      await renameMotionDiskPaths(result.renamedPaths);
      setNodes(result.nodes);
      applySelection(selectedKeys, focusedNode.id);
      markUnsaved();
      toast.success("Motion entry updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyAction(null);
    }
  }, [applySelection, editDraft, focusedNode, inventory, markUnsaved, nodes, selectedKeys]);

  const runReplace = useCallback(
    async (sourcePath: string) => {
      if (!focusedItem) return;
      setBusyAction("replace");
      try {
        await replaceMotionItemFile(sourcePath, focusedItem);
        onPackMutated?.(pack);
        if (workspaceRoot.trim()) {
          void rememberMotionFolderPath(workspaceRoot, pack.folderPath);
        }
        toast.success("Motion file replaced");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error));
      } finally {
        setBusyAction(null);
      }
    },
    [focusedItem, onPackMutated, pack, workspaceRoot],
  );

  const runRemove = useCallback(
    async (deleteFilesOnDisk: boolean) => {
      if (!inventory || selectedNodes.length === 0) return;
      setBusyAction("remove");
      try {
        let nextNodes = nodes;
        const removedNodes: MotionStructureNode[] = [];
        for (const node of selectedNodes) {
          const result = removeMotionNode(nextNodes, node.id);
          if (!result.removed) continue;
          removedNodes.push(result.removed);
          nextNodes = result.nodes;
        }
        if (deleteFilesOnDisk) {
          for (const removed of removedNodes) {
            await deleteMotionNodeFiles(removed, inventory.motionRoot);
          }
        }
        setNodes(nextNodes);
        applySelection(new Set(), null);
        markUnsaved();
        toast.success(
          removedNodes.length === 1 ? "Motion entry removed" : `${removedNodes.length} entries removed`,
        );
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error));
      } finally {
        setBusyAction(null);
      }
    },
    [applySelection, inventory, markUnsaved, nodes, selectedNodes],
  );

  const runSave = useCallback(async () => {
    if (!inventory) return;
    setBusyAction("save");
    try {
      await saveMotionFolderStructure({
        project: inventory.project,
        nodes,
        rootName: inventory.rootName,
        structureJsonPath: inventory.structureJsonPath,
      });
      onPackMutated?.(pack);
      if (workspaceRoot.trim()) {
        void rememberMotionFolderPath(workspaceRoot, pack.folderPath);
      }
      toast.success("Motion structure saved");
      await reload({ preserveSelection: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyAction(null);
    }
  }, [inventory, nodes, onPackMutated, pack, reload, workspaceRoot]);

  return {
    loadState,
    inventory,
    treeData,
    flatNodes,
    folders,
    searchQuery,
    setSearchQuery,
    selectedKeys,
    selectedNodes,
    selectedItems,
    focusedKey,
    focusedNode,
    focusedItem,
    handleTreeSelectionChange,
    selectAllSearchMatches,
    clearSelection,
    editDraft,
    setEditDraft,
    hasUnsavedChanges,
    busyAction,
    reload,
    runAdd,
    runEdit,
    runReplace,
    runRemove,
    runSave,
    defaultParentFolderId,
  };
}
