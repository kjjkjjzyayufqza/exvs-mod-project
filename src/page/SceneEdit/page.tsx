import { useState, useCallback, useRef, useTransition, useEffect, useMemo } from "react";
import { useDefaultLayout } from "react-resizable-panels";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { toast } from "sonner";
import { DialogLastPathKey, getDialogDefaultPath, rememberDialogSelection } from "@/utils/dialogLastPath";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

import { MapToolbar } from "./components/MapToolbar";
import {
  StageHierarchyTree,
  type StageTreeNode,
} from "./components/StageHierarchyTree";
import { SceneOutliner } from "./components/SceneOutliner";
import { GlobalLoadedTexturePanel, ModelTextureSlotPanel } from "./components/ModelTextureSlotPanel";
import { ViewportContextMenu } from "./components/ViewportContextMenu";
import { useSceneKeyboard } from "./hooks/useSceneKeyboard";
import { useSceneEditorStore } from "./store/sceneEditorStore";
import {
  MapViewport,
  type MapViewportHandle,
  type ImportedDaeObject,
  type PlacementGizmoMode,
} from "./components/MapViewport";
import {
  StagePropertyEditor,
  type TransformData,
} from "./components/StagePropertyEditor";
import {
  GraphicParamPanel,
  type GraphicParam,
} from "./components/GraphicParamPanel";
import { type PlacementRow } from "./components/PlacementPanel";
import { PlacementCsvEditorPanel } from "./components/PlacementCsvEditorPanel";
import {
  formatPlacementViewportNodeId,
  parsePlacementViewportNodeId,
} from "./utils/placementNodeId";
import {
  patchPlacementRawFieldsForNumericField,
  patchPlacementRowTransform,
} from "./utils/patchPlacementRawFields";
import {
  deletePlacementAt,
  duplicatePlacementAt,
  pastePlacementsAfter,
} from "./utils/sceneEditorObjectOps";
import {
  StageRenamePreviewDialog,
  type VirtualTreeFolder,
} from "./components/StageRenamePreviewDialog";
import {
  StageImportProgressDialog,
  type ImportStep,
} from "./components/StageImportProgressDialog";
import {
  SceneViewportOverlay,
  type SceneDrawStats,
} from "./components/SceneViewportOverlay";
import { SceneInfoContent, SceneStatsContent } from "./components/SceneStatusPanel";
import { useSceneTextureLoader } from "./hooks/useSceneTextureLoader";
import { TextureQualityPanel, getMaxDimensionForQuality } from "./components/TextureQualityPanel";
import { disposeFhm2dMemorySession } from "@/page/TestEditor/components/ssbh-model-preview/fhm2dMemoryPreviewService";
import {
  clearNutexbPreviewCacheAsync,
  clearNutexbRgbaCache,
} from "@/page/TestEditor/components/ssbh-model-preview/nutexbPreviewCache";
import { clearSceneEditColladaModelCache } from "./components/DAEModel";
import { reorderPlacementEntriesBySubModels } from "./utils/reorderPlacementBySubModels";
import { MayaSection } from "./components/MayaSection";
import { PlacementConfigPanel } from "./components/PlacementConfigPanel";
import {
  createDefaultTextureSlotLoadEnabled,
  createUniformTextureSlotLoadEnabled,
  type TexturePreviewSlotKey,
} from "@/page/TestEditor/components/ssbh-model-preview/meshFromSsbh";
import {
  exportMultipleObjectsAsDAE,
  exportObjectAsDAE,
  importDAEFiles,
} from "./utils/daeExportImport";
import { canEditSceneNode } from "./utils/sceneEditorNodeState";
import {
  addGraphicParam,
  addPlacementRow,
  applyGraphicParamSelection,
  deleteGraphicParamAt,
  deletePlacementRowAt,
  replacePlacementRow,
  updateGraphicParamKey,
  updateGraphicParamValue,
} from "./utils/sceneCsvEditors";
import {
  collectBundleTextureInventory,
  setTexturePathEnabledForObject,
  type ObjectTextureInventory,
  type ObjectTextureLoadState,
} from "./utils/sceneTextureInventory";

import type { PreviewRenderStyle } from "@/page/TestEditor/components/ssbh-model-preview/SsbhModelPreviewContext";

import type { SsbhModelPreviewBundle } from "@/page/TestEditor/components/ssbh-model-preview/types";

interface StageBundleResponse {
  rootPath: string;
  baseModel: SsbhModelPreviewBundle | null;
  subModels: Array<{
    folderName: string;
    objectIndex: number;
    bundle: SsbhModelPreviewBundle;
  }>;
  graphicParams: Array<{ key: string; value: string }>;
  placementHeader: string[];
  placementEntries: Array<{
    vdkType: string;
    objectNumber: number | null;
    posX: number;
    posY: number;
    posZ: number;
    rotX: number;
    rotY: number;
    rotZ: number;
    scaleX: number;
    scaleY: number;
    scaleZ: number;
    rawFields: string[];
  }>;
  warnings: string[];
}

const SCENE_EDIT_PANEL_IDS = [
  "scene-hierarchy",
  "scene-viewport",
  "scene-properties",
] as const;

const SCENE_EDIT_DEFAULT_LAYOUT: Record<(typeof SCENE_EDIT_PANEL_IDS)[number], number> =
  {
    "scene-hierarchy": 20,
    "scene-viewport": 60,
    "scene-properties": 20,
  };

function nearlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= 1e-6;
}

function transformEquals(a: TransformData, b: TransformData): boolean {
  return (
    nearlyEqual(a.posX, b.posX) &&
    nearlyEqual(a.posY, b.posY) &&
    nearlyEqual(a.posZ, b.posZ) &&
    nearlyEqual(a.rotX, b.rotX) &&
    nearlyEqual(a.rotY, b.rotY) &&
    nearlyEqual(a.rotZ, b.rotZ) &&
    nearlyEqual(a.scaleX, b.scaleX) &&
    nearlyEqual(a.scaleY, b.scaleY) &&
    nearlyEqual(a.scaleZ, b.scaleZ)
  );
}

function placementToTransform(row: PlacementRow): TransformData {
  return {
    posX: row.posX,
    posY: row.posY,
    posZ: row.posZ,
    rotX: row.rotX,
    rotY: row.rotY,
    rotZ: row.rotZ,
    scaleX: row.scaleX,
    scaleY: row.scaleY,
    scaleZ: row.scaleZ,
  };
}

export default function SceneEdit() {
  const viewportRef = useRef<MapViewportHandle>(null);
  const [, startTransition] = useTransition();

  const { defaultLayout: persistedLayout, onLayoutChanged } = useDefaultLayout({
    id: "scene-edit-layout",
    panelIds: [...SCENE_EDIT_PANEL_IDS],
    storage: globalThis.localStorage,
  });

  const sceneEditLayout = useMemo(
    () => persistedLayout ?? SCENE_EDIT_DEFAULT_LAYOUT,
    [persistedLayout],
  );

  const [stageName, setStageName] = useState<string | null>(null);
  const [stageRoot, setStageRoot] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const [baseModel, setBaseModel] = useState<SsbhModelPreviewBundle | null>(
    null
  );
  const [subModels, setSubModels] = useState<
    StageBundleResponse["subModels"]
  >([]);
  const [graphicParams, setGraphicParams] = useState<GraphicParam[]>([]);
  const [appliedGraphicParamKeys, setAppliedGraphicParamKeys] = useState<Set<string>>(() => new Set());
  const [placementHeader, setPlacementHeader] = useState<string[]>([]);
  const [placementColMap, setPlacementColMap] = useState<
    Record<string, number>
  >({});
  const [placementEntries, setPlacementEntries] = useState<PlacementRow[]>([]);
  const [placementDraftEntries, setPlacementDraftEntries] = useState<PlacementRow[]>([]);
  const [importedDaeObjects, setImportedDaeObjects] = useState<ImportedDaeObject[]>([]);
  const [treeRoot, setTreeRoot] = useState<StageTreeNode | null>(null);

  const [isMemoryImport, setIsMemoryImport] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [renamePreview, setRenamePreview] = useState<{
    tree: VirtualTreeFolder;
    warnings: string[];
    sourceName: string;
    totalFiles: number;
    totalSizeBytes: number;
  } | null>(null);

  const [importProgress, setImportProgress] = useState<{
    open: boolean;
    progress: number;
    steps: ImportStep[];
  }>({ open: false, progress: 0, steps: [] });

  const INITIAL_STEPS: ImportStep[] = [
    { step: "read", label: "Reading file...", status: "pending" },
    { step: "extract", label: "Decompressing FHM2D...", status: "pending" },
    { step: "tree", label: "Parsing folder structure...", status: "pending" },
  ];

  const handleProgressEvent = useCallback(
    (payload: { step: string; label: string; progress: number; elapsedMs: number | null }) => {
      setImportProgress((prev) => {
        if (payload.step === "done") {
          return {
            open: false,
            progress: 100,
            steps: prev.steps.map((s) => ({ ...s, status: "done" as const })),
          };
        }

        const newSteps = prev.steps.map((s): ImportStep => {
          if (s.step === payload.step) {
            return { ...s, label: payload.label, status: "active" };
          }
          if (s.status === "active") {
            return { ...s, status: "done", elapsedMs: payload.elapsedMs ?? undefined };
          }
          return s;
        });

        return {
          open: true,
          progress: payload.progress,
          steps: newSteps,
        };
      });
    },
    []
  );

  const unlistenRef = useRef<UnlistenFn | null>(null);

  useEffect(() => {
    let cancelled = false;
    listen<{ step: string; label: string; progress: number; elapsedMs: number | null }>(
      "stage-import-progress",
      (event) => {
        if (!cancelled) {
          handleProgressEvent(event.payload);
        }
      }
    ).then((unlisten) => {
      if (cancelled) {
        unlisten();
      } else {
        unlistenRef.current = unlisten;
      }
    });

    return () => {
      cancelled = true;
      unlistenRef.current?.();
      unlistenRef.current = null;
    };
  }, [handleProgressEvent]);

  const [selectedNodeId, setSelectedNodeIdRaw] = useState<string | null>(null);
  const [selectedPlacementIdx, setSelectedPlacementIdxRaw] = useState<
    number | null
  >(null);

  const DEFAULT_TRANSFORM: TransformData = { posX: 0, posY: 0, posZ: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 };
  const [baseTransform, setBaseTransform] = useState<TransformData>({ ...DEFAULT_TRANSFORM });
  const [standaloneTransforms, setStandaloneTransforms] = useState<Map<string, TransformData>>(new Map());

  const [showGrid, setShowGrid] = useState(true);
  const [showAxes, setShowAxes] = useState(true);
  const [wireframe, setWireframe] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [textureQuality, setTextureQuality] = useState("original");
  const [textureSlotLoadEnabled, setTextureSlotLoadEnabled] = useState<
    Record<TexturePreviewSlotKey, boolean>
  >(() => createDefaultTextureSlotLoadEnabled());
  const [objectTextureLoadState, setObjectTextureLoadState] = useState<ObjectTextureLoadState>({});
  const [sceneAnimeRenderEnabled, setSceneAnimeRenderEnabled] = useState(false);
  const [placementGizmoMode, setPlacementGizmoMode] = useState<PlacementGizmoMode>("translate");
  const [drawStats, setDrawStats] = useState<SceneDrawStats | null>(null);
  const [clearCacheDialogOpen, setClearCacheDialogOpen] = useState(false);
  const editorSelectedIds = useSceneEditorStore((state) => state.selectedIds);
  const nodeVisibility = useSceneEditorStore((state) => state.nodeVisibility);
  const objectLocks = useSceneEditorStore((state) => state.objectLocks);

  const textureMaxDimension = getMaxDimensionForQuality(textureQuality);
  const scenePreviewRenderStyle: PreviewRenderStyle = sceneAnimeRenderEnabled
    ? "anime"
    : "standard";
  const appliedGraphicParams = useMemo(
    () => applyGraphicParamSelection(graphicParams, appliedGraphicParamKeys),
    [graphicParams, appliedGraphicParamKeys],
  );
  const {
    textureDataMap,
    progress: textureProgress,
    warnings: textureWarnings,
  } = useSceneTextureLoader(
    baseModel,
    subModels,
    placementEntries,
    sessionId,
    textureMaxDimension,
    textureSlotLoadEnabled,
    objectTextureLoadState,
  );

  useEffect(() => {
    if (textureWarnings.length > 0) {
      toast.warning(
        `${textureWarnings.length} texture(s) failed to decode`,
        { description: textureWarnings.slice(0, 3).join("\n") },
      );
    }
  }, [textureWarnings]);

  useEffect(() => {
    return () => {
      if (sessionId) {
        disposeFhm2dMemorySession(sessionId).catch(() => {});
      }
    };
  }, [sessionId]);

  // Maya-style W/E/R keyboard shortcuts for gizmo mode
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      switch (e.key.toLowerCase()) {
        case "w":
          setPlacementGizmoMode("translate");
          break;
        case "e":
          setPlacementGizmoMode("rotate");
          break;
        case "r":
          setPlacementGizmoMode("scale");
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleSelectNode = useCallback(
    (id: string | null) => {
      if (!id) {
        setSelectedNodeIdRaw(null);
        setSelectedPlacementIdxRaw(null);
        return;
      }

      const effectMatch = id.match(/^__effect__(\d+)$/);
      if (effectMatch) {
        const idx = Number(effectMatch[1]);
        setSelectedNodeIdRaw(id);
        setSelectedPlacementIdxRaw(idx);
        return;
      }

      const parsed = parsePlacementViewportNodeId(id);
      if (parsed) {
        setSelectedNodeIdRaw(id);
        setSelectedPlacementIdxRaw(parsed.placementEntryIndex);
        return;
      }

      setSelectedNodeIdRaw(id);
      const sub = subModels.find((s) => s.folderName === id);
      if (sub) {
        const idx = placementEntries.findIndex(
          (e) =>
            e.vdkType.toUpperCase() === "OBJECT" &&
            e.objectNumber === sub.objectIndex
        );
        setSelectedPlacementIdxRaw(idx >= 0 ? idx : null);
      } else {
        setSelectedPlacementIdxRaw(null);
      }
    },
    [subModels, placementEntries]
  );

  const handleSelectPlacement = useCallback(
    (idx: number) => {
      setSelectedPlacementIdxRaw(idx);
      const entry = placementEntries[idx];
      if (
        entry?.vdkType.toUpperCase() === "OBJECT" &&
        entry.objectNumber !== null
      ) {
        const sub = subModels.find((s) => s.objectIndex === entry.objectNumber);
        if (sub) {
          setSelectedNodeIdRaw(
            formatPlacementViewportNodeId(sub.folderName, idx)
          );
        }
      }
    },
    [subModels, placementEntries]
  );

  const placementIndexForNodeId = useCallback(
    (id: string): number | null => {
      const parsed = parsePlacementViewportNodeId(id);
      if (parsed) return parsed.placementEntryIndex;
      const effectMatch = id.match(/^__effect__(\d+)$/);
      if (effectMatch) return Number(effectMatch[1]);
      const sub = subModels.find((s) => s.folderName === id);
      if (!sub) return null;
      const idx = placementEntries.findIndex(
        (entry) =>
          entry.vdkType.toUpperCase() === "OBJECT" &&
          entry.objectNumber === sub.objectIndex,
      );
      return idx >= 0 ? idx : null;
    },
    [placementEntries, subModels],
  );

  const nodeIdForPlacementIndex = useCallback(
    (idx: number): string | null => {
      const entry = placementEntries[idx];
      if (!entry) return null;
      if (entry.vdkType.toUpperCase() !== "OBJECT") return `__effect__${idx}`;
      if (entry.objectNumber === null) return null;
      const sub = subModels.find((s) => s.objectIndex === entry.objectNumber);
      return sub ? formatPlacementViewportNodeId(sub.folderName, idx) : null;
    },
    [placementEntries, subModels],
  );

  const canEditNode = useCallback(
    (nodeId: string | null) => {
      if (!nodeId) return true;
      return canEditSceneNode(nodeId, nodeVisibility, objectLocks);
    },
    [nodeVisibility, objectLocks],
  );

  const hasLockedOrHiddenNode = useCallback(
    (ids: string[]) => ids.some((id) => !canEditNode(id)),
    [canEditNode],
  );

  const handleDuplicateSelected = useCallback(
    (ids?: string[]) => {
      const requestedIds = ids && ids.length > 0
        ? ids
        : selectedNodeId
          ? [selectedNodeId]
          : selectedPlacementIdx !== null
            ? [nodeIdForPlacementIndex(selectedPlacementIdx)].filter((id): id is string => Boolean(id))
            : [];

      if (hasLockedOrHiddenNode(requestedIds)) {
        toast.error("Locked or hidden scene objects cannot be duplicated");
        return;
      }

      const daeIds = requestedIds.filter((id) => importedDaeObjects.some((obj) => obj.id === id));
      if (daeIds.length > 0) {
        const originals = importedDaeObjects.filter((obj) => daeIds.includes(obj.id));
        const created = originals.map((obj, index) => ({
          ...obj,
          id: `dae_${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${index}`,
          name: `${obj.name} Copy`,
          transform: {
            ...obj.transform,
            posX: obj.transform.posX + 1,
          },
        }));
        setImportedDaeObjects((prev) => [...prev, ...created]);
        useSceneEditorStore.getState().recordCommand({
          type: "duplicate-dae",
          description: "Duplicate imported DAE actor",
          undo: () => {
            setImportedDaeObjects((prev) => prev.filter((obj) => !created.some((c) => c.id === obj.id)));
          },
          redo: () => {
            setImportedDaeObjects((prev) => [...prev, ...created]);
          },
        });
        setSelectedNodeIdRaw(created[0]?.id ?? selectedNodeId);
        toast.success(`Duplicated ${created.length} DAE object(s)`);
        return;
      }

      const firstPlacementIdx =
        requestedIds.map(placementIndexForNodeId).find((idx): idx is number => idx !== null) ??
        selectedPlacementIdx;
      if (firstPlacementIdx === null) return;

      try {
        const result = duplicatePlacementAt(placementEntries, firstPlacementIdx);
        setPlacementEntries(result.entries);
        setSelectedPlacementIdxRaw(result.insertedIndex);
        setHasUnsavedChanges(true);
        const inserted = result.insertedRow;
        const sub = inserted.objectNumber !== null
          ? subModels.find((s) => s.objectIndex === inserted.objectNumber)
          : null;
        if (sub) {
          setSelectedNodeIdRaw(formatPlacementViewportNodeId(sub.folderName, result.insertedIndex));
        }
        useSceneEditorStore.getState().recordCommand({
          type: "duplicate-placement",
          description: "Duplicate placement row",
          undo: () => {
            setPlacementEntries((prev) => prev.filter((_, i) => i !== result.insertedIndex));
            setSelectedPlacementIdxRaw(firstPlacementIdx);
            setHasUnsavedChanges(true);
          },
          redo: () => {
            setPlacementEntries((prev) => {
              const next = [...prev];
              next.splice(result.insertedIndex, 0, result.insertedRow);
              return next;
            });
            setSelectedPlacementIdxRaw(result.insertedIndex);
            setHasUnsavedChanges(true);
          },
        });
        toast.success("Placement row duplicated");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to duplicate selection");
      }
    },
    [
      hasLockedOrHiddenNode,
      importedDaeObjects,
      nodeIdForPlacementIndex,
      placementEntries,
      placementIndexForNodeId,
      selectedNodeId,
      selectedPlacementIdx,
      subModels,
    ],
  );

  const applyBundle = useCallback(
    (path: string, bundle: StageBundleResponse) => {
      startTransition(() => {
        const folderName =
          path.split(/[/\\]/).filter(Boolean).pop() ?? "stage";
        setStageName(folderName);
        setStageRoot(path);
        setBaseModel(bundle.baseModel);
        setSubModels(bundle.subModels);
        setGraphicParams(
          bundle.graphicParams.map((p) => ({ key: p.key, value: p.value }))
        );
        setAppliedGraphicParamKeys(new Set());
        setPlacementHeader(bundle.placementHeader);
        const colMap: Record<string, number> = {};
        bundle.placementHeader.forEach((h, i) => {
          colMap[h.toUpperCase()] = i;
        });
        setPlacementColMap(colMap);
        const mappedPlacements = bundle.placementEntries.map((e) => ({
          vdkType: e.vdkType,
          objectNumber: e.objectNumber,
          posX: e.posX,
          posY: e.posY,
          posZ: e.posZ,
          rotX: e.rotX,
          rotY: e.rotY,
          rotZ: e.rotZ,
          scaleX: e.scaleX,
          scaleY: e.scaleY,
          scaleZ: e.scaleZ,
          rawFields: e.rawFields,
        }));
        const orderedPlacements = reorderPlacementEntriesBySubModels(mappedPlacements, bundle.subModels);
        setPlacementEntries(orderedPlacements);
        setPlacementDraftEntries(orderedPlacements.map((entry) => ({ ...entry, rawFields: [...entry.rawFields] })));
        setObjectTextureLoadState({});
        const tree = buildTreeFromBundle(folderName, bundle);
        setTreeRoot(tree);
      });

      if (bundle.warnings.length > 0) {
        toast.warning(
          `Stage loaded with ${bundle.warnings.length} warning(s)`,
          { description: bundle.warnings.slice(0, 3).join("\n") }
        );
      } else {
        toast.success("Stage loaded successfully");
      }
    },
    []
  );

  const resetState = useCallback(() => {
    if (sessionId) {
      disposeFhm2dMemorySession(sessionId).catch(() => {});
    }
    setStageName(null);
    setStageRoot(null);
    setIsMemoryImport(false);
    setSessionId(null);
    setBaseModel(null);
    setSubModels([]);
    setGraphicParams([]);
    setAppliedGraphicParamKeys(new Set());
    setPlacementHeader([]);
    setPlacementColMap({});
    setPlacementEntries([]);
    setPlacementDraftEntries([]);
    setImportedDaeObjects([]);
    setTreeRoot(null);
    setDrawStats(null);
    setBaseTransform({ ...DEFAULT_TRANSFORM });
    setStandaloneTransforms(new Map());
    setSelectedNodeIdRaw(null);
    setSelectedPlacementIdxRaw(null);
    setHasUnsavedChanges(false);
    setRenamePreview(null);
    setImportProgress((prev) => ({ ...prev, open: false }));
  }, [sessionId]);

  const handleConfirmClearCache = useCallback(async () => {
    setClearCacheDialogOpen(false);
    resetState();
    clearNutexbRgbaCache();
    clearSceneEditColladaModelCache();
    try {
      await clearNutexbPreviewCacheAsync();
    } catch (err) {
      console.warn("[SceneEdit] Failed to clear nutexb preview cache:", err);
    }
    viewportRef.current?.resetCamera();
    toast.success("Scene memory and caches cleared");
  }, [resetState]);

  const handleOpenFolder = useCallback(async () => {
    try {
      const selected = await open({
        directory: true,
        defaultPath: getDialogDefaultPath(DialogLastPathKey.sceneEditOpenFolder),
      });
      if (!selected || typeof selected !== "string") return;
      rememberDialogSelection(DialogLastPathKey.sceneEditOpenFolder, selected, "directory");

      setIsLoading(true);
      resetState();

      const bundle = await invoke<StageBundleResponse>("load_stage_bundle", {
        stageRoot: selected,
      });
      applyBundle(selected, bundle);
    } catch (err: any) {
      toast.error("Failed to load stage", { description: String(err) });
    } finally {
      setIsLoading(false);
    }
  }, [applyBundle, resetState]);

  const handleImportFhm2d = useCallback(async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: "FHM2D Stage Files", extensions: ["fhm2d"] }],
        defaultPath: getDialogDefaultPath(DialogLastPathKey.sceneEditImportFhm2d),
      });
      if (!selected || typeof selected !== "string") return;
      rememberDialogSelection(DialogLastPathKey.sceneEditImportFhm2d, selected, "file");

      setIsLoading(true);
      setImportProgress({
        open: true,
        progress: 0,
        steps: INITIAL_STEPS.map((s) => ({ ...s })),
      });

      const result = await invoke<{
        tree: VirtualTreeFolder;
        warnings: string[];
        sourceName: string;
        totalFiles: number;
        totalSizeBytes: number;
      }>("preview_stage_fhm2d_rename", { sourcePath: selected });

      setImportProgress((prev) => ({ ...prev, open: false }));

      setRenamePreview({
        tree: result.tree,
        warnings: result.warnings,
        sourceName: result.sourceName,
        totalFiles: result.totalFiles,
        totalSizeBytes: result.totalSizeBytes,
      });
    } catch (err: any) {
      setImportProgress((prev) => ({ ...prev, open: false }));
      toast.error("FHM2D rename preview failed", { description: String(err) });
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleExtractFhm2d = useCallback(async () => {
    try {
      const sourcePath = await open({
        multiple: false,
        filters: [{ name: "FHM2D Stage Files", extensions: ["fhm2d"] }],
        defaultPath: getDialogDefaultPath(DialogLastPathKey.sceneEditExtractFhm2dSource),
      });
      if (!sourcePath || typeof sourcePath !== "string") return;
      rememberDialogSelection(DialogLastPathKey.sceneEditExtractFhm2dSource, sourcePath, "file");

      const outputDir = await open({
        directory: true,
        title: "Select output folder",
        defaultPath: getDialogDefaultPath(DialogLastPathKey.sceneEditExtractFhm2dOutput),
      });
      if (!outputDir || typeof outputDir !== "string") return;
      rememberDialogSelection(DialogLastPathKey.sceneEditExtractFhm2dOutput, outputDir, "directory");

      setIsLoading(true);
      const result = await invoke<{
        outputDir: string;
        totalFiles: number;
        totalBytes: number;
        warnings: string[];
      }>("extract_stage_fhm2d_to_folder", {
        sourcePath,
        outputDir,
      });

      if (result.warnings.length > 0) {
        toast.warning(
          `Extracted with ${result.warnings.length} warning(s)`,
          { description: result.warnings.slice(0, 3).join("\n") },
        );
      } else {
        const sizeMb = (result.totalBytes / (1024 * 1024)).toFixed(1);
        toast.success(`Extracted ${result.totalFiles} files (${sizeMb} MB)`, {
          description: result.outputDir,
        });
      }
    } catch (err: any) {
      toast.error("FHM2D extraction failed", { description: String(err) });
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleRenameCancel = useCallback(() => {
    setRenamePreview(null);
  }, []);

  const [isLoadingBundle, setIsLoadingBundle] = useState(false);

  const handleRenameLoad = useCallback(async () => {
    try {
      setIsLoadingBundle(true);
      const result = await invoke<{
        bundle: StageBundleResponse;
        tree: VirtualTreeFolder;
        warnings: string[];
        sessionId: string | null;
      }>("load_stage_from_preview");

      setRenamePreview(null);
      setIsMemoryImport(true);
      if (result.sessionId) {
        setSessionId(result.sessionId);
      }
      applyBundle("memory://stage", result.bundle);
    } catch (err: any) {
      toast.error("Failed to load stage into scene", { description: String(err) });
    } finally {
      setIsLoadingBundle(false);
    }
  }, [applyBundle]);

  const handleSave = useCallback(async () => {
    if (!stageRoot) return;
    try {
      const gpCsv = graphicParams.map((p) => `${p.key},${p.value}`).join("\n");
      await writeTextFile(`${stageRoot}/info/graphic_param.csv`, gpCsv);

      if (placementHeader.length > 0 && placementDraftEntries.length > 0) {
        const headerLine = placementHeader.join(",");
        const dataLines = placementDraftEntries.map((e) => e.rawFields.join(","));
        const placementCsv = [headerLine, ...dataLines].join("\n");
        await writeTextFile(`${stageRoot}/info/placement.csv`, placementCsv);
      } else if (placementDraftEntries.length > 0) {
        const placementCsv = placementDraftEntries.map((e) => e.rawFields.join(",")).join("\n");
        await writeTextFile(`${stageRoot}/info/placement.csv`, placementCsv);
      }

      setHasUnsavedChanges(false);
      toast.success("CSV files saved");
    } catch (err: any) {
      toast.error("Save failed", { description: String(err) });
    }
  }, [stageRoot, graphicParams, placementHeader, placementDraftEntries]);

  const handleGraphicParamValueChange = useCallback(
    (index: number, value: string) => {
      setGraphicParams((prev) => updateGraphicParamValue(prev, index, value));
      setHasUnsavedChanges(true);
    },
    []
  );
  const handleGraphicParamKeyChange = useCallback((index: number, key: string) => {
    try {
      setGraphicParams((prev) => updateGraphicParamKey(prev, index, key));
      setHasUnsavedChanges(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Invalid graphic_param key");
    }
  }, []);
  const handleAddGraphicParam = useCallback(() => {
    try {
      setGraphicParams((prev) => addGraphicParam(prev, "new_param", "0"));
      setHasUnsavedChanges(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add graphic_param row");
    }
  }, []);
  const handleDeleteGraphicParam = useCallback((index: number) => {
    setGraphicParams((prev) => deleteGraphicParamAt(prev, index));
    setHasUnsavedChanges(true);
  }, []);
  const handleToggleGraphicParamApplied = useCallback((key: string, applied: boolean) => {
    setAppliedGraphicParamKeys((prev) => {
      const next = new Set(prev);
      if (applied) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  const handlePlacementChange = useCallback(
    (
      index: number,
      field: keyof Pick<
        PlacementRow,
        | "posX"
        | "posY"
        | "posZ"
        | "rotX"
        | "rotY"
        | "rotZ"
        | "scaleX"
        | "scaleY"
        | "scaleZ"
      >,
      value: number
    ) => {
      const previous = placementEntries[index];
      if (!previous) return;
      const nextEntry = patchPlacementRawFieldsForNumericField(
        previous,
        field,
        value,
        placementColMap,
      );
      setPlacementEntries((prev) => {
        const next = [...prev];
        next[index] = nextEntry;
        return next;
      });
      setPlacementDraftEntries((prev) => {
        if (!prev[index]) return prev;
        const next = [...prev];
        next[index] = nextEntry;
        return next;
      });
      setHasUnsavedChanges(true);
      useSceneEditorStore.getState().recordCommand({
        type: "edit-placement-field",
        description: "Edit placement transform",
        undo: () => {
          setPlacementEntries((prev) => {
            const next = [...prev];
            next[index] = previous;
            return next;
          });
          setHasUnsavedChanges(true);
        },
        redo: () => {
          setPlacementEntries((prev) => {
            const next = [...prev];
            next[index] = nextEntry;
            return next;
          });
          setHasUnsavedChanges(true);
        },
      });
    },
    [placementColMap, placementEntries]
  );

  const commitPlacementGizmo = useCallback(
    (idx: number, t: TransformData) => {
      if (!canEditNode(nodeIdForPlacementIndex(idx))) return;
      const previous = placementEntries[idx];
      if (!previous) return;
      if (transformEquals(placementToTransform(previous), t)) return;
      const nextEntry = patchPlacementRowTransform(previous, t, placementColMap);
      setPlacementEntries((prev) => {
        const entry = prev[idx];
        if (!entry) return prev;
        const next = [...prev];
        next[idx] = patchPlacementRowTransform(entry, t, placementColMap);
        return next;
      });
      setPlacementDraftEntries((prev) => {
        const entry = prev[idx];
        if (!entry) return prev;
        const next = [...prev];
        next[idx] = patchPlacementRowTransform(entry, t, placementColMap);
        return next;
      });
      setHasUnsavedChanges(true);
      useSceneEditorStore.getState().recordCommand({
        type: "gizmo-placement-transform",
        description: "Move placement gizmo",
        undo: () => {
          setPlacementEntries((prev) => {
            const next = [...prev];
            next[idx] = previous;
            return next;
          });
          setHasUnsavedChanges(true);
        },
        redo: () => {
          setPlacementEntries((prev) => {
            const next = [...prev];
            next[idx] = nextEntry;
            return next;
          });
          setHasUnsavedChanges(true);
        },
      });
    },
    [canEditNode, nodeIdForPlacementIndex, placementColMap, placementEntries],
  );

  const updateImportedDaeTransform = useCallback(
    (nodeId: string, t: TransformData) => {
      setImportedDaeObjects((prev) =>
        prev.map((obj) =>
          obj.id === nodeId
            ? { ...obj, transform: t }
            : obj,
        ),
      );
    },
    [],
  );

  const commitBaseGizmoTransform = useCallback(
    (t: TransformData) => {
      if (!canEditNode("base")) return;
      const previous = baseTransform;
      if (transformEquals(previous, t)) return;
      setBaseTransform(t);
      useSceneEditorStore.getState().recordCommand({
        type: "gizmo-base-transform",
        description: "Move base model gizmo",
        undo: () => setBaseTransform(previous),
        redo: () => setBaseTransform(t),
      });
    },
    [baseTransform, canEditNode],
  );

  const commitStandaloneGizmoTransform = useCallback(
    (nodeId: string, t: TransformData) => {
      if (!canEditNode(nodeId)) return;
      const previous = standaloneTransforms.get(nodeId) ?? { ...DEFAULT_TRANSFORM };
      if (transformEquals(previous, t)) return;
      setStandaloneTransforms((prev) => {
        const next = new Map(prev);
        next.set(nodeId, t);
        return next;
      });
      useSceneEditorStore.getState().recordCommand({
        type: "gizmo-standalone-transform",
        description: "Move standalone model gizmo",
        undo: () => {
          setStandaloneTransforms((prev) => {
            const next = new Map(prev);
            next.set(nodeId, previous);
            return next;
          });
        },
        redo: () => {
          setStandaloneTransforms((prev) => {
            const next = new Map(prev);
            next.set(nodeId, t);
            return next;
          });
        },
      });
    },
    [canEditNode, standaloneTransforms],
  );

  const commitImportedDaeGizmoTransform = useCallback(
    (nodeId: string, t: TransformData) => {
      if (!canEditNode(nodeId)) return;
      const previous = importedDaeObjects.find((obj) => obj.id === nodeId)?.transform;
      if (!previous || transformEquals(previous, t)) return;
      updateImportedDaeTransform(nodeId, t);
      useSceneEditorStore.getState().recordCommand({
        type: "gizmo-dae-transform",
        description: "Move imported DAE gizmo",
        undo: () => updateImportedDaeTransform(nodeId, previous),
        redo: () => updateImportedDaeTransform(nodeId, t),
      });
    },
    [canEditNode, importedDaeObjects, updateImportedDaeTransform],
  );

  const handleTransformChange = useCallback(
    (field: keyof TransformData, value: number) => {
      const editableNodeId =
        selectedNodeId ??
        (selectedPlacementIdx !== null ? nodeIdForPlacementIndex(selectedPlacementIdx) : null);
      if (!canEditNode(editableNodeId)) {
        toast.error("Locked or hidden scene objects cannot be edited");
        return;
      }
      if (selectedNodeId === "base") {
        const previous = baseTransform;
        const next = { ...previous, [field]: value };
        setBaseTransform(next);
        useSceneEditorStore.getState().recordCommand({
          type: "edit-base-transform",
          description: "Edit base transform",
          undo: () => setBaseTransform(previous),
          redo: () => setBaseTransform(next),
        });
        return;
      }
      if (
        selectedNodeId &&
        selectedPlacementIdx === null &&
        subModels.some((s) => s.folderName === selectedNodeId)
      ) {
        const previous = standaloneTransforms.get(selectedNodeId) ?? { ...DEFAULT_TRANSFORM };
        const nextTransform = { ...previous, [field]: value };
        setStandaloneTransforms((prev) => {
          const next = new Map(prev);
          next.set(selectedNodeId, nextTransform);
          return next;
        });
        useSceneEditorStore.getState().recordCommand({
          type: "edit-standalone-transform",
          description: "Edit standalone model transform",
          undo: () => {
            setStandaloneTransforms((prev) => {
              const nextMap = new Map(prev);
              nextMap.set(selectedNodeId, previous);
              return nextMap;
            });
          },
          redo: () => {
            setStandaloneTransforms((prev) => {
              const nextMap = new Map(prev);
              nextMap.set(selectedNodeId, nextTransform);
              return nextMap;
            });
          },
        });
        return;
      }
      if (selectedNodeId && importedDaeObjects.some((obj) => obj.id === selectedNodeId)) {
        const previous = importedDaeObjects.find((obj) => obj.id === selectedNodeId)?.transform;
        if (!previous) return;
        const nextTransform = { ...previous, [field]: value };
        setImportedDaeObjects((prev) =>
          prev.map((obj) =>
            obj.id === selectedNodeId
              ? { ...obj, transform: nextTransform }
              : obj,
          ),
        );
        useSceneEditorStore.getState().recordCommand({
          type: "edit-dae-transform",
          description: "Edit DAE transform",
          undo: () => updateImportedDaeTransform(selectedNodeId, previous),
          redo: () => updateImportedDaeTransform(selectedNodeId, nextTransform),
        });
        return;
      }
      if (selectedPlacementIdx === null) return;
      const fieldMap: Record<keyof TransformData, keyof PlacementRow> = {
        posX: "posX",
        posY: "posY",
        posZ: "posZ",
        rotX: "rotX",
        rotY: "rotY",
        rotZ: "rotZ",
        scaleX: "scaleX",
        scaleY: "scaleY",
        scaleZ: "scaleZ",
      };
      handlePlacementChange(
        selectedPlacementIdx,
        fieldMap[field] as any,
        value
      );
    },
    [
      selectedNodeId,
      selectedPlacementIdx,
      baseTransform,
      canEditNode,
      standaloneTransforms,
      handlePlacementChange,
      importedDaeObjects,
      nodeIdForPlacementIndex,
      subModels,
      updateImportedDaeTransform,
    ]
  );

  const handleDrawStatsChange = useCallback((stats: SceneDrawStats) => {
    setDrawStats(stats);
  }, []);

  const handleTextureQualityChange = useCallback((quality: string) => {
    setTextureQuality(quality);
    clearNutexbRgbaCache();
  }, []);

  const handleTextureSlotMode = useCallback((mode: "all" | "none") => {
    clearNutexbRgbaCache();
    setTextureSlotLoadEnabled(
      mode === "all"
        ? createDefaultTextureSlotLoadEnabled()
        : createUniformTextureSlotLoadEnabled(false),
    );
  }, []);

  const handleTextureSlotToggle = useCallback(
    (key: TexturePreviewSlotKey, enabled: boolean) => {
      clearNutexbRgbaCache();
      setTextureSlotLoadEnabled((prev) => ({ ...prev, [key]: enabled }));
    },
    [],
  );

  const handleObjectTexturePathToggle = useCallback((objectId: string, path: string, enabled: boolean) => {
    setObjectTextureLoadState((prev) => setTexturePathEnabledForObject(prev, objectId, path, enabled));
  }, []);

  const handlePlacementDraftRowChange = useCallback((index: number, row: PlacementRow) => {
    setPlacementDraftEntries((prev) => replacePlacementRow(prev, index, row));
    setHasUnsavedChanges(true);
  }, []);

  const handleAddPlacementDraftRow = useCallback(() => {
    setPlacementDraftEntries((prev) => addPlacementRow(prev, selectedPlacementIdx !== null ? prev[selectedPlacementIdx] : undefined));
    setHasUnsavedChanges(true);
  }, [selectedPlacementIdx]);

  const handleDeletePlacementDraftRow = useCallback((index: number) => {
    setPlacementDraftEntries((prev) => deletePlacementRowAt(prev, index));
    setHasUnsavedChanges(true);
  }, []);

  const handleApplyPlacementDraftRow = useCallback((index: number) => {
    const row = placementDraftEntries[index];
    if (!row) return;
    setPlacementEntries((prev) => {
      if (index >= prev.length) {
        return addPlacementRow(prev, row);
      }
      return replacePlacementRow(prev, index, row);
    });
  }, [placementDraftEntries]);

  const handleApplyAllPlacementDraftRows = useCallback(() => {
    setPlacementEntries(placementDraftEntries.map((entry) => ({ ...entry, rawFields: [...entry.rawFields] })));
  }, [placementDraftEntries]);

  const outlinerRoot = useMemo((): StageTreeNode | null => {
    if (!treeRoot) {
      if (importedDaeObjects.length === 0) return null;
      return {
        id: "root",
        label: "Scene",
        role: "root",
        children: importedDaeObjects.map((obj) => ({
          id: obj.id,
          label: obj.name,
          role: "imported_dae",
        })),
      };
    }
    const children: StageTreeNode[] = [];
    if (treeRoot.children) {
      for (const child of treeRoot.children) {
        if (child.role === "base") {
          children.push(child);
          continue;
        }
        if (child.role === "sub_model" && child.objectIndex != null) {
          const instances = placementEntries
            .map((entry, idx) => ({ entry, idx }))
            .filter(
              ({ entry }) =>
                entry.vdkType.toUpperCase() === "OBJECT" &&
                entry.objectNumber === child.objectIndex,
            );
          if (instances.length === 0) {
            children.push(child);
          } else {
            for (const { entry, idx } of instances) {
              const suffix = instances.length > 1 ? ` (${idx})` : "";
              children.push({
                id: formatPlacementViewportNodeId(child.id, idx),
                label: `${child.label}${suffix}`,
                role: "placement",
                objectIndex: child.objectIndex,
              });
            }
          }
          continue;
        }
        children.push(child);
      }
    }
    const effects = placementEntries
      .map((entry, idx) => ({ entry, idx }))
      .filter(({ entry }) => entry.vdkType.toUpperCase() !== "OBJECT");
    for (const { entry, idx } of effects) {
      children.push({
        id: `__effect__${idx}`,
        label: `${entry.vdkType}#${idx}`,
        role: "effect",
      });
    }
    for (const obj of importedDaeObjects) {
      children.push({
        id: obj.id,
        label: obj.name,
        role: "imported_dae",
      });
    }
    return { ...treeRoot, children };
  }, [treeRoot, placementEntries, importedDaeObjects]);

  const allNodeIds = useMemo(() => {
    if (!outlinerRoot) return [];
    const ids: string[] = [];
    const collect = (node: StageTreeNode) => {
      if (node.id !== "root") ids.push(node.id);
      node.children?.forEach(collect);
    };
    collect(outlinerRoot);
    return ids;
  }, [outlinerRoot]);

  const handleFocusSelected = useCallback(() => {
    viewportRef.current?.resetCamera();
  }, []);

  const handlePasteAsNew = useCallback(() => {
    const clipboard = useSceneEditorStore.getState().clipboard;
    if (clipboard.length === 0) return;

    const clipboardIds = clipboard.map((entry) => entry.nodeId);
    const daeSources = importedDaeObjects.filter((obj) => clipboardIds.includes(obj.id));
    if (daeSources.length > 0) {
      const created = daeSources.map((obj, index) => ({
        ...obj,
        id: `dae_${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${index}`,
        name: `${obj.name} Copy`,
        transform: {
          ...obj.transform,
          posX: obj.transform.posX + 1,
        },
      }));
      setImportedDaeObjects((prev) => [...prev, ...created]);
      setSelectedNodeIdRaw(created[0]?.id ?? null);
      useSceneEditorStore.getState().recordCommand({
        type: "paste-dae",
        description: "Paste imported DAE actor",
        undo: () => setImportedDaeObjects((prev) => prev.filter((obj) => !created.some((c) => c.id === obj.id))),
        redo: () => setImportedDaeObjects((prev) => [...prev, ...created]),
      });
      toast.success(`Pasted ${created.length} DAE object(s)`);
      return;
    }

    const copiedRows = clipboardIds
      .map(placementIndexForNodeId)
      .filter((idx): idx is number => idx !== null)
      .map((idx) => placementEntries[idx])
      .filter((entry): entry is PlacementRow => Boolean(entry));

    if (copiedRows.length === 0) {
      toast.error("Clipboard does not contain pasteable scene objects");
      return;
    }

    try {
      const result = pastePlacementsAfter(placementEntries, copiedRows, selectedPlacementIdx);
      setPlacementEntries(result.entries);
      setSelectedPlacementIdxRaw(result.insertedStart);
      setHasUnsavedChanges(true);
      useSceneEditorStore.getState().recordCommand({
        type: "paste-placement",
        description: "Paste placement rows",
        undo: () => {
          setPlacementEntries((prev) =>
            prev.filter((_, i) => i < result.insertedStart || i >= result.insertedStart + result.insertedRows.length),
          );
          setHasUnsavedChanges(true);
        },
        redo: () => {
          setPlacementEntries((prev) => {
            const next = [...prev];
            next.splice(result.insertedStart, 0, ...result.insertedRows);
            return next;
          });
          setSelectedPlacementIdxRaw(result.insertedStart);
          setHasUnsavedChanges(true);
        },
      });
      toast.success(`Pasted ${result.insertedRows.length} placement row(s)`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to paste selection");
    }
  }, [importedDaeObjects, placementEntries, placementIndexForNodeId, selectedPlacementIdx]);

  const handleImportDae = useCallback(async () => {
    try {
      const results = await importDAEFiles(true);
      if (results.length === 0) return;
      const created: ImportedDaeObject[] = results.map((result, index) => ({
        id: `dae_${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${index}`,
        name: result.fileName.replace(/\.dae$/i, ""),
        sourcePath: result.filePath,
        scene: result.scene,
        transform: { ...DEFAULT_TRANSFORM, posX: index },
      }));
      setImportedDaeObjects((prev) => [...prev, ...created]);
      setSelectedNodeIdRaw(created[0]?.id ?? null);
      setSelectedPlacementIdxRaw(null);
      useSceneEditorStore.getState().recordCommand({
        type: "import-dae",
        description: "Import DAE object",
        undo: () => setImportedDaeObjects((prev) => prev.filter((obj) => !created.some((c) => c.id === obj.id))),
        redo: () => setImportedDaeObjects((prev) => [...prev, ...created]),
      });
      toast.success(`Imported ${created.length} DAE object(s)`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to import DAE");
    }
  }, []);

  const handleExportSelectedDae = useCallback(async () => {
    const objects = viewportRef.current?.getSelectedExportObjects() ?? [];
    if (objects.length === 0) {
      toast.error("Select one or more scene objects before exporting DAE");
      return;
    }
    const safeObjects = objects.map((entry) => ({
      ...entry,
      name: entry.name.replace(/[\/\\:*?"<>|]/g, "_"),
    }));
    try {
      if (safeObjects.length === 1) {
        await exportObjectAsDAE(safeObjects[0].object, safeObjects[0].name);
      } else {
        await exportMultipleObjectsAsDAE(safeObjects);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to export DAE");
    }
  }, []);

  const handleDeleteSelected = useCallback(
    (ids?: string[]) => {
      const requestedIds = ids && ids.length > 0
        ? ids
        : selectedNodeId
          ? [selectedNodeId]
          : selectedPlacementIdx !== null
            ? [nodeIdForPlacementIndex(selectedPlacementIdx)].filter((id): id is string => Boolean(id))
            : [];

      if (hasLockedOrHiddenNode(requestedIds)) {
        toast.error("Locked or hidden scene objects cannot be deleted");
        return;
      }

      const daeIds = requestedIds.filter((id) => importedDaeObjects.some((obj) => obj.id === id));
      if (daeIds.length > 0) {
        const deleted = importedDaeObjects.filter((obj) => daeIds.includes(obj.id));
        setImportedDaeObjects((prev) => prev.filter((obj) => !daeIds.includes(obj.id)));
        setSelectedNodeIdRaw(null);
        useSceneEditorStore.getState().recordCommand({
          type: "delete-dae",
          description: "Delete imported DAE actor",
          undo: () => setImportedDaeObjects((prev) => [...prev, ...deleted]),
          redo: () => setImportedDaeObjects((prev) => prev.filter((obj) => !daeIds.includes(obj.id))),
        });
        toast.success(`Deleted ${deleted.length} DAE object(s)`);
        return;
      }

      const idx =
        requestedIds.map(placementIndexForNodeId).find((value): value is number => value !== null) ??
        selectedPlacementIdx;
      if (idx === null) return;

      try {
        const result = deletePlacementAt(placementEntries, idx);
        setPlacementEntries(result.entries);
        setSelectedNodeIdRaw(null);
        setSelectedPlacementIdxRaw(null);
        setHasUnsavedChanges(true);
        useSceneEditorStore.getState().recordCommand({
          type: "delete-placement",
          description: "Delete placement row",
          undo: () => {
            setPlacementEntries((prev) => {
              const next = [...prev];
              next.splice(idx, 0, result.deleted);
              return next;
            });
            setSelectedPlacementIdxRaw(idx);
            setHasUnsavedChanges(true);
          },
          redo: () => {
            setPlacementEntries((prev) => prev.filter((_, i) => i !== idx));
            setSelectedNodeIdRaw(null);
            setSelectedPlacementIdxRaw(null);
            setHasUnsavedChanges(true);
          },
        });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to delete selection");
      }
    },
    [
      hasLockedOrHiddenNode,
      importedDaeObjects,
      nodeIdForPlacementIndex,
      placementEntries,
      placementIndexForNodeId,
      selectedNodeId,
      selectedPlacementIdx,
    ],
  );

  useSceneKeyboard({
    onDelete: handleDeleteSelected,
    onDuplicate: () => handleDuplicateSelected(),
    onPaste: handlePasteAsNew,
    onFocus: handleFocusSelected,
    allNodeIds,
  });

  const selectedTreeId = useMemo(() => {
    if (!selectedNodeId) return null;
    const parsed = parsePlacementViewportNodeId(selectedNodeId);
    return parsed ? parsed.folderName : selectedNodeId;
  }, [selectedNodeId]);

  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    const direct = findNode(outlinerRoot, selectedNodeId);
    if (direct) return direct;
    const parsed = parsePlacementViewportNodeId(selectedNodeId);
    const treeLookupId = parsed ? parsed.folderName : selectedNodeId;
    return findNode(outlinerRoot, treeLookupId);
  }, [outlinerRoot, selectedNodeId]);

  const isBaseSelected = selectedNodeId === "base";

  const isStandaloneSubModel = !isBaseSelected &&
    selectedNodeId !== null &&
    selectedPlacementIdx === null &&
    subModels.some((s) => s.folderName === selectedNodeId);

  const selectedImportedDae = selectedNodeId
    ? importedDaeObjects.find((obj) => obj.id === selectedNodeId) ?? null
    : null;

  const selectedTransform: TransformData | null = isBaseSelected
    ? baseTransform
    : isStandaloneSubModel
      ? (standaloneTransforms.get(selectedNodeId!) ?? { ...DEFAULT_TRANSFORM })
      : selectedImportedDae
        ? selectedImportedDae.transform
      : selectedPlacementIdx !== null && placementEntries[selectedPlacementIdx]
        ? {
            posX: placementEntries[selectedPlacementIdx].posX,
            posY: placementEntries[selectedPlacementIdx].posY,
            posZ: placementEntries[selectedPlacementIdx].posZ,
            rotX: placementEntries[selectedPlacementIdx].rotX,
            rotY: placementEntries[selectedPlacementIdx].rotY,
            rotZ: placementEntries[selectedPlacementIdx].rotZ,
            scaleX: placementEntries[selectedPlacementIdx].scaleX,
            scaleY: placementEntries[selectedPlacementIdx].scaleY,
            scaleZ: placementEntries[selectedPlacementIdx].scaleZ,
          }
        : null;

  const canExportSelectedDae =
    selectedNodeId !== null &&
    (nodeVisibility[selectedNodeId] ?? true);

  const selectedTextureObject = useMemo(() => {
    if (!selectedNodeId) return null;
    if (selectedNodeId === "base" && baseModel) {
      return { objectId: "base", label: "base", bundle: baseModel };
    }
    const parsed = parsePlacementViewportNodeId(selectedNodeId);
    const folderName = parsed?.folderName ?? selectedNodeId;
    const sub = subModels.find((s) => s.folderName === folderName);
    if (!sub) return null;
    return {
      objectId: selectedNodeId,
      label: selectedNode?.label ?? folderName,
      bundle: sub.bundle,
    };
  }, [baseModel, selectedNode?.label, selectedNodeId, subModels]);

  const textureInventories = useMemo((): ObjectTextureInventory[] => {
    const objects: ObjectTextureInventory[] = [];
    if (baseModel) {
      objects.push({
        objectId: "base",
        objectLabel: "base",
        textures: collectBundleTextureInventory(
          baseModel,
          textureDataMap,
          textureSlotLoadEnabled,
          objectTextureLoadState,
          "base",
        ),
      });
    }
    for (const sub of subModels) {
      const placements = placementEntries
        .map((entry, index) => ({ entry, index }))
        .filter(({ entry }) => entry.vdkType.toUpperCase() === "OBJECT" && entry.objectNumber === sub.objectIndex);
      const objectIds = placements.length === 0
        ? [{ objectId: sub.folderName, label: sub.folderName }]
        : placements.map(({ index }) => ({
            objectId: formatPlacementViewportNodeId(sub.folderName, index),
            label: `${sub.folderName} (${index})`,
          }));
      for (const item of objectIds) {
        objects.push({
          objectId: item.objectId,
          objectLabel: item.label,
          textures: collectBundleTextureInventory(
            sub.bundle,
            textureDataMap,
            textureSlotLoadEnabled,
            objectTextureLoadState,
            item.objectId,
          ),
        });
      }
    }
    return objects;
  }, [baseModel, objectTextureLoadState, placementEntries, subModels, textureDataMap, textureSlotLoadEnabled]);

  return (
    <TooltipProvider>
      <div className="flex h-full min-h-0 min-w-0 flex-col bg-background">
        <MapToolbar
          onOpenFolder={handleOpenFolder}
          onImportFhm2d={handleImportFhm2d}
          onExtractFhm2d={handleExtractFhm2d}
          onSave={handleSave}
          onImportDae={handleImportDae}
          onExportSelectedDae={handleExportSelectedDae}
          canSave={!!stageName && !isMemoryImport}
          canExportDae={canExportSelectedDae}
          hasUnsavedChanges={hasUnsavedChanges}
          stageName={stageName}
          isLoading={isLoading}
          showGrid={showGrid}
          showAxes={showAxes}
          wireframe={wireframe}
          showStats={showStats}
          onToggleGrid={() => setShowGrid((v) => !v)}
          onToggleAxes={() => setShowAxes((v) => !v)}
          onToggleWireframe={() => setWireframe((v) => !v)}
          onToggleStats={() => setShowStats((v) => !v)}
          onResetCamera={() => viewportRef.current?.resetCamera()}
          onClearCache={() => setClearCacheDialogOpen(true)}
          clearCacheDisabled={isLoading || isLoadingBundle}
          placementGizmoMode={placementGizmoMode}
          onGizmoModeChange={setPlacementGizmoMode}
          animeRenderEnabled={sceneAnimeRenderEnabled}
          onToggleAnimeRender={setSceneAnimeRenderEnabled}
        />

        <AlertDialog open={clearCacheDialogOpen} onOpenChange={setClearCacheDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Clear scene memory and caches?</AlertDialogTitle>
              <AlertDialogDescription>
                This unloads the current stage (including memory-import sessions), clears decoded RGBA texture caches and
                nutexb preview cache (IndexedDB + in-memory blobs), and clears legacy Collada model cache used by scene
                import tools. Unsaved CSV edits will be lost unless you saved to disk first.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
              <AlertDialogAction
                type="button"
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => void handleConfirmClearCache()}
              >
                Clear
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <ResizablePanelGroup
          id="scene-edit-layout"
          orientation="horizontal"
          className="flex min-h-0 min-w-0 flex-1"
          defaultLayout={sceneEditLayout}
          onLayoutChanged={onLayoutChanged}
          resizeTargetMinimumSize={{ fine: 16, coarse: 24 }}
        >
          {/* Outliner (left panel) */}
          <ResizablePanel
            id="scene-hierarchy"
            defaultSize="20%"
            minSize="10%"
            maxSize="50%"
            className="min-w-0"
          >
            <div className="flex h-full min-w-0 flex-col overflow-hidden border-r">
              <div className="shrink-0 text-[10px] font-semibold px-3 py-1 border-b bg-muted/20 text-muted-foreground uppercase tracking-widest select-none whitespace-nowrap">
                Outliner
              </div>
              <div className="min-h-0 flex-1 overflow-hidden">
                <SceneOutliner
                  root={outlinerRoot}
                  onSelect={handleSelectNode}
                  onDuplicate={handleDuplicateSelected}
                  onDelete={handleDeleteSelected}
                  onPaste={handlePasteAsNew}
                  onFocusSelected={handleFocusSelected}
                />
              </div>
            </div>
          </ResizablePanel>

          <ResizableHandle
            withHandle
            className="relative z-30 w-1.5 shrink-0 bg-border/20 hover:bg-primary/25"
          />

          {/* Viewport (center) */}
          <ResizablePanel
            id="scene-viewport"
            defaultSize="60%"
            minSize="35%"
            maxSize="80%"
            className="min-w-0"
          >
            <ViewportContextMenu
              showGrid={showGrid}
              showAxes={showAxes}
              wireframe={wireframe}
              onToggleGrid={() => setShowGrid((v) => !v)}
              onToggleAxes={() => setShowAxes((v) => !v)}
              onToggleWireframe={() => setWireframe((v) => !v)}
              onResetCamera={() => viewportRef.current?.resetCamera()}
              onFocusSelected={handleFocusSelected}
              onGizmoMode={setPlacementGizmoMode}
              gizmoMode={placementGizmoMode}
              onImportDAE={handleImportDae}
              onExportDAE={handleExportSelectedDae}
              onDuplicateSelected={() => handleDuplicateSelected()}
              onDeleteSelected={handleDeleteSelected}
              hasSelection={selectedNodeId !== null}
            >
            <div className="relative h-full min-h-0 min-w-0 overflow-hidden">
              <MapViewport
                ref={viewportRef}
                baseModel={baseModel}
                subModels={subModels}
                importedDaeObjects={importedDaeObjects}
                placementEntries={placementEntries}
                showGrid={showGrid}
                showAxes={showAxes}
                wireframe={wireframe}
                showStats={showStats}
                selectedNodeId={selectedNodeId}
                selectedNodeIds={editorSelectedIds}
                nodeVisibility={nodeVisibility}
                objectLocks={objectLocks}
                selectedPlacementIdx={selectedPlacementIdx}
                onSelectNode={handleSelectNode}
                textureDataMap={textureDataMap}
                textureSlotLoadEnabled={textureSlotLoadEnabled}
                onDrawStatsChange={handleDrawStatsChange}
                graphicParams={appliedGraphicParams}
                baseTransform={baseTransform}
                onBaseTransformChange={commitBaseGizmoTransform}
                standaloneTransforms={standaloneTransforms}
                onStandaloneTransformChange={commitStandaloneGizmoTransform}
                onImportedDaeTransformChange={commitImportedDaeGizmoTransform}
                clickPickSelectionEnabled
                previewRenderStyle={scenePreviewRenderStyle}
                objectTextureLoadState={objectTextureLoadState}
                placementGizmoMode={placementGizmoMode}
                onPlacementGizmoCommit={commitPlacementGizmo}
              />
              <SceneViewportOverlay textureProgress={textureProgress} />
            </div>
            </ViewportContextMenu>
          </ResizablePanel>

          <ResizableHandle
            withHandle
            className="relative z-30 w-1.5 shrink-0 bg-border/20 hover:bg-primary/25"
          />

          {/* Properties (right panel — stacked Maya sections) */}
          <ResizablePanel
            id="scene-properties"
            defaultSize="20%"
            minSize="10%"
            maxSize="50%"
            className="min-w-0"
          >
            <div className="flex h-full min-w-0 flex-col overflow-hidden border-l">
              <div className="shrink-0 text-[10px] font-semibold px-3 py-1 border-b bg-muted/20 text-muted-foreground uppercase tracking-widest select-none whitespace-nowrap">
                Properties
              </div>
              <Tabs defaultValue="inspect" className="flex min-h-0 flex-1 flex-col">
                <TabsList className="mx-2 mt-2 grid h-8 grid-cols-3 rounded-md">
                  <TabsTrigger value="inspect" className="text-[10px]">Inspect</TabsTrigger>
                  <TabsTrigger value="graphic" className="text-[10px]">Graphic</TabsTrigger>
                  <TabsTrigger value="placement" className="text-[10px]">Placement</TabsTrigger>
                </TabsList>
                <ScrollArea className="flex-1">
                  <TabsContent value="inspect" className="m-0">
                    {selectedTransform && (
                      <MayaSection title={`Transform${selectedNode ? ` — ${selectedNode.label}` : ""}`}>
                        <StagePropertyEditor transform={selectedTransform} onTransformChange={handleTransformChange} />
                      </MayaSection>
                    )}

                    <MayaSection title="Scene">
                      <SceneInfoContent
                        stageName={stageName}
                        stageRoot={stageRoot}
                        selectedNode={selectedNode}
                        selectedPlacementIdx={selectedPlacementIdx}
                        placementEntry={selectedPlacementIdx !== null ? placementEntries[selectedPlacementIdx] : null}
                        subModelCount={subModels.length}
                        textureCount={textureDataMap.size}
                      />
                    </MayaSection>

                    {selectedPlacementIdx !== null && placementEntries[selectedPlacementIdx] && (
                      <MayaSection title="Object Config" defaultOpen>
                        <PlacementConfigPanel entry={placementEntries[selectedPlacementIdx]} placementHeader={placementHeader} />
                      </MayaSection>
                    )}

                    <MayaSection title="Texture">
                      <TextureQualityPanel
                        quality={textureQuality}
                        onQualityChange={handleTextureQualityChange}
                        textureSlotLoadEnabled={textureSlotLoadEnabled}
                        onTextureSlotMode={handleTextureSlotMode}
                        onTextureSlotToggle={handleTextureSlotToggle}
                        textureDataMap={textureDataMap}
                        isDecoding={textureProgress !== null}
                      />
                    </MayaSection>

                    {selectedTextureObject && (
                      <MayaSection title="Object Nutexb" defaultOpen>
                        <ModelTextureSlotPanel
                          objectId={selectedTextureObject.objectId}
                          bundle={selectedTextureObject.bundle}
                          textureDataMap={textureDataMap}
                          textureSlotLoadEnabled={textureSlotLoadEnabled}
                          objectTextureLoadState={objectTextureLoadState}
                          onTexturePathToggle={handleObjectTexturePathToggle}
                          modelLabel={selectedTextureObject.label}
                        />
                      </MayaSection>
                    )}

                    <MayaSection title="Loaded Nutexb" badge={textureInventories.length || undefined} defaultOpen={false}>
                      <GlobalLoadedTexturePanel objects={textureInventories} />
                    </MayaSection>

                    <MayaSection title="Stats" defaultOpen={false}>
                      <SceneStatsContent drawStats={drawStats} subModelCount={subModels.length} textureCount={textureDataMap.size} stageName={stageName} />
                    </MayaSection>
                  </TabsContent>

                  <TabsContent value="graphic" className="m-0">
                    <MayaSection title="Graphic Param" badge={`${appliedGraphicParamKeys.size}/${graphicParams.length}`} defaultOpen>
                      <GraphicParamPanel
                        params={graphicParams}
                        appliedKeys={appliedGraphicParamKeys}
                        onValueChange={handleGraphicParamValueChange}
                        onKeyChange={handleGraphicParamKeyChange}
                        onAdd={handleAddGraphicParam}
                        onDelete={handleDeleteGraphicParam}
                        onToggleApplied={handleToggleGraphicParamApplied}
                        onApplyAll={() => setAppliedGraphicParamKeys(new Set(graphicParams.map((p) => p.key)))}
                        onClearApplied={() => setAppliedGraphicParamKeys(new Set())}
                      />
                    </MayaSection>
                  </TabsContent>

                  <TabsContent value="placement" className="m-0">
                    <MayaSection title="Placement Draft" badge={`${placementEntries.length}/${placementDraftEntries.length}`} defaultOpen>
                      <PlacementCsvEditorPanel
                        draftEntries={placementDraftEntries}
                        appliedEntries={placementEntries}
                        selectedIndex={selectedPlacementIdx}
                        onSelectEntry={handleSelectPlacement}
                        onDraftRowChange={handlePlacementDraftRowChange}
                        onAddRow={handleAddPlacementDraftRow}
                        onDeleteRow={handleDeletePlacementDraftRow}
                        onApplyRow={handleApplyPlacementDraftRow}
                        onApplyAll={handleApplyAllPlacementDraftRows}
                      />
                    </MayaSection>
                  </TabsContent>
                </ScrollArea>
              </Tabs>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>

        <StageImportProgressDialog
          open={importProgress.open}
          progress={importProgress.progress}
          steps={importProgress.steps}
        />
        <StageRenamePreviewDialog
          open={renamePreview !== null}
          tree={renamePreview?.tree ?? null}
          warnings={renamePreview?.warnings ?? []}
          sourceName={renamePreview?.sourceName ?? ""}
          totalFiles={renamePreview?.totalFiles ?? 0}
          totalSizeBytes={renamePreview?.totalSizeBytes ?? 0}
          isLoadingBundle={isLoadingBundle}
          onLoad={handleRenameLoad}
          onClose={handleRenameCancel}
        />
      </div>
    </TooltipProvider>
  );
}

function buildTreeFromBundle(
  name: string,
  bundle: StageBundleResponse
): StageTreeNode {
  const children: StageTreeNode[] = [];

  if (bundle.baseModel) {
    children.push({
      id: "base",
      label: "base",
      role: "base",
    });
  }

  for (const sub of bundle.subModels) {
    children.push({
      id: sub.folderName,
      label: sub.folderName,
      role: "sub_model",
      objectIndex: sub.objectIndex,
    });
  }

  return {
    id: "root",
    label: name,
    role: "root",
    children,
  };
}

function findNode(
  root: StageTreeNode | null,
  id: string | null
): StageTreeNode | null {
  if (!root || !id) return null;
  if (root.id === id) return root;
  for (const child of root.children ?? []) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}
