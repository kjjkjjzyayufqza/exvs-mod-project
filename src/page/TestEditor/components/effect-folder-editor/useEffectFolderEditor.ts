import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { WorkspacePackIdentity } from "@/services/testEditorWorkspace/types";
import type {
  EffectFolderInventory,
  EffectFolderValidationResult,
} from "@/services/effectFolder/effectFolderService";
import {
  copyEffectFolderSelection,
  deleteEffectFolderEntries,
  importEffectFolderFile,
  importEffectFolderModel,
  inspectEffectFolder,
  repackEffectFolderToModFolder,
  validateEffectFolderForRepack,
} from "@/services/effectFolder/effectFolderService";
import {
  effectListItemKey,
  filterEffectListItems,
  toEffectFolderSelections,
  type EffectInventoryCategory,
  type EffectListItem,
} from "./effectFolderEditorUtils";
import {
  DEFAULT_EFFECT_FOLDER_PACK_SELECTION,
  getEffectFolderPackSelection,
  rememberEffectFolderPackSelection,
  sanitizeEffectFolderPackSelection,
  type EffectFolderPackSelectionState,
} from "./effectFolderEditorSettings";

export type EffectFolderEditorLoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      inventory: EffectFolderInventory;
      pack: WorkspacePackIdentity;
    };

type UseEffectFolderEditorParams = {
  workspaceRoot: string;
  pack: WorkspacePackIdentity;
  isActive: boolean;
  modFolderPath: string;
  onPackMutated?: (pack: WorkspacePackIdentity) => void;
  onPackRepacked?: (packKey: string) => void;
};

function inventoryToListItems(inventory: EffectFolderInventory): EffectListItem[] {
  const items: EffectListItem[] = [];
  for (const item of inventory.efxbns) {
    items.push({ category: "efxbn", item });
  }
  for (const model of inventory.models) {
    items.push({ category: "models", model });
  }
  for (const item of inventory.textures) {
    items.push({ category: "textures", item });
  }
  for (const item of inventory.otherFiles) {
    items.push({ category: "other", item });
  }
  return items;
}

function selectionStateFromEditor(
  category: EffectInventoryCategory | "all",
  searchQuery: string,
  selectedKeys: Set<string>,
  focusedKey: string | null,
): EffectFolderPackSelectionState {
  return {
    category,
    searchQuery,
    focusedKey,
    selectedKeys: [...selectedKeys],
  };
}

export function useEffectFolderEditor({
  workspaceRoot,
  pack,
  isActive,
  modFolderPath,
  onPackMutated,
  onPackRepacked,
}: UseEffectFolderEditorParams) {
  const effectRoot = pack.folderPath;
  const structureJsonPath = pack.structureJsonPath;
  const [loadState, setLoadState] = useState<EffectFolderEditorLoadState>({ status: "idle" });
  const [category, setCategoryState] = useState<EffectInventoryCategory | "all">("all");
  const [searchQuery, setSearchQueryState] = useState("");
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  const [focusedKey, setFocusedKeyState] = useState<string | null>(null);
  const [validation, setValidation] = useState<EffectFolderValidationResult | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const lastLoadedKeyRef = useRef("");
  const selectionPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persistSelection = useCallback(
    (next: EffectFolderPackSelectionState) => {
      if (!workspaceRoot.trim()) return;
      if (selectionPersistTimerRef.current) {
        clearTimeout(selectionPersistTimerRef.current);
      }
      selectionPersistTimerRef.current = setTimeout(() => {
        void rememberEffectFolderPackSelection(workspaceRoot, pack.packKey, next);
      }, 250);
    },
    [pack.packKey, workspaceRoot],
  );

  const applyPersistedSelection = useCallback(
    (inventory: EffectFolderInventory, persisted: EffectFolderPackSelectionState) => {
      const validKeys = new Set(
        inventoryToListItems(inventory).map((item) => effectListItemKey(item)),
      );
      const sanitized = sanitizeEffectFolderPackSelection(persisted, validKeys);
      setCategoryState(sanitized.category);
      setSearchQueryState(sanitized.searchQuery);
      setSelectedKeys(new Set(sanitized.selectedKeys));
      setFocusedKeyState(sanitized.focusedKey);
    },
    [],
  );

  const setCategory = useCallback(
    (value: EffectInventoryCategory | "all") => {
      setCategoryState(value);
      persistSelection(
        selectionStateFromEditor(value, searchQuery, selectedKeys, focusedKey),
      );
    },
    [focusedKey, persistSelection, searchQuery, selectedKeys],
  );

  const setSearchQuery = useCallback(
    (value: string) => {
      setSearchQueryState(value);
      persistSelection(selectionStateFromEditor(category, value, selectedKeys, focusedKey));
    },
    [category, focusedKey, persistSelection, selectedKeys],
  );

  const setFocusedKey = useCallback(
    (key: string | null) => {
      setFocusedKeyState(key);
      persistSelection(selectionStateFromEditor(category, searchQuery, selectedKeys, key));
    },
    [category, persistSelection, searchQuery, selectedKeys],
  );

  const reload = useCallback(
    async (options?: { silent?: boolean; preserveSelection?: boolean; restoreSelection?: boolean }) => {
      if (!effectRoot.trim() || !structureJsonPath.trim()) {
        setLoadState({ status: "idle" });
        return;
      }

      const preserveSelection = options?.preserveSelection === true;
      const restoreSelection = options?.restoreSelection === true;
      const selectedSnapshot = preserveSelection ? new Set(selectedKeys) : new Set<string>();
      const focusedSnapshot = preserveSelection ? focusedKey : null;

      if (!options?.silent) {
        setLoadState({ status: "loading" });
      }

      try {
        const inventory = await inspectEffectFolder(effectRoot, structureJsonPath);
        setLoadState({ status: "ready", inventory, pack });
        setValidation(null);

        if (preserveSelection) {
          setSelectedKeys(selectedSnapshot);
          setFocusedKeyState(focusedSnapshot);
        } else if (restoreSelection && workspaceRoot.trim()) {
          const persisted = await getEffectFolderPackSelection(workspaceRoot, pack.packKey);
          if (persisted) {
            applyPersistedSelection(inventory, persisted);
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
      }
    },
    [
      applyPersistedSelection,
      effectRoot,
      focusedKey,
      pack,
      selectedKeys,
      structureJsonPath,
      workspaceRoot,
    ],
  );

  useEffect(() => {
    if (!isActive) return;
    const key = `${effectRoot}::${structureJsonPath}`;
    if (key === lastLoadedKeyRef.current) return;
    lastLoadedKeyRef.current = key;
    void reload({ restoreSelection: true });
  }, [effectRoot, isActive, reload, structureJsonPath]);

  useEffect(() => {
    return () => {
      if (selectionPersistTimerRef.current) {
        clearTimeout(selectionPersistTimerRef.current);
      }
    };
  }, []);

  const allItems = useMemo(() => {
    if (loadState.status !== "ready") return [];
    return inventoryToListItems(loadState.inventory);
  }, [loadState]);

  const filteredItems = useMemo(() => {
    const byCategory =
      category === "all" ? allItems : allItems.filter((item) => item.category === category);
    return filterEffectListItems(byCategory, searchQuery);
  }, [allItems, category, searchQuery]);

  const itemByKey = useMemo(() => {
    const map = new Map<string, EffectListItem>();
    for (const item of allItems) {
      map.set(effectListItemKey(item), item);
    }
    return map;
  }, [allItems]);

  const selectedItems = useMemo(() => {
    const out: EffectListItem[] = [];
    for (const key of selectedKeys) {
      const item = itemByKey.get(key);
      if (item) out.push(item);
    }
    return out;
  }, [itemByKey, selectedKeys]);

  const focusedItem = focusedKey ? (itemByKey.get(focusedKey) ?? null) : null;

  const toggleSelection = useCallback(
    (key: string, multi: boolean) => {
      setSelectedKeys((prev) => {
        const next = multi ? new Set(prev) : new Set<string>();
        if (next.has(key)) {
          next.delete(key);
        } else {
          next.add(key);
        }
        setFocusedKeyState(key);
        persistSelection(selectionStateFromEditor(category, searchQuery, next, key));
        return next;
      });
    },
    [category, persistSelection, searchQuery],
  );

  const selectAllVisible = useCallback(() => {
    const next = new Set(filteredItems.map((item) => effectListItemKey(item)));
    setSelectedKeys(next);
    persistSelection(selectionStateFromEditor(category, searchQuery, next, focusedKey));
  }, [category, filteredItems, focusedKey, persistSelection, searchQuery]);

  const clearSelection = useCallback(() => {
    setSelectedKeys(new Set());
    persistSelection(
      selectionStateFromEditor(category, searchQuery, new Set(), focusedKey),
    );
  }, [category, focusedKey, persistSelection, searchQuery]);

  const markMutated = useCallback(() => {
    if (loadState.status !== "ready") return;
    onPackMutated?.(loadState.pack);
  }, [loadState, onPackMutated]);

  const runValidate = useCallback(async () => {
    setBusyAction("validate");
    try {
      const result = await validateEffectFolderForRepack(effectRoot, structureJsonPath);
      setValidation(result);
      if (result.valid) {
        toast.success("Effect folder validation passed");
      } else {
        toast.error(`Validation failed (${result.errors.length} error(s))`);
      }
      return result;
    } catch (error) {
      toast.error(String(error));
      return null;
    } finally {
      setBusyAction(null);
    }
  }, [effectRoot, structureJsonPath]);

  const runRepack = useCallback(async () => {
    if (!modFolderPath.trim()) {
      toast.error("Configure OB Mod path in Config before repacking");
      return;
    }
    setBusyAction("repack");
    try {
      const validationResult = await validateEffectFolderForRepack(effectRoot, structureJsonPath);
      setValidation(validationResult);
      if (!validationResult.valid) {
        toast.error("Fix validation errors before repacking");
        return;
      }
      const result = await repackEffectFolderToModFolder(modFolderPath, structureJsonPath);
      toast.success(`Repacked to ${result.outputPath}`);
      if (loadState.status === "ready") {
        onPackRepacked?.(loadState.pack.packKey);
      }
    } catch (error) {
      toast.error(String(error));
    } finally {
      setBusyAction(null);
    }
  }, [effectRoot, loadState, modFolderPath, onPackRepacked, structureJsonPath]);

  const runDelete = useCallback(
    async (deleteFiles: boolean) => {
      if (selectedItems.length === 0) return;
      setBusyAction("delete");
      try {
        await deleteEffectFolderEntries({
          effectRoot,
          structureJsonPath,
          selections: toEffectFolderSelections(selectedItems),
          deleteFiles,
        });
        toast.success(`Removed ${selectedItems.length} entr${selectedItems.length === 1 ? "y" : "ies"}`);
        markMutated();
        await reload({ silent: true });
        setSelectedKeys(new Set());
        setFocusedKeyState(null);
        persistSelection({
          ...DEFAULT_EFFECT_FOLDER_PACK_SELECTION,
          category,
          searchQuery,
        });
      } catch (error) {
        toast.error(String(error));
      } finally {
        setBusyAction(null);
      }
    },
    [category, effectRoot, markMutated, persistSelection, reload, searchQuery, selectedItems, structureJsonPath],
  );

  const runImportFile = useCallback(
    async (params: {
      kind: "efxbn" | "texture" | "nutexb";
      hashId: number;
      sourcePath?: string | null;
      targetFilename?: string | null;
    }) => {
      setBusyAction("import");
      try {
        await importEffectFolderFile({
          effectRoot,
          structureJsonPath,
          kind: params.kind,
          hashId: params.hashId,
          sourcePath: params.sourcePath ?? null,
          targetFilename: params.targetFilename ?? null,
        });
        toast.success("Imported file");
        markMutated();
        await reload({ silent: true, preserveSelection: true });
      } catch (error) {
        toast.error(String(error));
      } finally {
        setBusyAction(null);
      }
    },
    [effectRoot, markMutated, reload, structureJsonPath],
  );

  const runImportModel = useCallback(
    async (params: {
      modelHashId: number;
      sourceDir?: string | null;
      targetFolderName?: string | null;
    }) => {
      setBusyAction("import");
      try {
        await importEffectFolderModel({
          effectRoot,
          structureJsonPath,
          modelHashId: params.modelHashId,
          sourceDir: params.sourceDir ?? null,
          targetFolderName: params.targetFolderName ?? null,
        });
        toast.success("Imported model folder");
        markMutated();
        await reload({ silent: true, preserveSelection: true });
      } catch (error) {
        toast.error(String(error));
      } finally {
        setBusyAction(null);
      }
    },
    [effectRoot, markMutated, reload, structureJsonPath],
  );

  const runCopy = useCallback(
    async (destination: { effectRoot: string; structureJsonPath: string }) => {
      if (selectedItems.length === 0) return;
      setBusyAction("copy");
      try {
        const result = await copyEffectFolderSelection({
          sourceEffectRoot: effectRoot,
          sourceStructureJsonPath: structureJsonPath,
          destinationEffectRoot: destination.effectRoot,
          destinationStructureJsonPath: destination.structureJsonPath,
          selections: toEffectFolderSelections(selectedItems),
        });
        const copiedCount = result.copiedFiles.length;
        toast.success(`Copied ${copiedCount} file(s) to destination pack`);
        if (result.skipped.length > 0) {
          toast.message(`${result.skipped.length} item(s) skipped`);
        }
      } catch (error) {
        toast.error(String(error));
      } finally {
        setBusyAction(null);
      }
    },
    [effectRoot, selectedItems, structureJsonPath],
  );

  return {
    loadState,
    category,
    setCategory,
    searchQuery,
    setSearchQuery,
    filteredItems,
    allItems,
    selectedKeys,
    selectedItems,
    focusedItem,
    focusedKey,
    setFocusedKey,
    toggleSelection,
    selectAllVisible,
    clearSelection,
    validation,
    busyAction,
    reload,
    runValidate,
    runRepack,
    runDelete,
    runImportFile,
    runImportModel,
    runCopy,
  };
}
