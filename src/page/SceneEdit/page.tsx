import { useState, useCallback, useRef, useTransition, useEffect, useMemo } from "react";
import { useDefaultLayout } from "react-resizable-panels";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import * as THREE from "three";
import { DialogLastPathKey, getDialogDefaultPath, rememberDialogSelection } from "@/utils/dialogLastPath";
import {
  getStoredDialogDefaultPath,
  rememberStoredDialogSelection,
} from "@/utils/dialogDefaultPathStore";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { RotateCcw } from "lucide-react";

import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ScenePropertiesPanel } from "./components/ScenePropertiesPanel";
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
  type SceneExportObject,
} from "./components/MapViewport";
import {
  StagePropertyEditor,
  type TransformData,
} from "./components/StagePropertyEditor";
import {
  GraphicParamPanel,
  type GraphicParam,
} from "./components/GraphicParamPanel";
import { type PlacementRow } from "./types/placement";
import { PlacementCsvEditorPanel } from "./components/PlacementCsvEditorPanel";
import {
  formatPlacementViewportNodeId,
  parsePlacementViewportNodeId,
} from "./utils/placementNodeId";
import {
  getRequestedSceneNodeIds,
  resolveNodeIdForPlacementIndex,
  resolveSelectionForSceneNode,
} from "./utils/sceneEditorSelection";
import {
  patchPlacementRawFieldsForNumericField,
  patchPlacementRowTransform,
  syncParsedFieldsFromRaw,
} from "./utils/patchPlacementRawFields";
import {
  deletePlacementAt,
  deletePlacementsAt,
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
import { ssbhConvertDaeToSsbh } from "@/page/TestEditor/components/ssbh-model-preview/ssbhDaeIoService";
import { useDaeSsbhSessionStore } from "@/page/TestEditor/components/ssbh-model-preview/store/daeSsbhSessionStore";
import {
  clearNutexbPreviewCacheAsync,
  clearNutexbRgbaCache,
} from "@/page/TestEditor/components/ssbh-model-preview/nutexbPreviewCache";
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
  exportSingleStageDae,
  batchExportStageDae,
  importDAEFiles,
  loadDAEFromPath,
  type BatchDaeExportEntry,
} from "./utils/daeExportImport";
import {
  DaeExportDialog,
  type DaeExportConfig,
  type DaeExportTarget,
} from "./components/DaeExportDialog";
import { canEditSceneNode } from "./utils/sceneEditorNodeState";
import {
  addGraphicParam,
  applyGraphicParamSelection,
  createPlacementRowForType,
  deleteGraphicParamAt,
  updateGraphicParamKey,
  updateGraphicParamValue,
} from "./utils/sceneCsvEditors";
import {
  collectBundleTextureInventory,
  setTexturePathEnabledForObject,
  type ObjectTextureInventory,
  type ObjectTextureLoadState,
} from "./utils/sceneTextureInventory";
import { useConfigStore } from "@/store/configStore";
import {
  DEFAULT_SCENE_GIZMO_SIZE,
  normalizeSceneGizmoSize,
  SCENE_IMPORT_DAE_DIALOG_PATH_KEY,
} from "./utils/sceneEditorSettings";
import { useSceneDirtyStore } from "./store/sceneDirtyStore";
import { executeSaveFolderPipeline } from "./utils/sceneSaveFolderPipeline";
import { executeSaveFhm2dPipeline } from "./utils/sceneSaveFhm2dPipeline";
import { SaveProgressDialog, type SaveStepInfo } from "./components/SaveProgressDialog";
import { SaveConfirmDialog } from "./components/SaveConfirmDialog";
import { DeleteConfirmDialog } from "./components/DeleteConfirmDialog";
import type { DeleteConfirmation } from "./utils/sceneDeleteConfirm";
import {
  buildSaveChangePreview,
  buildSaveResultSummary,
  type SaveChangePreview,
} from "./utils/sceneSaveConfirm";
import { DaeImportConfigModal } from "./components/dae-import/DaeImportConfigModal";
import type { DaeImportEntry, HavokInstallInfo } from "./components/dae-import/daeImportTypes";
import { createDefaultDaeImportConfig, sanitizeBaseFilename } from "./components/dae-import/daeImportDefaults";
import { SceneAssetConfigPanel } from "./components/SceneAssetConfigPanel";
import { useSceneAssetStore } from "./store/sceneAssetStore";
import type { HavokMeshData } from "@/utils/havokXmlParser";
import { parseHavokXML } from "@/utils/havokXmlParser";
import { CollisionListPanel } from "./components/havok/CollisionListPanel";
import {
  sceneSessionCreate,
  sceneSessionDestroy,
  sceneSaveAsFolder,
  sceneRepackInPlace,
  sceneOpenFolder,
  sceneListHavokData,
  stageLoadSkeleton,
  stageStreamBundles,
  type StageSkeleton,
  type StageStreamChunk,
} from "./utils/sceneSessionService";

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

function ResetIconButton({ onClick, label, disabled }: { onClick: () => void; label: string; disabled?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex h-4 w-4 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
          onClick={onClick}
          disabled={disabled}
        >
          <RotateCcw className="h-3 w-3" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-[10px]">{label}</TooltipContent>
    </Tooltip>
  );
}

export default function SceneEdit() {
  const viewportRef = useRef<MapViewportHandle>(null);
  const allNodeIdsRef = useRef<string[]>([]);
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
  const [modelLoadProgress, setModelLoadProgress] = useState<{ loaded: number; total: number } | null>(null);
  const hasUnsavedChanges = useSceneDirtyStore(
    (s) => Object.keys(s.objects).length > 0 || s.global.graphicParams || s.global.placementOrder,
  );
  const [saveProgressState, setSaveProgressState] = useState<{
    open: boolean;
    title: string;
    steps: SaveStepInfo[];
    canClose: boolean;
    completionSummary?: string[];
  }>({ open: false, title: "", steps: [], canClose: false });
  const [saveConfirmState, setSaveConfirmState] = useState<{
    open: boolean;
    preview: SaveChangePreview | null;
    resolve: ((confirmed: boolean) => void) | null;
  }>({ open: false, preview: null, resolve: null });
  const [deleteConfirmState, setDeleteConfirmState] = useState<{
    open: boolean;
    preview: DeleteConfirmation | null;
    resolve: ((confirmed: boolean) => void) | null;
  }>({ open: false, preview: null, resolve: null });

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
  const [importedDaeObjects, setImportedDaeObjects] = useState<ImportedDaeObject[]>([]);
  const [treeRoot, setTreeRoot] = useState<StageTreeNode | null>(null);

  const initialSnapshotRef = useRef<{
    graphicParams: GraphicParam[];
    placementEntries: PlacementRow[];
  } | null>(null);

  const [resetDialogState, setResetDialogState] = useState<{
    open: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
  }>({ open: false, title: "", description: "", onConfirm: () => {} });

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

  const [daeExportDialog, setDaeExportDialog] = useState<{
    open: boolean;
    targets: DaeExportTarget[];
    threeObjects: SceneExportObject[];
  }>({ open: false, targets: [], threeObjects: [] });

  const [daeImportEntries, setDaeImportEntries] = useState<DaeImportEntry[]>([]);
  const [showDaeImportModal, setShowDaeImportModal] = useState(false);
  const [havokInfo, setHavokInfo] = useState<HavokInstallInfo | null>(null);
  const [havokMeshDataMap, setHavokMeshDataMap] = useState(() => new Map<string, HavokMeshData>());
  const [sceneSessionId, setSceneSessionId] = useState<string | null>(null);

  const viewMode = useSceneEditorStore((s) => s.viewMode);
  const setViewMode = useSceneEditorStore((s) => s.setViewMode);
  const showAabb = useSceneEditorStore((s) => s.showAabb);
  const setShowAabb = useSceneEditorStore((s) => s.setShowAabb);
  const showCollisionMesh = useSceneEditorStore((s) => s.showCollisionMesh);
  const setShowCollisionMesh = useSceneEditorStore((s) => s.setShowCollisionMesh);
  const collisionVisibility = useSceneEditorStore((s) => s.collisionVisibility);

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
    invoke<HavokInstallInfo | null>("detect_havok_installation").then(setHavokInfo);
  }, []);

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
  const sceneEditGizmoSize = useConfigStore((state) => state.sceneEditGizmoSize ?? DEFAULT_SCENE_GIZMO_SIZE);
  const setSceneEditGizmoSize = useConfigStore((state) => state.setSceneEditGizmoSize);
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

  useEffect(() => {
    return () => {
      if (sceneSessionId) {
        sceneSessionDestroy(sceneSessionId).catch(() => {});
      }
    };
  }, [sceneSessionId]);

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

  const handleGizmoSizeChange = useCallback(
    (size: number) => {
      const normalized = normalizeSceneGizmoSize(size);
      void setSceneEditGizmoSize(normalized).catch((err) => {
        toast.error("Failed to save gizmo size", { description: String(err) });
      });
    },
    [setSceneEditGizmoSize],
  );

  const applyPrimarySelectionState = useCallback(
    (id: string | null) => {
      const next = resolveSelectionForSceneNode(id, subModels, placementEntries);
      setSelectedNodeIdRaw(next.selectedNodeId);
      setSelectedPlacementIdxRaw(next.selectedPlacementIdx);
    },
    [placementEntries, subModels],
  );

  const handleClearSelection = useCallback(() => {
    applyPrimarySelectionState(null);
    useSceneEditorStore.getState().deselectAll();
  }, [applyPrimarySelectionState]);

  const handleSelectNode = useCallback(
    (id: string | null, opts?: { ctrl?: boolean; shift?: boolean }) => {
      const store = useSceneEditorStore.getState();
      if (id) {
        store.select(id, {
          ctrl: opts?.ctrl,
          shift: opts?.shift,
          allIds: allNodeIdsRef.current,
        });
        applyPrimarySelectionState(useSceneEditorStore.getState().getPrimaryId());
      } else {
        applyPrimarySelectionState(null);
        store.deselectAll();
      }
    },
    [applyPrimarySelectionState],
  );

  const handleSelectNodes = useCallback(
    (ids: string[], opts?: { ctrl?: boolean; shift?: boolean }) => {
      const store = useSceneEditorStore.getState();
      if (ids.length === 0) {
        if (!opts?.ctrl) {
          applyPrimarySelectionState(null);
          store.deselectAll();
        }
        return;
      }

      const primaryId = ids[ids.length - 1] ?? null;

      if (opts?.ctrl) {
        const next = new Set(store.getSelectedIds());
        for (const id of ids) {
          if (next.has(id)) next.delete(id);
          else next.add(id);
        }
        store.selectAll([...next]);
        applyPrimarySelectionState(useSceneEditorStore.getState().getPrimaryId());
        return;
      }

      if (opts?.shift) {
        store.selectAll([...new Set([...store.getSelectedIds(), ...ids])]);
        applyPrimarySelectionState(useSceneEditorStore.getState().getPrimaryId());
        return;
      }

      store.selectAll(ids);
      applyPrimarySelectionState(primaryId);
    },
    [applyPrimarySelectionState],
  );

  const handleOutlinerSelectNode = useCallback(
    (id: string | null) => {
      applyPrimarySelectionState(id);
    },
    [applyPrimarySelectionState],
  );

  const handleSelectPlacement = useCallback(
    (idx: number) => {
      setSelectedPlacementIdxRaw(idx);
      const nodeId = resolveNodeIdForPlacementIndex(idx, placementEntries, subModels);
      setSelectedNodeIdRaw(nodeId);
      const store = useSceneEditorStore.getState();
      if (nodeId) store.select(nodeId);
      else store.deselectAll();
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
      return resolveNodeIdForPlacementIndex(idx, placementEntries, subModels);
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
      const requestedIds = getRequestedSceneNodeIds({
        explicitIds: ids,
        storeSelectedIds: useSceneEditorStore.getState().getSelectedIds(),
        selectedNodeId,
        selectedPlacementIdx,
        nodeIdForPlacementIndex,
      });

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
        created.forEach((c) => useSceneDirtyStore.getState().markObjectAdded(c.name));
        // Clone asset config with parent inheritance
        originals.forEach((orig, i) => {
          useSceneAssetStore.getState().cloneAsset(orig.id, created[i].id);
        });
        useSceneDirtyStore.getState().markGlobalDirty("placementOrder");
        useSceneEditorStore.getState().recordCommand({
          type: "duplicate-dae",
          description: "Duplicate imported DAE actor",
          undo: () => {
            setImportedDaeObjects((prev) => prev.filter((obj) => !created.some((c) => c.id === obj.id)));
            created.forEach((c) => useSceneDirtyStore.getState().resetObject(c.name));
            handleClearSelection();
            useSceneDirtyStore.getState().markGlobalDirty("placementOrder");
          },
          redo: () => {
            setImportedDaeObjects((prev) => [...prev, ...created]);
            created.forEach((c) => useSceneDirtyStore.getState().markObjectAdded(c.name));
            const id = created[0]?.id ?? null;
            if (id) handleSelectNode(id);
            useSceneDirtyStore.getState().markGlobalDirty("placementOrder");
          },
        });
        const nextSelectedId = created[0]?.id ?? selectedNodeId;
        setSelectedNodeIdRaw(nextSelectedId);
        setSelectedPlacementIdxRaw(null);
        if (nextSelectedId) useSceneEditorStore.getState().select(nextSelectedId);
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
        useSceneDirtyStore.getState().markGlobalDirty("placementOrder");
        const inserted = result.insertedRow;
        const sub = inserted.objectNumber !== null
          ? subModels.find((s) => s.objectIndex === inserted.objectNumber)
          : null;
        const insertedNodeId = sub
          ? formatPlacementViewportNodeId(sub.folderName, result.insertedIndex)
          : null;
        if (insertedNodeId) {
          setSelectedNodeIdRaw(insertedNodeId);
          useSceneEditorStore.getState().select(insertedNodeId);
        }
        useSceneEditorStore.getState().recordCommand({
          type: "duplicate-placement",
          description: "Duplicate placement row",
          undo: () => {
            setPlacementEntries((prev) => prev.filter((_, i) => i !== result.insertedIndex));
            setSelectedPlacementIdxRaw(firstPlacementIdx);
            const restoredNodeId = nodeIdForPlacementIndex(firstPlacementIdx);
            if (restoredNodeId) {
              setSelectedNodeIdRaw(restoredNodeId);
              useSceneEditorStore.getState().select(restoredNodeId);
            }
            useSceneDirtyStore.getState().markGlobalDirty("placementOrder");
          },
          redo: () => {
            setPlacementEntries((prev) => {
              const next = [...prev];
              next.splice(result.insertedIndex, 0, result.insertedRow);
              return next;
            });
            setSelectedPlacementIdxRaw(result.insertedIndex);
            if (insertedNodeId) {
              setSelectedNodeIdRaw(insertedNodeId);
              useSceneEditorStore.getState().select(insertedNodeId);
            }
            useSceneDirtyStore.getState().markGlobalDirty("placementOrder");
          },
        });
        toast.success("Placement row duplicated");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to duplicate selection");
      }
    },
    [
      handleClearSelection,
      hasLockedOrHiddenNode,
      handleSelectNode,
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
    (path: string, bundle: StageBundleResponse, options: { showToast?: boolean } = {}) => {
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
        initialSnapshotRef.current = {
          graphicParams: bundle.graphicParams.map((p) => ({ key: p.key, value: p.value })),
          placementEntries: orderedPlacements.map((e) => ({ ...e, rawFields: [...e.rawFields] })),
        };
        setObjectTextureLoadState({});
        const tree = buildTreeFromBundle(folderName, bundle);
        setTreeRoot(tree);
        setSelectedNodeIdRaw(null);
        setSelectedPlacementIdxRaw(null);
        useSceneEditorStore.getState().deselectAll();
      });

      const showToast = options.showToast ?? true;
      if (!showToast) return;

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

  const applySkeleton = useCallback(
    (path: string, skeleton: StageSkeleton) => {
      startTransition(() => {
        const folderName =
          path.split(/[/\\]/).filter(Boolean).pop() ?? "stage";
        setStageName(folderName);
        setStageRoot(path);
        setBaseModel(null);
        setSubModels([]);
        setGraphicParams(
          skeleton.graphicParams.map((p) => ({ key: p.key, value: p.value }))
        );
        setAppliedGraphicParamKeys(new Set());
        setPlacementHeader(skeleton.placementHeader);
        const colMap: Record<string, number> = {};
        skeleton.placementHeader.forEach((h, i) => {
          colMap[h.toUpperCase()] = i;
        });
        setPlacementColMap(colMap);
        const mappedPlacements = skeleton.placementEntries.map((e) => ({
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
        const orderedPlacements = reorderPlacementEntriesBySubModels(mappedPlacements, skeleton.subModelManifest);
        setPlacementEntries(orderedPlacements);
        initialSnapshotRef.current = {
          graphicParams: skeleton.graphicParams.map((p) => ({ key: p.key, value: p.value })),
          placementEntries: orderedPlacements.map((e) => ({ ...e, rawFields: [...e.rawFields] })),
        };
        setObjectTextureLoadState({});

        const children: StageTreeNode[] = [];
        if (skeleton.hasBaseModel) {
          children.push({ id: "base", label: "base", role: "base" });
        }
        for (const entry of skeleton.subModelManifest) {
          children.push({
            id: entry.folderName,
            label: entry.folderName,
            role: "sub_model",
            objectIndex: entry.objectIndex,
          });
        }
        setTreeRoot({ id: "root", label: folderName, role: "root", children });
        setSelectedNodeIdRaw(null);
        setSelectedPlacementIdxRaw(null);
        useSceneEditorStore.getState().deselectAll();
      });

      if (skeleton.warnings.length > 0) {
        toast.warning(
          `Skeleton loaded with ${skeleton.warnings.length} warning(s)`,
          { description: skeleton.warnings.slice(0, 3).join("\n") }
        );
      }
    },
    []
  );

  const resetState = useCallback(() => {
    if (sessionId) {
      disposeFhm2dMemorySession(sessionId).catch(() => {});
    }
    if (sceneSessionId) {
      sceneSessionDestroy(sceneSessionId).catch(() => {});
    }
    initialSnapshotRef.current = null;
    setStageName(null);
    setStageRoot(null);
    setIsMemoryImport(false);
    setSessionId(null);
    setSceneSessionId(null);
    setBaseModel(null);
    setSubModels([]);
    setGraphicParams([]);
    setAppliedGraphicParamKeys(new Set());
    setPlacementHeader([]);
    setPlacementColMap({});
    setPlacementEntries([]);
    setImportedDaeObjects([]);
    setTreeRoot(null);
    setDrawStats(null);
    setBaseTransform({ ...DEFAULT_TRANSFORM });
    setStandaloneTransforms(new Map());
    setSelectedNodeIdRaw(null);
    setSelectedPlacementIdxRaw(null);
    useSceneEditorStore.getState().resetAll();
    useSceneDirtyStore.getState().reset();
    setRenamePreview(null);
    setImportProgress((prev) => ({ ...prev, open: false }));
    setHavokMeshDataMap(new Map());
  }, [sessionId, sceneSessionId]);

  const handleConfirmClearCache = useCallback(async () => {
    setClearCacheDialogOpen(false);
    resetState();
    viewportRef.current?.disposeTextures();
    clearNutexbRgbaCache();
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

      const stageRoot = `${selected}\\0\\0`;

      setIsLoading(true);
      resetState();

      const bundle = await invoke<StageBundleResponse>("load_stage_bundle", {
        stageRoot,
      });
      applyBundle(stageRoot, bundle);

      sceneOpenFolder(stageRoot).then(async (result) => {
        setSceneSessionId(result.sessionId);
        try {
          const havokList = await sceneListHavokData(result.sessionId);
          if (havokList.length > 0) {
            const map = new Map<string, HavokMeshData>();
            for (const item of havokList) {
              try {
                const meshData = parseHavokXML(item.hktXml);
                map.set(item.sourceId, meshData);
              } catch (e) {
                console.warn(`[Havok] Failed to parse ${item.sourceId}:`, e);
              }
            }
            setHavokMeshDataMap(map);
            toast.success(`Loaded ${map.size} collision mesh(es)`);
          } else {
            toast.info("No HKT collision files found");
          }
        } catch (e) {
          toast.error("Failed to load collision data", { description: String(e) });
        }
      }).catch((e) => {
        toast.error("Havok scene session failed", { description: String(e) });
      });
    } catch (err: unknown) {
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

      const extractSteps: SaveStepInfo[] = [
        { id: "extract", label: "Extract FHM2D binary", status: "running" },
        { id: "textures", label: "Consolidate textures to shared folder", status: "pending" },
        { id: "done", label: "Complete", status: "pending" },
      ];
      setSaveProgressState({ open: true, title: "Extract FHM2D", steps: extractSteps, canClose: false });

      const unlisten = await listen<{ step: string; label: string; detail: string | null }>(
        "extract-fhm2d-progress",
        (event) => {
          const { step, detail } = event.payload;
          setSaveProgressState((prev) => {
            const steps = prev.steps.map((s) => {
              if (s.id === step) {
                return { ...s, status: "running" as const, detail: detail ?? undefined };
              }
              return s;
            });
            const stepIdx = steps.findIndex((s) => s.id === step);
            for (let i = 0; i < stepIdx; i++) {
              if (steps[i].status === "running" || steps[i].status === "pending") {
                steps[i] = { ...steps[i], status: "done" };
              }
            }
            return { ...prev, steps };
          });
        },
      );

      try {
        const result = await invoke<{
          outputDir: string;
          totalFiles: number;
          totalBytes: number;
          warnings: string[];
        }>("extract_stage_fhm2d_to_folder", {
          sourcePath,
          outputDir,
        });

        setSaveProgressState((prev) => ({
          ...prev,
          steps: prev.steps.map((s) => ({ ...s, status: "done" as const })),
          canClose: true,
        }));

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
      } finally {
        unlisten();
      }
    } catch (err: any) {
      setSaveProgressState((prev) => ({
        ...prev,
        steps: prev.steps.map((s) =>
          s.status === "running" ? { ...s, status: "error" as const, error: String(err) } : s,
        ),
        canClose: true,
      }));
      toast.error("FHM2D extraction failed", { description: String(err) });
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

      // Load HKT collision data from memory session
      if (result.sessionId) {
        console.log("[Havok] Starting HKT conversion for session:", result.sessionId);
        invoke<{ sourceId: string; hktXml: string }[]>(
          "fhm2d_memory_convert_hkt_to_xml",
          { sessionId: result.sessionId },
        ).then((entries) => {
          console.log(`[Havok] Received ${entries.length} HKT entries`);
          if (entries.length > 0) {
            const map = new Map<string, HavokMeshData>();
            for (const item of entries) {
              try {
                const meshData = parseHavokXML(item.hktXml);
                map.set(item.sourceId, meshData);
                console.log(`[Havok] Parsed: ${item.sourceId}`);
              } catch (e) {
                console.warn(`[Havok] Failed to parse ${item.sourceId}:`, e);
              }
            }
            console.log(`[Havok] Setting havokMeshDataMap with ${map.size} entries`);
            setHavokMeshDataMap(map);
            toast.success(`Loaded ${map.size} collision mesh(es)`);
          } else {
            console.log("[Havok] No HKT files found in memory session");
            toast.info("No HKT collision files found in this stage");
          }
        }).catch((e) => {
          console.error("[Havok] Failed to convert HKT from memory:", e);
          toast.error("Failed to load collision data", { description: String(e) });
        });
      } else {
        console.log("[Havok] No sessionId, skipping HKT load");
      }
    } catch (err: any) {
      toast.error("Failed to load stage into scene", { description: String(err) });
    } finally {
      setIsLoadingBundle(false);
    }
  }, [applyBundle]);

  const updateSaveProgress = useCallback((step: SaveStepInfo) => {
    setSaveProgressState((prev) => {
      const idx = prev.steps.findIndex((s) => s.id === step.id);
      const nextSteps = [...prev.steps];
      if (idx >= 0) nextSteps[idx] = step;
      else nextSteps.push(step);
      return { ...prev, steps: nextSteps };
    });
  }, []);

  const promptDeleteConfirm = useCallback(
    (preview: DeleteConfirmation) =>
      new Promise<boolean>((resolve) => {
        setDeleteConfirmState({ open: true, preview, resolve });
      }),
    [],
  );

  const promptSaveConfirm = useCallback(
    (preview: SaveChangePreview) =>
      new Promise<boolean>((resolve) => {
        setSaveConfirmState({ open: true, preview, resolve });
      }),
    [],
  );

  const handleSaveConfirmAccept = useCallback(() => {
    saveConfirmState.resolve?.(true);
    setSaveConfirmState({ open: false, preview: null, resolve: null });
  }, [saveConfirmState.resolve]);

  const handleSaveConfirmCancel = useCallback(() => {
    saveConfirmState.resolve?.(false);
    setSaveConfirmState({ open: false, preview: null, resolve: null });
  }, [saveConfirmState.resolve]);

  const handleDeleteConfirmAccept = useCallback(() => {
    deleteConfirmState.resolve?.(true);
    setDeleteConfirmState({ open: false, preview: null, resolve: null });
  }, [deleteConfirmState.resolve]);

  const handleDeleteConfirmCancel = useCallback(() => {
    deleteConfirmState.resolve?.(false);
    setDeleteConfirmState({ open: false, preview: null, resolve: null });
  }, [deleteConfirmState.resolve]);

  const handleSaveFolder = useCallback(async () => {
    if (!stageRoot) return;

    const dirtyStore = useSceneDirtyStore.getState();
    const changePreview = buildSaveChangePreview(dirtyStore);
    if (changePreview.hasChanges) {
      const confirmed = await promptSaveConfirm(changePreview);
      if (!confirmed) return;
    }

    setSaveProgressState({
      open: true,
      title: "Save as Folder",
      steps: [],
      canClose: false,
      completionSummary: undefined,
    });

    try {
      const result = await executeSaveFolderPipeline({
        stageRoot,
        dirtyStore,
        graphicParams,
        placementHeader,
        placementEntries,
        importedDaeObjects,
        sceneSessionId,
        onProgress: updateSaveProgress,
        onDeleteConfirm: promptDeleteConfirm,
      });

      if (!result.success) {
        setSaveProgressState((prev) => ({ ...prev, canClose: true }));
        return;
      }

      if (result.reloadedBundle) {
        applyBundle(stageRoot, result.reloadedBundle as any, { showToast: false });
      }

      useSceneDirtyStore.getState().reset();
      const completionSummary = buildSaveResultSummary(changePreview, result);
      setSaveProgressState((prev) => ({ ...prev, canClose: true, completionSummary }));

      if (result.failedCount > 0 && result.convertedCount > 0) {
        toast.warning(
          `Saved with partial results: ${result.convertedCount} converted, ${result.failedCount} failed (${result.failedNames.join(", ")})`,
        );
      } else if (result.failedCount > 0) {
        toast.error(
          `All ${result.failedCount} DAE conversion(s) failed: ${result.failedNames.join(", ")}`,
        );
      } else if (result.convertedCount > 0) {
        toast.success(
          `Folder saved; converted ${result.convertedCount} imported DAE object(s) to SSBH`,
        );
      } else {
        toast.success("Folder saved");
      }
    } catch (err: any) {
      setSaveProgressState((prev) => ({ ...prev, canClose: true }));
      toast.error("Save failed", { description: String(err) });
    }
  }, [stageRoot, graphicParams, placementHeader, placementEntries, importedDaeObjects, sceneSessionId, applyBundle, updateSaveProgress, promptDeleteConfirm, promptSaveConfirm]);

  const handleSaveFhm2d = useCallback(async () => {
    if (!stageRoot) return;

    const dirtyStore = useSceneDirtyStore.getState();
    const changePreview = buildSaveChangePreview(dirtyStore);
    if (changePreview.hasChanges) {
      const confirmed = await promptSaveConfirm(changePreview);
      if (!confirmed) return;
    }

    const outputPath = await save({
      filters: [{ name: "FHM2D File", extensions: ["fhm2d"] }],
    });
    if (!outputPath) return;

    setSaveProgressState({
      open: true,
      title: "Save as FHM2D",
      steps: [],
      canClose: false,
      completionSummary: undefined,
    });

    try {
      const result = await executeSaveFhm2dPipeline({
        stageRoot,
        dirtyStore,
        graphicParams,
        placementHeader,
        placementEntries,
        importedDaeObjects,
        sceneSessionId,
        outputFhm2dPath: outputPath,
        onProgress: updateSaveProgress,
        onDeleteConfirm: promptDeleteConfirm,
      });

      if (!result.success) {
        setSaveProgressState((prev) => ({ ...prev, canClose: true }));
        return;
      }

      if (result.reloadedBundle) {
        applyBundle(stageRoot, result.reloadedBundle as any, { showToast: false });
      }

      useSceneDirtyStore.getState().reset();
      const completionSummary = [
        ...buildSaveResultSummary(changePreview, result),
        `Packed FHM2D (${(result.fhm2dSizeBytes / (1024 * 1024)).toFixed(1)} MB)`,
      ];
      setSaveProgressState((prev) => ({ ...prev, canClose: true, completionSummary }));

      toast.success(`FHM2D saved (${(result.fhm2dSizeBytes / (1024 * 1024)).toFixed(1)} MB)`);
    } catch (err: any) {
      setSaveProgressState((prev) => ({ ...prev, canClose: true }));
      toast.error("FHM2D save failed", { description: String(err) });
    }
  }, [stageRoot, graphicParams, placementHeader, placementEntries, importedDaeObjects, sceneSessionId, applyBundle, updateSaveProgress, promptDeleteConfirm, promptSaveConfirm]);

  const handleGraphicParamValueChange = useCallback(
    (index: number, value: string) => {
      setGraphicParams((prev) => updateGraphicParamValue(prev, index, value));
      useSceneDirtyStore.getState().markGlobalDirty("graphicParams");
    },
    []
  );
  const handleGraphicParamKeyChange = useCallback((index: number, key: string) => {
    try {
      setGraphicParams((prev) => updateGraphicParamKey(prev, index, key));
      useSceneDirtyStore.getState().markGlobalDirty("graphicParams");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Invalid graphic_param key");
    }
  }, []);
  const handleAddGraphicParam = useCallback(() => {
    try {
      setGraphicParams((prev) => addGraphicParam(prev, "new_param", "0"));
      useSceneDirtyStore.getState().markGlobalDirty("graphicParams");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add graphic_param row");
    }
  }, []);
  const handleDeleteGraphicParam = useCallback((index: number) => {
    setGraphicParams((prev) => deleteGraphicParamAt(prev, index));
    useSceneDirtyStore.getState().markGlobalDirty("graphicParams");
  }, []);
  const handleToggleGraphicParamApplied = useCallback((key: string, applied: boolean) => {
    setAppliedGraphicParamKeys((prev) => {
      const next = new Set(prev);
      if (applied) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  const openResetDialog = useCallback((title: string, description: string, onConfirm: () => void) => {
    setResetDialogState({ open: true, title, description, onConfirm });
  }, []);

  const handleResetSession = useCallback(() => {
    const snap = initialSnapshotRef.current;
    if (!snap) return;
    openResetDialog(
      "Reset all changes?",
      "This will revert all graphic param and placement edits back to the originally loaded state. Undo history will be cleared.",
      () => {
        setGraphicParams(snap.graphicParams.map((p) => ({ ...p })));
        setAppliedGraphicParamKeys(new Set());
        setPlacementEntries(snap.placementEntries.map((e) => ({ ...e, rawFields: [...e.rawFields] })));
        setBaseTransform({ ...DEFAULT_TRANSFORM });
        setStandaloneTransforms(new Map());
        useSceneEditorStore.getState().clearHistory();
        useSceneDirtyStore.getState().reset();
        toast.success("All changes reverted to loaded state");
      },
    );
  }, [openResetDialog]);

  const handleResetGraphicParams = useCallback(() => {
    const snap = initialSnapshotRef.current;
    if (!snap) return;
    openResetDialog(
      "Reset graphic params?",
      "This will revert all graphic_param edits back to the originally loaded values.",
      () => {
        setGraphicParams(snap.graphicParams.map((p) => ({ ...p })));
        setAppliedGraphicParamKeys(new Set());
        useSceneDirtyStore.getState().markGlobalDirty("graphicParams");
        toast.success("Graphic params reverted");
      },
    );
  }, [openResetDialog]);

  const handleResetPlacement = useCallback(() => {
    const snap = initialSnapshotRef.current;
    if (!snap) return;
    openResetDialog(
      "Reset all placements?",
      "This will revert all placement edits (add, delete, field changes) back to the originally loaded state.",
      () => {
        setPlacementEntries(snap.placementEntries.map((e) => ({ ...e, rawFields: [...e.rawFields] })));
        setSelectedPlacementIdxRaw(null);
        useSceneDirtyStore.getState().markGlobalDirty("placementOrder");
        toast.success("Placements reverted");
      },
    );
  }, [openResetDialog]);

  const handleResetPlacementRow = useCallback((index: number) => {
    const snap = initialSnapshotRef.current;
    if (!snap) return;
    const original = snap.placementEntries[index];
    if (!original) {
      toast.error("This row was added after loading — use delete instead");
      return;
    }
    const before = placementEntries[index];
    if (!before) return;
    const restored = { ...original, rawFields: [...original.rawFields] };
    setPlacementEntries((prev) => {
      const next = [...prev];
      next[index] = restored;
      return next;
    });
    useSceneDirtyStore.getState().markGlobalDirty("placementOrder");
    useSceneEditorStore.getState().recordCommand({
      type: "reset-placement-row",
      description: `Reset placement row #${index}`,
      undo: () => {
        setPlacementEntries((prev) => {
          const next = [...prev];
          next[index] = before;
          return next;
        });
        useSceneDirtyStore.getState().markGlobalDirty("placementOrder");
      },
      redo: () => {
        setPlacementEntries((prev) => {
          const next = [...prev];
          next[index] = { ...original, rawFields: [...original.rawFields] };
          return next;
        });
        useSceneDirtyStore.getState().markGlobalDirty("placementOrder");
      },
    });
    toast.success(`Placement row #${index} reverted`);
  }, [placementEntries]);

  const handleResetPlacementField = useCallback((index: number, fieldIndex: number) => {
    const snap = initialSnapshotRef.current;
    if (!snap) return;
    const original = snap.placementEntries[index];
    if (!original || original.rawFields[fieldIndex] === undefined) return;
    const current = placementEntries[index];
    if (!current) return;
    const beforeValue = current.rawFields[fieldIndex];
    const originalValue = original.rawFields[fieldIndex];
    if (beforeValue === originalValue) return;
    const rawFields = [...current.rawFields];
    rawFields[fieldIndex] = originalValue;
    const nextEntry = syncParsedFieldsFromRaw({ ...current, rawFields });
    setPlacementEntries((prev) => {
      const next = [...prev];
      next[index] = nextEntry;
      return next;
    });
    useSceneDirtyStore.getState().markGlobalDirty("placementOrder");
    useSceneEditorStore.getState().recordCommand({
      type: "reset-placement-field",
      description: "Reset placement field",
      undo: () => {
        setPlacementEntries((prev) => {
          const next = [...prev];
          next[index] = current;
          return next;
        });
        useSceneDirtyStore.getState().markGlobalDirty("placementOrder");
      },
      redo: () => {
        setPlacementEntries((prev) => {
          const next = [...prev];
          next[index] = nextEntry;
          return next;
        });
        useSceneDirtyStore.getState().markGlobalDirty("placementOrder");
      },
    });
  }, [placementEntries]);

  const handleResetTransform = useCallback(() => {
    if (!selectedNodeId) return;
    if (selectedNodeId === "base") {
      const before = baseTransform;
      setBaseTransform({ ...DEFAULT_TRANSFORM });
      useSceneEditorStore.getState().recordCommand({
        type: "reset-transform",
        description: "Reset base transform",
        undo: () => setBaseTransform(before),
        redo: () => setBaseTransform({ ...DEFAULT_TRANSFORM }),
      });
    } else if (standaloneTransforms.has(selectedNodeId)) {
      const before = standaloneTransforms.get(selectedNodeId)!;
      setStandaloneTransforms((prev) => {
        const next = new Map(prev);
        next.set(selectedNodeId, { ...DEFAULT_TRANSFORM });
        return next;
      });
      useSceneEditorStore.getState().recordCommand({
        type: "reset-transform",
        description: "Reset standalone transform",
        undo: () => setStandaloneTransforms((prev) => { const next = new Map(prev); next.set(selectedNodeId, before); return next; }),
        redo: () => setStandaloneTransforms((prev) => { const next = new Map(prev); next.set(selectedNodeId, { ...DEFAULT_TRANSFORM }); return next; }),
      });
    } else if (selectedPlacementIdx !== null) {
      const snap = initialSnapshotRef.current;
      const original = snap?.placementEntries[selectedPlacementIdx];
      const current = placementEntries[selectedPlacementIdx];
      if (!current) return;
      const target = original
        ? placementToTransform(original)
        : { posX: 0, posY: 0, posZ: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 };
      const before = { ...current };
      const nextEntry = patchPlacementRowTransform(current, target, placementColMap);
      setPlacementEntries((prev) => {
        const next = [...prev];
        next[selectedPlacementIdx] = nextEntry;
        return next;
      });
      useSceneDirtyStore.getState().markGlobalDirty("placementOrder");
      useSceneEditorStore.getState().recordCommand({
        type: "reset-placement-transform",
        description: "Reset placement transform",
        undo: () => { setPlacementEntries((prev) => { const next = [...prev]; next[selectedPlacementIdx] = before; return next; }); useSceneDirtyStore.getState().markGlobalDirty("placementOrder"); },
        redo: () => { setPlacementEntries((prev) => { const next = [...prev]; next[selectedPlacementIdx] = nextEntry; return next; }); useSceneDirtyStore.getState().markGlobalDirty("placementOrder"); },
      });
    }
  }, [selectedNodeId, baseTransform, standaloneTransforms, selectedPlacementIdx, placementEntries, placementColMap]);

  const handleResetGraphicParamValue = useCallback((index: number) => {
    const snap = initialSnapshotRef.current;
    if (!snap) return;
    const original = snap.graphicParams[index];
    if (!original) return;
    setGraphicParams((prev) => {
      const next = [...prev];
      if (next[index]) next[index] = { ...original };
      return next;
    });
    useSceneDirtyStore.getState().markGlobalDirty("graphicParams");
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
      useSceneDirtyStore.getState().markGlobalDirty("placementOrder");
      useSceneEditorStore.getState().recordCommand({
        type: "edit-placement-field",
        description: "Edit placement transform",
        undo: () => {
          setPlacementEntries((prev) => {
            const next = [...prev];
            next[index] = previous;
            return next;
          });
          useSceneDirtyStore.getState().markGlobalDirty("placementOrder");
        },
        redo: () => {
          setPlacementEntries((prev) => {
            const next = [...prev];
            next[index] = nextEntry;
            return next;
          });
          useSceneDirtyStore.getState().markGlobalDirty("placementOrder");
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
      useSceneDirtyStore.getState().markGlobalDirty("placementOrder");
      useSceneEditorStore.getState().recordCommand({
        type: "gizmo-placement-transform",
        description: "Move placement gizmo",
        undo: () => {
          setPlacementEntries((prev) => {
            const next = [...prev];
            next[idx] = previous;
            return next;
          });
          useSceneDirtyStore.getState().markGlobalDirty("placementOrder");
        },
        redo: () => {
          setPlacementEntries((prev) => {
            const next = [...prev];
            next[idx] = nextEntry;
            return next;
          });
          useSceneDirtyStore.getState().markGlobalDirty("placementOrder");
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
      useSceneDirtyStore.getState().markGlobalDirty("placementOrder");
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

  const fieldEditSnapshotRef = useRef<{ index: number; fieldIndex: number; before: PlacementRow } | null>(null);

  const handlePlacementFieldPreview = useCallback(
    (index: number, fieldIndex: number, value: string) => {
      const current = placementEntries[index];
      if (!current) return;
      if (!fieldEditSnapshotRef.current || fieldEditSnapshotRef.current.index !== index || fieldEditSnapshotRef.current.fieldIndex !== fieldIndex) {
        fieldEditSnapshotRef.current = { index, fieldIndex, before: current };
      }
      const rawFields = [...current.rawFields];
      rawFields[fieldIndex] = value;
      const nextEntry = syncParsedFieldsFromRaw({ ...current, rawFields });
      setPlacementEntries((prev) => {
        const next = [...prev];
        next[index] = nextEntry;
        return next;
      });
      useSceneDirtyStore.getState().markGlobalDirty("placementOrder");
    },
    [placementEntries],
  );

  const handlePlacementFieldCommit = useCallback(
    (index: number, fieldIndex: number, value: string) => {
      const snapshot = fieldEditSnapshotRef.current;
      const before = snapshot && snapshot.index === index && snapshot.fieldIndex === fieldIndex
        ? snapshot.before
        : placementEntries[index];
      fieldEditSnapshotRef.current = null;
      if (!before) return;
      const rawFields = [...before.rawFields];
      rawFields[fieldIndex] = value;
      const nextEntry = syncParsedFieldsFromRaw({ ...before, rawFields });
      setPlacementEntries((prev) => {
        const next = [...prev];
        next[index] = nextEntry;
        return next;
      });
      useSceneDirtyStore.getState().markGlobalDirty("placementOrder");
      useSceneEditorStore.getState().recordCommand({
        type: "edit-placement-field",
        description: "Edit placement field",
        undo: () => {
          setPlacementEntries((prev) => {
            const next = [...prev];
            next[index] = before;
            return next;
          });
          useSceneDirtyStore.getState().markGlobalDirty("placementOrder");
        },
        redo: () => {
          setPlacementEntries((prev) => {
            const next = [...prev];
            next[index] = nextEntry;
            return next;
          });
          useSceneDirtyStore.getState().markGlobalDirty("placementOrder");
        },
      });
    },
    [placementEntries],
  );

  const handleAddPlacementField = useCallback(
    (index: number, key: string, value: string) => {
      const previous = placementEntries[index];
      if (!previous) return;
      const normalizedKey = key.trim().toUpperCase();
      if (!normalizedKey) return;
      const rawFields = [...previous.rawFields, normalizedKey, value];
      const nextEntry = syncParsedFieldsFromRaw({ ...previous, rawFields });
      setPlacementEntries((prev) => {
        const next = [...prev];
        next[index] = nextEntry;
        return next;
      });
      useSceneDirtyStore.getState().markGlobalDirty("placementOrder");
      useSceneEditorStore.getState().recordCommand({
        type: "add-placement-field",
        description: "Add placement field",
        undo: () => {
          setPlacementEntries((prev) => {
            const next = [...prev];
            next[index] = previous;
            return next;
          });
          useSceneDirtyStore.getState().markGlobalDirty("placementOrder");
        },
        redo: () => {
          setPlacementEntries((prev) => {
            const next = [...prev];
            next[index] = nextEntry;
            return next;
          });
          useSceneDirtyStore.getState().markGlobalDirty("placementOrder");
        },
      });
    },
    [placementEntries],
  );

  const handleRemovePlacementFieldPair = useCallback(
    (index: number, fieldIndex: number) => {
      const previous = placementEntries[index];
      if (!previous) return;
      const valueIndex = fieldIndex + 1;
      const rawFields = previous.rawFields.filter((_, i) => i !== fieldIndex && i !== valueIndex);
      const nextEntry = syncParsedFieldsFromRaw({ ...previous, rawFields });
      setPlacementEntries((prev) => {
        const next = [...prev];
        next[index] = nextEntry;
        return next;
      });
      useSceneDirtyStore.getState().markGlobalDirty("placementOrder");
      useSceneEditorStore.getState().recordCommand({
        type: "remove-placement-field",
        description: "Remove placement field pair",
        undo: () => {
          setPlacementEntries((prev) => {
            const next = [...prev];
            next[index] = previous;
            return next;
          });
          useSceneDirtyStore.getState().markGlobalDirty("placementOrder");
        },
        redo: () => {
          setPlacementEntries((prev) => {
            const next = [...prev];
            next[index] = nextEntry;
            return next;
          });
          useSceneDirtyStore.getState().markGlobalDirty("placementOrder");
        },
      });
    },
    [placementEntries],
  );

  const handleAddTypedPlacement = useCallback(
    (vdkType: string) => {
      const newRow = createPlacementRowForType(vdkType);
      const insertAt = selectedPlacementIdx !== null ? selectedPlacementIdx + 1 : placementEntries.length;
      setPlacementEntries((prev) => {
        const next = [...prev];
        next.splice(insertAt, 0, newRow);
        return next;
      });
      setSelectedPlacementIdxRaw(insertAt);
      const nextEntries = [...placementEntries.slice(0, insertAt), newRow, ...placementEntries.slice(insertAt)];
      const insertedNodeId = resolveNodeIdForPlacementIndex(insertAt, nextEntries, subModels);
      setSelectedNodeIdRaw(insertedNodeId);
      if (insertedNodeId) useSceneEditorStore.getState().select(insertedNodeId);
      useSceneDirtyStore.getState().markGlobalDirty("placementOrder");
      useSceneEditorStore.getState().recordCommand({
        type: "add-typed-placement",
        description: `Add ${vdkType} placement`,
        undo: () => {
          setPlacementEntries((prev) => prev.filter((_, i) => i !== insertAt));
          handleClearSelection();
          useSceneDirtyStore.getState().markGlobalDirty("placementOrder");
        },
        redo: () => {
          setPlacementEntries((prev) => {
            const next = [...prev];
            next.splice(insertAt, 0, newRow);
            return next;
          });
          setSelectedPlacementIdxRaw(insertAt);
          useSceneDirtyStore.getState().markGlobalDirty("placementOrder");
        },
      });
    },
    [handleClearSelection, placementEntries, selectedPlacementIdx, subModels],
  );

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

  useEffect(() => {
    allNodeIdsRef.current = allNodeIds;
  }, [allNodeIds]);

  const handleFocusSelected = useCallback(() => {
    viewportRef.current?.focusSelected();
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
      created.forEach((c) => useSceneDirtyStore.getState().markObjectAdded(c.name));
      useSceneDirtyStore.getState().markGlobalDirty("placementOrder");
      handleSelectNode(created[0]?.id ?? null);
      useSceneEditorStore.getState().recordCommand({
        type: "paste-dae",
        description: "Paste imported DAE actor",
        undo: () => {
          setImportedDaeObjects((prev) => prev.filter((obj) => !created.some((c) => c.id === obj.id)));
          created.forEach((c) => useSceneDirtyStore.getState().resetObject(c.name));
          handleClearSelection();
          useSceneDirtyStore.getState().markGlobalDirty("placementOrder");
        },
        redo: () => {
          setImportedDaeObjects((prev) => [...prev, ...created]);
          created.forEach((c) => useSceneDirtyStore.getState().markObjectAdded(c.name));
          handleSelectNode(created[0]?.id ?? null);
          useSceneDirtyStore.getState().markGlobalDirty("placementOrder");
        },
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
      const insertedNodeId = resolveNodeIdForPlacementIndex(result.insertedStart, result.entries, subModels);
      setSelectedNodeIdRaw(insertedNodeId);
      if (insertedNodeId) useSceneEditorStore.getState().select(insertedNodeId);
      useSceneDirtyStore.getState().markGlobalDirty("placementOrder");
      useSceneEditorStore.getState().recordCommand({
        type: "paste-placement",
        description: "Paste placement rows",
        undo: () => {
          setPlacementEntries((prev) =>
            prev.filter((_, i) => i < result.insertedStart || i >= result.insertedStart + result.insertedRows.length),
          );
          handleClearSelection();
          useSceneDirtyStore.getState().markGlobalDirty("placementOrder");
        },
        redo: () => {
          setPlacementEntries((prev) => {
            const next = [...prev];
            next.splice(result.insertedStart, 0, ...result.insertedRows);
            return next;
          });
          setSelectedPlacementIdxRaw(result.insertedStart);
          setSelectedNodeIdRaw(insertedNodeId);
          if (insertedNodeId) useSceneEditorStore.getState().select(insertedNodeId);
          useSceneDirtyStore.getState().markGlobalDirty("placementOrder");
        },
      });
      toast.success(`Pasted ${result.insertedRows.length} placement row(s)`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to paste selection");
    }
  }, [handleClearSelection, handleSelectNode, importedDaeObjects, placementEntries, placementIndexForNodeId, selectedPlacementIdx, subModels]);

  const handleImportDae = useCallback(async () => {
    try {
      const results = await importDAEFiles(true);
      if (results.length === 0) return;
      let offsetX = 0;
      const SPACING = 2;
      const created: ImportedDaeObject[] = results.map((result, index) => {
        const posX = offsetX;
        offsetX += result.boundingSize.x + SPACING;
        return {
          id: `dae_${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${index}`,
          name: result.fileName.replace(/\.dae$/i, ""),
          sourcePath: result.filePath,
          scene: result.scene,
          transform: { ...DEFAULT_TRANSFORM, posX: posX },
        };
      });
      setImportedDaeObjects((prev) => [...prev, ...created]);
      created.forEach((c) => useSceneDirtyStore.getState().markObjectAdded(c.name));
      // Register each imported object as a scene asset
      created.forEach((c) => {
        useSceneAssetStore.getState().registerAsset(c.id, {
          sourceType: "imported-dae",
          sourcePath: c.sourcePath,
        });
      });
      useSceneDirtyStore.getState().markGlobalDirty("placementOrder");
      handleSelectNode(created[0]?.id ?? null);
      useSceneEditorStore.getState().recordCommand({
        type: "import-dae",
        description: "Import DAE object",
        undo: () => {
          setImportedDaeObjects((prev) => prev.filter((obj) => !created.some((c) => c.id === obj.id)));
          created.forEach((c) => useSceneDirtyStore.getState().resetObject(c.name));
          handleClearSelection();
          useSceneDirtyStore.getState().markGlobalDirty("placementOrder");
        },
        redo: () => {
          setImportedDaeObjects((prev) => [...prev, ...created]);
          created.forEach((c) => useSceneDirtyStore.getState().markObjectAdded(c.name));
          handleSelectNode(created[0]?.id ?? null);
          useSceneDirtyStore.getState().markGlobalDirty("placementOrder");
        },
      });
      toast.success(`Imported ${created.length} DAE object(s)`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to import DAE");
    }
  }, [handleClearSelection, handleSelectNode]);

  const handleImportDaeWithConfig = useCallback(async () => {
    const selected = await open({
      multiple: true,
      filters: [{ name: "Collada DAE", extensions: ["dae"] }],
      defaultPath: await getStoredDialogDefaultPath(SCENE_IMPORT_DAE_DIALOG_PATH_KEY),
    });
    if (!selected) return;
    const paths = Array.isArray(selected) ? selected : [selected];
    const lastPath = paths[paths.length - 1];
    if (lastPath) {
      await rememberStoredDialogSelection(SCENE_IMPORT_DAE_DIALOG_PATH_KEY, lastPath, "file");
    }

    const entries: DaeImportEntry[] = paths.map((filePath) => {
      const fileName = filePath.split(/[/\\]/).pop() ?? "model.dae";
      const baseName = sanitizeBaseFilename(fileName);
      return {
        importId: `dae_cfg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        fileName,
        filePath,
        analysis: null,
        config: createDefaultDaeImportConfig(baseName),
        analyzing: true,
        analyzeError: null,
      };
    });

    setDaeImportEntries(entries);
    setShowDaeImportModal(true);

    for (let i = 0; i < entries.length; i++) {
      try {
        const analysis = await invoke("ssbh_analyze_dae", { daePath: paths[i] });
        setDaeImportEntries((prev) =>
          prev.map((e, idx) =>
            idx === i ? { ...e, analysis: analysis as DaeImportEntry["analysis"], analyzing: false } : e,
          ),
        );
      } catch (err) {
        setDaeImportEntries((prev) =>
          prev.map((e, idx) =>
            idx === i
              ? { ...e, analyzing: false, analyzeError: String(err) }
              : e,
          ),
        );
      }
    }
  }, []);

  const processDirectSsbhConvert = useCallback(
    async (entries: DaeImportEntry[]) => {
      const sessionState = useDaeSsbhSessionStore.getState();

      let successCount = 0;
      let failCount = 0;
      for (const entry of entries) {
        try {
          const params = {
            daePath: entry.filePath,
            outputDir: sessionState.outputDir!,
            baseFilename: sessionState.outputBaseName.trim(),
            scaleFactor: Number(sessionState.scaleFactorText),
            flipUv: sessionState.flipUv,
            upAxis: sessionState.upAxis,
            includeGeometryNames: sessionState.includeGeometryNames,
            writeLog: sessionState.writeLog,
            writeNumdlb: sessionState.writeNumdlb,
            writeNumshb: sessionState.writeNumshb,
            writeNusktb: sessionState.writeNusktb,
            writeNumatb: sessionState.writeNumatb,
            writeMayaProfile: sessionState.writeMayaProfile,
            numdlbEntries: sessionState.numdlbEntries,
            mayaFile: sessionState.writeNumatb ? sessionState.mayaFile : null,
            nustFile: sessionState.writeNumatb ? sessionState.nustFile : null,
          };
          const result = await ssbhConvertDaeToSsbh(params);
          const lines = [
            result.files.numdlbPath ? `numdlb: ${result.files.numdlbPath}` : null,
            result.files.numshbPath ? `numshb: ${result.files.numshbPath}` : null,
            result.files.nusktbPath ? `nusktb: ${result.files.nusktbPath}` : null,
            result.files.numatbPath ? `numatb: ${result.files.numatbPath}` : null,
            result.files.mayaNumatbPath ? `maya numatb: ${result.files.mayaNumatbPath}` : null,
          ].filter(Boolean);
          toast.success(`Converted ${entry.fileName} to SSBH`, { description: lines.join("\n") });
          successCount++;
        } catch (err) {
          failCount++;
          toast.error(`Convert failed for ${entry.fileName}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      if (successCount > 0 && failCount === 0) {
        toast.success(`All ${successCount} file(s) converted successfully`);
      } else if (failCount > 0) {
        toast.warning(`Converted ${successCount}, failed ${failCount}`);
      }
    },
    [],
  );

  const handleExportSelectedDae = useCallback(() => {
    const objects = viewportRef.current?.getSelectedExportObjects() ?? [];
    if (objects.length === 0) {
      toast.error("Select one or more scene objects before exporting DAE");
      return;
    }

    const targets: DaeExportTarget[] = objects.map((entry) => {
      const safeName = entry.name.replace(/[\/\\:*?"<>|]/g, "_");
      const sub = subModels.find((s) => s.folderName === entry.name);
      if (sub) {
        return {
          nodeId: entry.name,
          name: safeName,
          rootPath: sub.bundle.rootFolder,
          type: "ssbh" as const,
        };
      }
      if (entry.name === "base" && baseModel) {
        return {
          nodeId: "base",
          name: safeName,
          rootPath: baseModel.rootFolder,
          type: "ssbh" as const,
        };
      }
      return {
        nodeId: entry.name,
        name: safeName,
        rootPath: null,
        type: "imported-dae" as const,
      };
    });

    setDaeExportDialog({ open: true, targets, threeObjects: objects });
  }, [baseModel, subModels]);

  const handleDaeExportConfirm = useCallback(async (config: DaeExportConfig) => {
    const { targets, threeObjects } = daeExportDialog;
    setDaeExportDialog((prev) => ({ ...prev, open: false }));

    try {
      const ssbhTargets = targets.filter((t) => t.type === "ssbh" && t.rootPath);
      const daeTargets = targets.filter((t) => t.type === "imported-dae");

      if (ssbhTargets.length === 1) {
        await exportSingleStageDae(ssbhTargets[0].rootPath!, {
          scaleFactor: config.scaleFactor,
          upAxis: config.upAxis,
          exportTextures: config.exportTextures,
        });
      } else if (ssbhTargets.length > 1) {
        const entries: BatchDaeExportEntry[] = ssbhTargets.map((t) => ({
          rootPath: t.rootPath!,
          outputName: t.name,
        }));
        await batchExportStageDae(entries, {
          scaleFactor: config.scaleFactor,
          upAxis: config.upAxis,
          exportTextures: config.exportTextures,
        });
      }

      if (daeTargets.length > 0) {
        const daeObjects: SceneExportObject[] = daeTargets
          .map((t) => {
            const found = threeObjects.find((o) => o.name === t.nodeId);
            return found ? { object: found.object, name: t.name } : null;
          })
          .filter((o): o is SceneExportObject => o !== null);
        if (daeObjects.length === 1) {
          await exportObjectAsDAE(daeObjects[0].object, daeObjects[0].name);
        } else if (daeObjects.length > 1) {
          await exportMultipleObjectsAsDAE(daeObjects);
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to export DAE");
    }
  }, [daeExportDialog]);

  const handleDeleteSelected = useCallback(
    (ids?: string[]) => {
      const requestedIds = getRequestedSceneNodeIds({
        explicitIds: ids,
        storeSelectedIds: useSceneEditorStore.getState().getSelectedIds(),
        selectedNodeId,
        selectedPlacementIdx,
        nodeIdForPlacementIndex,
      });

      if (hasLockedOrHiddenNode(requestedIds)) {
        toast.error("Locked or hidden scene objects cannot be deleted");
        return;
      }

      const daeIds = requestedIds.filter((id) => importedDaeObjects.some((obj) => obj.id === id));
      if (daeIds.length > 0) {
        const deleted = importedDaeObjects.filter((obj) => daeIds.includes(obj.id));
        setImportedDaeObjects((prev) => prev.filter((obj) => !daeIds.includes(obj.id)));
        // Remove asset configs
        daeIds.forEach((id) => useSceneAssetStore.getState().removeAsset(id));
        useSceneDirtyStore.getState().markGlobalDirty("placementOrder");
        handleClearSelection();
        useSceneEditorStore.getState().recordCommand({
          type: "delete-dae",
          description: "Delete imported DAE actor",
          undo: () => {
            setImportedDaeObjects((prev) => [...prev, ...deleted]);
            handleSelectNode(deleted[0]?.id ?? null);
            useSceneDirtyStore.getState().markGlobalDirty("placementOrder");
          },
          redo: () => {
            setImportedDaeObjects((prev) => prev.filter((obj) => !daeIds.includes(obj.id)));
            handleClearSelection();
            useSceneDirtyStore.getState().markGlobalDirty("placementOrder");
          },
        });
        toast.success(`Deleted ${deleted.length} DAE object(s)`);
        return;
      }

      const placementIndices = requestedIds
        .map(placementIndexForNodeId)
        .filter((value): value is number => value !== null);
      if (placementIndices.length === 0 && selectedPlacementIdx !== null) {
        placementIndices.push(selectedPlacementIdx);
      }
      if (placementIndices.length === 0) return;

      try {
        const result = placementIndices.length === 1
          ? (() => {
              const idx = placementIndices[0]!;
              const single = deletePlacementAt(placementEntries, idx);
              return {
                entries: single.entries,
                deleted: [{ index: idx, row: single.deleted }],
              };
          })()
          : deletePlacementsAt(placementEntries, placementIndices);
        setPlacementEntries(result.entries);
        handleClearSelection();
        useSceneDirtyStore.getState().markGlobalDirty("placementOrder");
        useSceneEditorStore.getState().recordCommand({
          type: "delete-placement",
          description: result.deleted.length === 1 ? "Delete placement row" : "Delete placement rows",
          undo: () => {
            setPlacementEntries((prev) => {
              const next = [...prev];
              for (const item of result.deleted) {
                next.splice(item.index, 0, item.row);
              }
              return next;
            });
            const firstDeleted = result.deleted[0]!;
            setSelectedPlacementIdxRaw(firstDeleted.index);
            const restoredNodeId = resolveNodeIdForPlacementIndex(firstDeleted.index, placementEntries, subModels);
            setSelectedNodeIdRaw(restoredNodeId);
            if (restoredNodeId) useSceneEditorStore.getState().select(restoredNodeId);
            useSceneDirtyStore.getState().markGlobalDirty("placementOrder");
          },
          redo: () => {
            const deleteSet = new Set(result.deleted.map((item) => item.index));
            setPlacementEntries((prev) => prev.filter((_, i) => !deleteSet.has(i)));
            handleClearSelection();
            useSceneDirtyStore.getState().markGlobalDirty("placementOrder");
          },
        });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to delete selection");
      }
    },
    [
      handleClearSelection,
      hasLockedOrHiddenNode,
      handleSelectNode,
      importedDaeObjects,
      nodeIdForPlacementIndex,
      placementEntries,
      placementIndexForNodeId,
      selectedNodeId,
      selectedPlacementIdx,
      subModels,
    ],
  );

  useSceneKeyboard({
    onDelete: handleDeleteSelected,
    onDuplicate: () => handleDuplicateSelected(),
    onPaste: handlePasteAsNew,
    onFocus: handleFocusSelected,
    onSelectAll: (ids) => {
      if (ids.length > 0) applyPrimarySelectionState(ids[ids.length - 1]);
    },
    onClearSelection: handleClearSelection,
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

  const hasSceneSelection = selectedNodeId !== null || editorSelectedIds.size > 0;
  const canExportSelectedDae =
    hasSceneSelection &&
    (editorSelectedIds.size > 0
      ? [...editorSelectedIds].some((id) => nodeVisibility[id] ?? true)
      : selectedNodeId !== null && (nodeVisibility[selectedNodeId] ?? true));

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
          onSaveFolder={handleSaveFolder}
          onSaveFhm2d={handleSaveFhm2d}
          onImportDae={handleImportDae}
          onImportDaeWithConfig={handleImportDaeWithConfig}
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
          gizmoSize={sceneEditGizmoSize}
          onGizmoSizeChange={handleGizmoSizeChange}
          animeRenderEnabled={sceneAnimeRenderEnabled}
          onToggleAnimeRender={setSceneAnimeRenderEnabled}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          hasCollisionData={havokMeshDataMap.size > 0}
          showAabb={showAabb}
          onToggleAabb={setShowAabb}
          showCollisionMesh={showCollisionMesh}
          onToggleCollisionMesh={setShowCollisionMesh}
        />

        <AlertDialog open={clearCacheDialogOpen} onOpenChange={setClearCacheDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Clear scene memory and caches?</AlertDialogTitle>
              <AlertDialogDescription>
                This unloads the current stage (including memory-import sessions), clears decoded RGBA texture caches and
                nutexb preview cache (IndexedDB + in-memory blobs). Unsaved CSV edits will be lost unless you saved to disk
                first.
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

        <AlertDialog open={resetDialogState.open} onOpenChange={(open) => { if (!open) setResetDialogState((prev) => ({ ...prev, open: false })); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{resetDialogState.title}</AlertDialogTitle>
              <AlertDialogDescription>{resetDialogState.description}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
              <AlertDialogAction
                type="button"
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => { setResetDialogState((prev) => ({ ...prev, open: false })); resetDialogState.onConfirm(); }}
              >
                Reset
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
                  onSelect={handleOutlinerSelectNode}
                  onDuplicate={handleDuplicateSelected}
                  onDelete={handleDeleteSelected}
                  onPaste={handlePasteAsNew}
                  onFocusSelected={handleFocusSelected}
                  onClearSelection={handleClearSelection}
                  onSelectAll={(ids) => {
                    if (ids.length > 0) applyPrimarySelectionState(ids[ids.length - 1]);
                  }}
                />
                {havokMeshDataMap.size > 0 && (
                  <MayaSection title="Collision" badge={havokMeshDataMap.size}>
                    <CollisionListPanel sourceIds={Array.from(havokMeshDataMap.keys())} />
                  </MayaSection>
                )}
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
              hasSelection={hasSceneSelection}
            >
            <div
              className="relative h-full min-h-0 min-w-0 overflow-hidden"
              onContextMenu={(e) => {
                if (!e.shiftKey) e.preventDefault();
              }}
            >
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
                onSelectNodes={handleSelectNodes}
                textureDataMap={textureDataMap}
                textureSlotLoadEnabled={textureSlotLoadEnabled}
                onDrawStatsChange={handleDrawStatsChange}
                graphicParams={appliedGraphicParams}
                baseTransform={baseTransform}
                onBaseTransformChange={commitBaseGizmoTransform}
                standaloneTransforms={standaloneTransforms}
                onStandaloneTransformChange={commitStandaloneGizmoTransform}
                onImportedDaeTransformFrame={updateImportedDaeTransform}
                onImportedDaeTransformChange={commitImportedDaeGizmoTransform}
                clickPickSelectionEnabled
                previewRenderStyle={scenePreviewRenderStyle}
                objectTextureLoadState={objectTextureLoadState}
                placementGizmoMode={placementGizmoMode}
                transformGizmoSize={sceneEditGizmoSize}
                onPlacementGizmoCommit={commitPlacementGizmo}
                viewMode={viewMode}
                havokMeshDataMap={havokMeshDataMap}
                showAabb={showAabb}
                showCollisionMesh={showCollisionMesh}
                collisionVisibility={collisionVisibility}
              />
              <SceneViewportOverlay isLoading={isLoading} modelLoadProgress={modelLoadProgress} textureProgress={textureProgress} />
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
            <ScenePropertiesPanel
              headerActions={
                <ResetIconButton
                  onClick={handleResetSession}
                  label="Reset all changes"
                  disabled={!initialSnapshotRef.current}
                />
              }
              inspectContent={
                <>
                  {selectedTransform && (
                    <MayaSection
                      title="Transform"
                      actions={
                        <ResetIconButton
                          onClick={handleResetTransform}
                          label="Reset transform"
                          disabled={!initialSnapshotRef.current}
                        />
                      }
                    >
                      {selectedNode && (
                        <p
                          className="mb-1.5 truncate text-[10px] text-muted-foreground"
                          title={selectedNode.label}
                        >
                          {selectedNode.label}
                        </p>
                      )}
                      <StagePropertyEditor
                        transform={selectedTransform}
                        onTransformChange={handleTransformChange}
                        placementEntry={
                          selectedPlacementIdx !== null
                            ? placementEntries[selectedPlacementIdx] ?? null
                            : null
                        }
                        placementHeader={placementHeader}
                        initialPlacementRawFields={
                          selectedPlacementIdx !== null
                            ? initialSnapshotRef.current?.placementEntries[selectedPlacementIdx]
                                ?.rawFields ?? null
                            : null
                        }
                        onPlacementFieldPreview={
                          selectedPlacementIdx !== null
                            ? (fieldIndex, value) =>
                                handlePlacementFieldPreview(selectedPlacementIdx, fieldIndex, value)
                            : undefined
                        }
                        onPlacementFieldCommit={
                          selectedPlacementIdx !== null
                            ? (fieldIndex, value) =>
                                handlePlacementFieldCommit(selectedPlacementIdx, fieldIndex, value)
                            : undefined
                        }
                        onAddPlacementField={
                          selectedPlacementIdx !== null
                            ? (key, value) =>
                                handleAddPlacementField(selectedPlacementIdx, key, value)
                            : undefined
                        }
                        onRemovePlacementField={
                          selectedPlacementIdx !== null
                            ? (keyIndex) =>
                                handleRemovePlacementFieldPair(selectedPlacementIdx, keyIndex)
                            : undefined
                        }
                        onResetPlacementField={
                          selectedPlacementIdx !== null
                            ? (fieldIndex) =>
                                handleResetPlacementField(selectedPlacementIdx, fieldIndex)
                            : undefined
                        }
                      />
                    </MayaSection>
                  )}

                  <MayaSection title="Scene">
                    <SceneInfoContent
                      stageName={stageName}
                      stageRoot={stageRoot}
                      selectedNode={selectedNode}
                      selectedPlacementIdx={selectedPlacementIdx}
                      placementEntry={
                        selectedPlacementIdx !== null
                          ? placementEntries[selectedPlacementIdx]
                          : null
                      }
                      subModelCount={subModels.length}
                      textureCount={textureDataMap.size}
                    />
                  </MayaSection>

                  {selectedPlacementIdx !== null && placementEntries[selectedPlacementIdx] && (
                    <MayaSection title="Object Config" defaultOpen>
                      <PlacementConfigPanel
                        entry={placementEntries[selectedPlacementIdx]}
                        initialEntry={
                          initialSnapshotRef.current?.placementEntries[selectedPlacementIdx] ?? null
                        }
                        placementHeader={placementHeader}
                        onFieldPreview={(fieldIndex, value) =>
                          handlePlacementFieldPreview(selectedPlacementIdx, fieldIndex, value)
                        }
                        onFieldCommit={(fieldIndex, value) =>
                          handlePlacementFieldCommit(selectedPlacementIdx, fieldIndex, value)
                        }
                        onAddField={(key, value) =>
                          handleAddPlacementField(selectedPlacementIdx, key, value)
                        }
                        onRemoveField={(keyIndex) =>
                          handleRemovePlacementFieldPair(selectedPlacementIdx, keyIndex)
                        }
                        onResetField={(fieldIndex) =>
                          handleResetPlacementField(selectedPlacementIdx, fieldIndex)
                        }
                      />
                    </MayaSection>
                  )}

                  {selectedNodeId && (
                    <MayaSection title="Asset Config" defaultOpen>
                      <SceneAssetConfigPanel assetId={selectedNodeId} />
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

                  <MayaSection
                    title="Loaded Nutexb"
                    badge={textureInventories.length || undefined}
                    defaultOpen={false}
                  >
                    <GlobalLoadedTexturePanel objects={textureInventories} />
                  </MayaSection>

                  <MayaSection title="Stats" defaultOpen={false}>
                    <SceneStatsContent
                      drawStats={drawStats}
                      subModelCount={subModels.length}
                      textureCount={textureDataMap.size}
                      stageName={stageName}
                    />
                  </MayaSection>
                </>
              }
              graphicContent={
                <MayaSection
                  title="Graphic Param"
                  badge={`${appliedGraphicParamKeys.size}/${graphicParams.length}`}
                  defaultOpen
                  actions={
                    <ResetIconButton
                      onClick={handleResetGraphicParams}
                      label="Reset all graphic params"
                      disabled={!initialSnapshotRef.current}
                    />
                  }
                >
                  <GraphicParamPanel
                    params={graphicParams}
                    initialParams={initialSnapshotRef.current?.graphicParams ?? null}
                    appliedKeys={appliedGraphicParamKeys}
                    onValueChange={handleGraphicParamValueChange}
                    onKeyChange={handleGraphicParamKeyChange}
                    onAdd={handleAddGraphicParam}
                    onDelete={handleDeleteGraphicParam}
                    onToggleApplied={handleToggleGraphicParamApplied}
                    onApplyAll={() =>
                      setAppliedGraphicParamKeys(new Set(graphicParams.map((p) => p.key)))
                    }
                    onClearApplied={() => setAppliedGraphicParamKeys(new Set())}
                    onResetValue={handleResetGraphicParamValue}
                  />
                </MayaSection>
              }
              placementContent={
                <MayaSection
                  title="Placement"
                  badge={placementEntries.length || undefined}
                  defaultOpen
                  actions={
                    <ResetIconButton
                      onClick={handleResetPlacement}
                      label="Reset all placements"
                      disabled={!initialSnapshotRef.current}
                    />
                  }
                >
                  <PlacementCsvEditorPanel
                    entries={placementEntries}
                    initialEntries={initialSnapshotRef.current?.placementEntries ?? null}
                    placementHeader={placementHeader}
                    selectedIndex={selectedPlacementIdx}
                    onSelectEntry={handleSelectPlacement}
                    onFieldPreview={handlePlacementFieldPreview}
                    onFieldCommit={handlePlacementFieldCommit}
                    onAddField={handleAddPlacementField}
                    onRemoveFieldPair={handleRemovePlacementFieldPair}
                    onAddTyped={handleAddTypedPlacement}
                    onDeleteRow={(index) => {
                      const nodeId = resolveNodeIdForPlacementIndex(
                        index,
                        placementEntries,
                        subModels,
                      );
                      handleDeleteSelected(nodeId ? [nodeId] : undefined);
                    }}
                    onResetRow={handleResetPlacementRow}
                    onResetField={handleResetPlacementField}
                  />
                </MayaSection>
              }
            />
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
        <DaeExportDialog
          open={daeExportDialog.open}
          targets={daeExportDialog.targets}
          onExport={handleDaeExportConfirm}
          onCancel={() => setDaeExportDialog((prev) => ({ ...prev, open: false }))}
        />
        <SaveProgressDialog
          open={saveProgressState.open}
          title={saveProgressState.title}
          steps={saveProgressState.steps}
          canClose={saveProgressState.canClose}
          completionSummary={saveProgressState.completionSummary}
          onClose={() => setSaveProgressState({ open: false, title: "", steps: [], canClose: false })}
        />
        <SaveConfirmDialog
          open={saveConfirmState.open}
          preview={saveConfirmState.preview}
          stageRoot={stageRoot}
          onConfirm={handleSaveConfirmAccept}
          onCancel={handleSaveConfirmCancel}
        />
        <DeleteConfirmDialog
          open={deleteConfirmState.open}
          preview={deleteConfirmState.preview}
          onConfirm={handleDeleteConfirmAccept}
          onCancel={handleDeleteConfirmCancel}
        />

        {showDaeImportModal && daeImportEntries.length > 0 && (
          <DaeImportConfigModal
            entries={daeImportEntries}
            havokInfo={havokInfo}
            onConfigChange={(importId, config) => {
              setDaeImportEntries((prev) =>
                prev.map((e) =>
                  e.importId === importId ? { ...e, config } : e,
                ),
              );
            }}
            onImport={async () => {
              setShowDaeImportModal(false);
              const entriesToProcess = [...daeImportEntries];
              setDaeImportEntries([]);

              const previewOnly = entriesToProcess.every(
                (entry) =>
                  entry.config.loadToScene &&
                  !entry.config.convertToSsbh &&
                  !entry.config.generateHkt,
              );

              if (previewOnly) {
                try {
                  let offsetX = 0;
                  const SPACING = 2;
                  const created: ImportedDaeObject[] = [];
                  for (const entry of entriesToProcess) {
                    const loaded = await loadDAEFromPath(entry.filePath);
                    const posX = offsetX;
                    offsetX += loaded.boundingSize.x + SPACING;
                    created.push({
                      id: `dae_${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${created.length}`,
                      name: loaded.fileName.replace(/\.dae$/i, ""),
                      sourcePath: loaded.filePath,
                      scene: loaded.scene,
                      transform: { ...DEFAULT_TRANSFORM, posX },
                    });
                  }
                  if (created.length === 0) return;
                  setImportedDaeObjects((prev) => [...prev, ...created]);
                  created.forEach((c) => useSceneDirtyStore.getState().markObjectAdded(c.name));
                  useSceneDirtyStore.getState().markGlobalDirty("placementOrder");
                  handleSelectNode(created[0]?.id ?? null);
                  toast.success(`Imported ${created.length} DAE object(s) to scene`);
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Failed to import DAE");
                }
                return;
              }

              if (!sceneSessionId) {
                const sid = await sceneSessionCreate({ type: "new" });
                setSceneSessionId(sid);
              }
              await processDirectSsbhConvert(entriesToProcess);
            }}
            onCancel={() => {
              setShowDaeImportModal(false);
              setDaeImportEntries([]);
            }}
          />
        )}
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
