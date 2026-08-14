import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { WorkspacePackIdentity } from "@/services/testEditorWorkspace/types";
import {
  addMotionFolderBundle,
  addMotionItemNode,
  copyMotionSourceToItem,
  deleteMotionNodeFiles,
  getMotionNodeParentFolder,
  inspectMotionFolder,
  motionNodeMatchesQuery,
  moveMotionFolderChild,
  normalizeMotionEntryName,
  normalizeMotionUnk1Input,
  normalizeMotionUnk2Input,
  removeMotionNode,
  renameMotionDiskPaths,
  reorderMotionFolderChildren,
  replaceMotionItemFile,
  saveMotionFolderStructure,
  updateMotionNode,
  type MotionFolderInventory,
  type MotionFolderNode,
  type MotionItemNode,
  type MotionStructureNode,
} from "@/services/motionFolder/motionFolderService";
import type { AddMotionParams } from "./MotionFolderAddDialog";
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
    async (params: AddMotionParams) => {
      if (!inventory) return;
      setBusyAction("add");
      try {
        let nextNodes: MotionStructureNode[];
        let selectPathKey: string;
        let selectName: string;
        let selectKind: "item" | "folder";
        let successMessage: string;

        const replaceExisting = params.replaceExisting === true;
        if (params.mode === "file") {
          const result = addMotionItemNode({
            nodes,
            parentFolderId: params.parentFolderId,
            sourcePath: params.sourcePath,
            name: params.name,
            unk1: params.unk1,
            unk2: params.unk2,
            rootName: inventory.rootName,
            motionRoot: inventory.motionRoot,
            replaceExisting,
          });
          await copyMotionSourceToItem(params.sourcePath, result.targetPath, {
            overwrite: replaceExisting,
          });
          nextNodes = result.nodes;
          selectPathKey = result.item.pathSegments.join("/");
          selectName = result.item.name;
          selectKind = "item";
          successMessage = replaceExisting
            ? "Motion file replaced and structure JSON saved"
            : "Motion file added and structure JSON saved";
        } else {
          const result = addMotionFolderBundle({
            nodes,
            parentFolderId: params.parentFolderId,
            folderName: params.folderName,
            actionId: params.actionId,
            unk3: params.unk3,
            clips: params.clips,
            rootName: inventory.rootName,
            motionRoot: inventory.motionRoot,
            replaceExisting,
          });
          for (const job of result.copyJobs) {
            await copyMotionSourceToItem(job.sourcePath, job.targetPath, {
              overwrite: replaceExisting,
            });
          }
          nextNodes = result.nodes;
          selectPathKey = result.folder.pathSegments.join("/");
          selectName = result.folder.name;
          selectKind = "folder";
          successMessage = replaceExisting
            ? `Folder bundle replaced (${result.items.length} clips) and structure JSON saved`
            : `Folder bundle added (${result.items.length} clips) and structure JSON saved`;
        }

        // Persist structure JSON so disk matches memory (files + sibling *_structure.json).
        await saveMotionFolderStructure({
          project: inventory.project,
          nodes: nextNodes,
          rootName: inventory.rootName,
          structureJsonPath: inventory.structureJsonPath,
        });
        // Re-read after serialize: fileIndex may be remapped for items.
        const nextInventory = await inspectMotionFolder(inventory.motionRoot, inventory.structureJsonPath);
        setLoadState({ status: "ready", inventory: nextInventory, pack });
        setNodes(nextInventory.nodes);
        setHasUnsavedChanges(false);

        const added =
          selectKind === "item"
            ? (nextInventory.items.find(
                (item) => item.name === selectName && item.pathSegments.join("/") === selectPathKey,
              ) ?? null)
            : (nextInventory.folders.find(
                (folder) => folder.name === selectName && folder.pathSegments.join("/") === selectPathKey,
              ) ?? null);
        if (added) {
          applySelection(new Set([added.id]), added.id);
        } else {
          applySelection(new Set(), null);
        }
        onPackMutated?.(pack);
        if (workspaceRoot.trim()) {
          void rememberMotionFolderPath(workspaceRoot, pack.folderPath);
        }
        toast.success(successMessage);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error));
        throw error;
      } finally {
        setBusyAction(null);
      }
    },
    [applySelection, inventory, nodes, onPackMutated, pack, workspaceRoot],
  );

  const runEdit = useCallback(
    async (draftOverride?: Partial<MotionEditDraft>) => {
      if (!inventory || !focusedNode) return;
      const draft: MotionEditDraft = {
        name: draftOverride?.name ?? editDraft.name,
        unk1: draftOverride?.unk1 ?? editDraft.unk1,
        unk2: draftOverride?.unk2 ?? editDraft.unk2,
      };
      setBusyAction("edit");
      try {
        normalizeMotionEntryName(draft.name);
        normalizeMotionUnk1Input(draft.unk1);
        normalizeMotionUnk2Input(draft.unk2);
        setEditDraft(draft);
        const result = updateMotionNode({
          nodes,
          nodeId: focusedNode.id,
          name: draft.name,
          unk1: draft.unk1,
          unk2: draft.unk2,
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
    },
    [applySelection, editDraft, focusedNode, inventory, markUnsaved, nodes, selectedKeys],
  );

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

  const runReorderFolderChildren = useCallback(
    (folderId: string, orderedChildIds: string[]) => {
      try {
        const nextNodes = reorderMotionFolderChildren({
          nodes,
          folderId,
          orderedChildIds,
        });
        setNodes(nextNodes);
        markUnsaved();
        toast.success("Child order updated (Save to write structure JSON)");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error));
      }
    },
    [markUnsaved, nodes],
  );

  const runMoveFolderChild = useCallback(
    (folderId: string, childId: string, direction: "up" | "down") => {
      try {
        const nextNodes = moveMotionFolderChild({
          nodes,
          folderId,
          childId,
          direction,
        });
        if (nextNodes === nodes) return;
        setNodes(nextNodes);
        markUnsaved();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error));
      }
    },
    [markUnsaved, nodes],
  );

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
    runReorderFolderChildren,
    runMoveFolderChild,
    defaultParentFolderId,
  };
}
