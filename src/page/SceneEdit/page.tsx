import { useState, useCallback, useRef, useTransition, useEffect, useMemo } from "react";
import { useDefaultLayout } from "react-resizable-panels";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import * as THREE from "three";
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
import type { StageTreeNode } from "./components/StageHierarchyTree";
import { SceneOutliner } from "./components/SceneOutliner";
import { GlobalLoadedTexturePanel, ModelTextureSlotPanel } from "./components/ModelTextureSlotPanel";
import { SceneTextureManager } from "./components/SceneTextureManager";
import { StructureInspectorPanel } from "./components/StructureInspectorPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ViewportContextMenu } from "./components/ViewportContextMenu";
import { useSceneKeyboard } from "./hooks/useSceneKeyboard";
import { useSceneDetailView } from "./hooks/useSceneDetailView";
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
import { disposeFhm2dMemorySession } from "@/components/ssbh-model-preview/fhm2dMemoryPreviewService";
import { useDaeSsbhSessionStore } from "@/components/ssbh-model-preview/store/daeSsbhSessionStore";
import {
  clearNutexbPreviewCacheAsync,
  clearNutexbRgbaCache,
} from "@/components/ssbh-model-preview/nutexbPreviewCache";
import { clearSceneTextureThumbnailCache } from "./utils/sceneTextureThumbnail";
import type { SceneTextureDecodeContext } from "./utils/sceneTextureDecode";
import { reorderPlacementEntriesBySubModels } from "./utils/reorderPlacementBySubModels";
import { MayaSection } from "./components/MayaSection";
import {
  createDefaultTextureSlotLoadEnabled,
  createUniformTextureSlotLoadEnabled,
  type TexturePreviewSlotKey,
} from "@/components/ssbh-model-preview/meshFromSsbh";
import {
  exportObjectsAsDAEToDirectory,
  exportObjectsAsFBXToDirectory,
  exportStageDaeBatchToDirectory,
  importDAEFiles,
  loadStaticMeshFromPath,
  type BatchDaeExportEntry,
} from "./utils/daeExportImport";
import { buildDaeExportDialogState } from "./utils/daeExportDialogState";
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
import {
  collectSceneTextureManagerEntries,
  listStageTextureFilePaths,
} from "./utils/sceneTextureManagerEntries";
import { useConfigStore } from "@/store/configStore";
import {
  DEFAULT_SCENE_GIZMO_SIZE,
  normalizeSceneGizmoSize,
  SCENE_EXTRACT_FHM2D_OUTPUT_DIALOG_PATH_KEY,
  SCENE_EXTRACT_FHM2D_SOURCE_DIALOG_PATH_KEY,
  SCENE_IMPORT_DAE_CONFIG_DIALOG_PATH_KEY,
  SCENE_IMPORT_FHM2D_DIALOG_PATH_KEY,
  SCENE_OPEN_FOLDER_DIALOG_PATH_KEY,
  SCENE_SAVE_FHM2D_DIALOG_PATH_KEY,
} from "./utils/sceneEditorSettings";
import { useSceneDirtyStore } from "./store/sceneDirtyStore";
import { useSceneTextureManagerStore } from "./store/sceneTextureManagerStore";
import { executeSaveFolderPipeline } from "./utils/sceneSaveFolderPipeline";
import { executeSaveFhm2dPipeline } from "./utils/sceneSaveFhm2dPipeline";
import { SaveProgressDialog, type SaveStepInfo } from "./components/SaveProgressDialog";
import { SaveConfirmDialog } from "./components/SaveConfirmDialog";
import { DeleteConfirmDialog, type DeleteConfirmMeta } from "./components/DeleteConfirmDialog";
import type { DeleteConfirmation } from "./utils/sceneDeleteConfirm";
import { buildDeletePreview, buildBaseDeletePreview } from "./utils/sceneDeleteConfirm";
import { collectHavokSourceIdsForFolders } from "./utils/havokOverlayCleanup";
import {
  buildSaveChangePreview,
  buildSaveResultSummary,
  type SaveChangePreview,
} from "./utils/sceneSaveConfirm";
import { DaeImportConfigModal } from "./components/dae-import/DaeImportConfigModal";
import type { DaeImportEntry, HavokInstallInfo } from "./components/dae-import/daeImportTypes";
import {
  createDefaultDaeImportConfig,
  detectStaticMeshImportFormat,
  sanitizeBaseFilename,
  syncDaeImportConfigUpAxisFromAnalysis,
} from "./components/dae-import/daeImportDefaults";
import { SceneAssetConfigPanel } from "./components/SceneAssetConfigPanel";
import { useSceneAssetStore } from "./store/sceneAssetStore";
import type { HavokMeshData } from "@/utils/havokXmlParser";
import { parseHavokXML } from "@/utils/havokXmlParser";
import { CollisionListPanel } from "./components/havok/CollisionListPanel";
import { HavokCollisionEditorPanel } from "./components/havok/HavokCollisionEditorPanel";
import { GenerateHktFromModelDialog } from "./components/havok/GenerateHktFromModelDialog";
import type { HktSimplifyConfig } from "./components/dae-import/daeImportTypes";
import { DEFAULT_HKT_SIMPLIFY } from "./utils/hktSimplifyUtils";
import {
  sceneSessionCreate,
  sceneSessionDestroy,
  sceneSaveAsFolder,
  sceneRepackInPlace,
  sceneOpenFolder,
  sceneListHavokMeta,
  sceneConfigureImport,
  sceneGenerateHkt,
  sceneGenerateHktFromMesh,
  sceneGetHavokMeta,
  sceneGetImportConfig,
  sceneReplaceHkt,
  sceneRemoveImport,
  sceneRemoveHavokData,
  sceneForgetModel,
  sceneForgetBaseModel,
  sceneBuildImportPreviewBundle,
  sceneConvertStaticMeshToStageFilesWithProgress,
  stageLoadSkeleton,
  stageStreamBundles,
  validateNumatbEmptyParams,
  type StageSkeleton,
  type StageStreamChunk,
  type ExvsStageValidationError,
  type StaticMeshImportProgress,
} from "./utils/sceneSessionService";
import { useSceneValidationStore } from "./store/sceneValidationStore";
import { buildErrorFolderCounts } from "./utils/sceneValidationErrors";
import { StageValidationErrorDialog } from "./components/StageValidationErrorDialog";
import {
  buildSsbhSessionImportConfig,
  ensureImportedDaeSessionImport,
  importDaeThroughSceneSession,
} from "./utils/sceneDaeSessionImport";
import { applyOutlinerOrder } from "./utils/sceneOutlinerOrder";
import { buildSubModelOutlinerNode } from "./utils/sceneOutlinerTree";
import { SceneDetailViewHost } from "./components/detail-view/SceneDetailViewHost";

import type { PreviewRenderStyle } from "@/components/ssbh-model-preview/SsbhModelPreviewContext";

import type { SsbhModelPreviewBundle } from "@/components/ssbh-model-preview/types";

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

type ImportProgressUpdate = {
  step: string;
  label: string;
  progress: number;
  detail?: string;
  tone?: ImportStep["tone"];
};

function formatImportBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"] as const;
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function createStaticMeshImportSteps(fileName: string, directToDisk: boolean): ImportStep[] {
  const steps: ImportStep[] = [
    { step: "read", label: `Preparing ${fileName}...`, status: "active" },
    { step: "check", label: "Checking file size and IPC path...", status: "pending" },
    { step: "convert", label: "Waiting for Rust SSBH conversion...", status: "pending" },
    { step: "artifacts", label: "Preparing converted SSBH artifacts...", status: "pending" },
  ];
  if (directToDisk) {
    steps.push({ step: "write", label: "Writing converted files to disk...", status: "pending" });
    steps.push({ step: "hkt", label: "Generating HKT collision...", status: "pending" });
  } else {
    steps.push({ step: "hkt", label: "Generating HKT collision...", status: "pending" });
    steps.push({ step: "preview", label: "Building viewport preview...", status: "pending" });
  }
  steps.push({ step: "done", label: "Completing static mesh import...", status: "pending" });
  return steps;
}

function staticMeshPhaseToStep(phase: string): string {
  switch (phase) {
    case "read":
      return "read";
    case "collisionCheck":
      return "hkt";
    case "artifacts":
      return "artifacts";
    default:
      return "check";
  }
}

function mapStaticMeshProgress(chunk: StaticMeshImportProgress): ImportProgressUpdate {
  switch (chunk.kind) {
    case "status":
      return {
        step: staticMeshPhaseToStep(chunk.phase),
        label: chunk.label,
        progress: chunk.phase === "artifacts" ? 68 : chunk.phase === "collisionCheck" ? 22 : 8,
      };
    case "sourceFile":
      return {
        step: "check",
        label: `Checked ${chunk.format} source size`,
        detail: `${formatImportBytes(chunk.bytes)} - ${chunk.path}`,
        progress: 12,
      };
    case "ipcWarning":
      return {
        step: "check",
        label: "Large file / IPC payload warning",
        detail: `${chunk.message} (${formatImportBytes(chunk.bytes)})`,
        progress: 14,
        tone: "warning",
      };
    case "convertStarted":
      return {
        step: "convert",
        label: `Converting ${chunk.format} to SSBH in Rust...`,
        detail: `${chunk.sourceName} -> ${chunk.baseFilename}`,
        progress: 35,
      };
    case "convertFinished":
      return {
        step: "artifacts",
        label: "SSBH conversion finished",
        detail: `${chunk.fileCount} artifact(s), ${formatImportBytes(chunk.totalBytes)}`,
        progress: 66,
      };
    case "writeStarted":
      return {
        step: "write",
        label: "Writing converted files directly to disk...",
        detail: `${chunk.outputDir}\\${chunk.baseFilename}`,
        progress: 72,
      };
    case "writeFinished":
      return {
        step: "write",
        label: "Converted files written",
        detail: `${chunk.fileCount} file(s) written`,
        progress: 82,
      };
    case "hktStarted":
      return {
        step: "hkt",
        label: "Generating HKT collision in Rust...",
        detail: chunk.sourceName,
        progress: 86,
      };
    case "hktFinished":
      return {
        step: "hkt",
        label: "HKT collision generated",
        detail: `${formatImportBytes(chunk.bytes)}, ${chunk.triangleCount} triangles`,
        progress: 94,
      };
    case "complete":
      return {
        step: "artifacts",
        label: "Rust conversion command completed",
        progress: 90,
      };
    case "error":
      return {
        step: "convert",
        label: "Static mesh conversion failed",
        detail: chunk.message,
        progress: 100,
        tone: "warning",
      };
  }
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

const SCENE_HIERARCHY_TABS_LIST =
  "shrink-0 grid h-8 w-full grid-cols-3 gap-0 rounded-none border-b bg-muted/30 p-0";
const SCENE_HIERARCHY_TAB_TRIGGER =
  "h-8 rounded-none border-b-2 border-transparent px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground data-[state=active]:border-primary data-[state=active]:bg-background data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:shadow-none";

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
    (s) =>
      Object.keys(s.objects).length > 0 ||
      s.global.graphicParams ||
      s.global.placementOrder ||
      s.global.textures,
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
    meta?: DeleteConfirmMeta;
    resolve: ((confirmed: boolean) => void) | null;
  }>({ open: false, preview: null, resolve: null });
  const [validationDialog, setValidationDialog] = useState<{
    open: boolean;
    title: string;
    errors: ExvsStageValidationError[];
  }>({ open: false, title: "", errors: [] });

  const [baseModel, setBaseModel] = useState<SsbhModelPreviewBundle | null>(
    null
  );
  const [subModels, setSubModels] = useState<
    StageBundleResponse["subModels"]
  >([]);
  const [importedDaeObjects, setImportedDaeObjects] = useState<ImportedDaeObject[]>([]);
  const importedSsbhBundles = useMemo(
    () => importedDaeObjects.map((obj) => obj.ssbhBundle).filter(Boolean) as SsbhModelPreviewBundle[],
    [importedDaeObjects],
  );

  const {
    sessions: detailViewSessions,
    openSession: openDetailViewSession,
    closeSession: closeDetailViewSession,
    activateSession: activateDetailViewSession,
    setActiveTab: setDetailViewActiveTab,
    setNumdlbDraft: setDetailViewNumdlbDraft,
    saveNumdlb: saveDetailViewNumdlb,
    setNumatbDraft: setDetailViewNumatbDraft,
    saveNumatb: saveDetailViewNumatb,
    setNuhlpbDraft: setDetailViewNuhlpbDraft,
    saveNuhlpb: saveDetailViewNuhlpb,
  } = useSceneDetailView({ baseModel, subModels, importedDaeObjects });
  const [graphicParams, setGraphicParams] = useState<GraphicParam[]>([]);
  const [appliedGraphicParamKeys, setAppliedGraphicParamKeys] = useState<Set<string>>(() => new Set());
  const [placementHeader, setPlacementHeader] = useState<string[]>([]);
  const [placementColMap, setPlacementColMap] = useState<
    Record<string, number>
  >({});
  const [placementEntries, setPlacementEntries] = useState<PlacementRow[]>([]);
  const [treeRoot, setTreeRoot] = useState<StageTreeNode | null>(null);

  const initialSnapshotRef = useRef<{
    graphicParams: GraphicParam[];
    placementEntries: PlacementRow[];
  } | null>(null);

  // Merge disk-loaded subModels with imported DAE objects so the placement panel
  // can reference newly imported models before saving to disk.
  const effectiveSubModels = useMemo(() => {
    if (importedDaeObjects.length === 0) return subModels;
    const existing = new Set(subModels.map((s) => s.folderName));
    const nextIndex = subModels.length;
    const extras = importedDaeObjects
      .filter((obj) => !existing.has(obj.name))
      .map((obj, i) => ({
        folderName: obj.name,
        objectIndex: nextIndex + i,
      }));
    return extras.length > 0 ? [...subModels, ...extras] : subModels;
  }, [subModels, importedDaeObjects]);

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

  const [genHktFromModel, setGenHktFromModel] = useState<{
    open: boolean;
    targetImportId: string | null;
    targetName: string;
  }>({ open: false, targetImportId: null, targetName: "" });

  const [daeImportEntries, setDaeImportEntries] = useState<DaeImportEntry[]>([]);
  const [showDaeImportModal, setShowDaeImportModal] = useState(false);
  const [havokInfo, setHavokInfo] = useState<HavokInstallInfo | null>(null);
  const [havokMeshDataMap, setHavokMeshDataMap] = useState(() => new Map<string, HavokMeshData>());
  const [havokMetaMap, setHavokMetaMap] = useState(() => new Map<string, { displayName: string; objectNodeId: string | null }>());
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

  const staticMeshProgressActiveRef = useRef(false);

  const applyStaticMeshProgressUpdate = useCallback((update: ImportProgressUpdate) => {
    setImportProgress((prev) => {
      const hasStep = prev.steps.some((step) => step.step === update.step);
      const steps = hasStep
        ? prev.steps
        : [
            ...prev.steps,
            {
              step: update.step,
              label: update.label,
              status: "pending" as const,
            },
          ];
      return {
        open: true,
        progress: update.progress,
        steps: steps.map((step): ImportStep => {
          if (step.step === update.step) {
            return {
              ...step,
              label: update.label,
              detail: update.detail,
              tone: update.tone ?? "default",
              status: update.step === "done" ? "done" : "active",
            };
          }
          if (step.status === "active") {
            return { ...step, status: "done" };
          }
          return step;
        }),
      };
    });
  }, []);

  const handleStaticMeshProgress = useCallback(
    (chunk: StaticMeshImportProgress) => {
      if (!staticMeshProgressActiveRef.current) {
        return;
      }
      const update = mapStaticMeshProgress(chunk);
      applyStaticMeshProgressUpdate(update);
      if (chunk.kind === "ipcWarning") {
        toast.warning("Large static mesh import", { description: chunk.message });
      }
    },
    [applyStaticMeshProgressUpdate],
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
  const sceneTextureSourceKind =
    baseModel?.sourceKind ?? subModels[0]?.bundle.sourceKind ?? "disk";

  const sceneTextureDecodeContext = useMemo<SceneTextureDecodeContext>(
    () => ({
      sessionId,
      sourceKind: sceneTextureSourceKind,
      maxDimension: textureMaxDimension,
    }),
    [sessionId, sceneTextureSourceKind, textureMaxDimension],
  );

  const {
    textureDataMap,
    progress: textureProgress,
    warnings: textureWarnings,
  } = useSceneTextureLoader(
    baseModel,
    subModels,
    importedSsbhBundles,
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
          sessionImportId: undefined,
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
    async (path: string, bundle: StageBundleResponse, options: { showToast?: boolean } = {}) => {
      let sharedTexturePaths: string[] = [];
      try {
        sharedTexturePaths = await listStageTextureFilePaths(path);
      } catch (error) {
        console.warn("[SceneEdit] Failed to list shared stage textures:", error);
      }
      const texEntries = collectSceneTextureManagerEntries(
        bundle.baseModel,
        bundle.subModels,
        sharedTexturePaths,
      );

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
        // Show both referenced textures and extra files already present in textures/.
        useSceneTextureManagerStore.getState().setEntries(texEntries);
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
    async (path: string, skeleton: StageSkeleton) => {
      let sharedTexturePaths: string[] = [];
      try {
        sharedTexturePaths = await listStageTextureFilePaths(path);
      } catch (error) {
        console.warn("[SceneEdit] Failed to list shared stage textures:", error);
      }

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
        useSceneTextureManagerStore.getState().setEntries(
          collectSceneTextureManagerEntries(null, [], sharedTexturePaths),
        );
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
    useSceneTextureManagerStore.getState().clear();
    setRenamePreview(null);
    setImportProgress((prev) => ({ ...prev, open: false }));
    setHavokMeshDataMap(new Map());
  }, [sessionId, sceneSessionId]);

  const handleConfirmClearCache = useCallback(async () => {
    setClearCacheDialogOpen(false);
    resetState();
    viewportRef.current?.disposeTextures();
    clearNutexbRgbaCache();
    clearSceneTextureThumbnailCache();
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
        defaultPath: await getStoredDialogDefaultPath(SCENE_OPEN_FOLDER_DIALOG_PATH_KEY),
      });
      if (!selected || typeof selected !== "string") return;
      await rememberStoredDialogSelection(SCENE_OPEN_FOLDER_DIALOG_PATH_KEY, selected, "directory");

      const stageRoot = `${selected}\\0\\0`;

      setIsLoading(true);
      resetState();

      const bundle = await invoke<StageBundleResponse>("load_stage_bundle", {
        stageRoot,
      });
      await applyBundle(stageRoot, bundle);

      sceneOpenFolder(stageRoot).then(async (result) => {
        setSceneSessionId(result.sessionId);
        try {
          const havokList = await sceneListHavokMeta(result.sessionId);
          if (havokList.length > 0) {
            const map = new Map<string, HavokMeshData>();
            const meta = new Map<string, { displayName: string; objectNodeId: string | null }>();
            for (const item of havokList) {
              try {
                const meshData = parseHavokXML(item.hktXml);
                map.set(item.sourceId, meshData);
                meta.set(item.sourceId, { displayName: item.displayName, objectNodeId: item.objectNodeId });
              } catch {
                // skip unparseable collision mesh
              }
            }
            setHavokMeshDataMap(map);
            setHavokMetaMap(meta);
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
        defaultPath: await getStoredDialogDefaultPath(SCENE_IMPORT_FHM2D_DIALOG_PATH_KEY),
      });
      if (!selected || typeof selected !== "string") return;
      await rememberStoredDialogSelection(SCENE_IMPORT_FHM2D_DIALOG_PATH_KEY, selected, "file");

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
        defaultPath: await getStoredDialogDefaultPath(SCENE_EXTRACT_FHM2D_SOURCE_DIALOG_PATH_KEY),
      });
      if (!sourcePath || typeof sourcePath !== "string") return;
      await rememberStoredDialogSelection(SCENE_EXTRACT_FHM2D_SOURCE_DIALOG_PATH_KEY, sourcePath, "file");

      const outputDir = await open({
        directory: true,
        title: "Select output folder",
        defaultPath: await getStoredDialogDefaultPath(SCENE_EXTRACT_FHM2D_OUTPUT_DIALOG_PATH_KEY),
      });
      if (!outputDir || typeof outputDir !== "string") return;
      await rememberStoredDialogSelection(SCENE_EXTRACT_FHM2D_OUTPUT_DIALOG_PATH_KEY, outputDir, "directory");

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
      await applyBundle("memory://stage", result.bundle);

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

  // Deletion is confirmed once at delete time (the disk-file preview is shown
  // there). The save pipeline must not prompt a second delete-confirm, so its
  // delete gate is auto-approved — the save-change summary remains the save gate.
  const autoApproveSaveDelete = useCallback(() => Promise.resolve(true), []);

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

  const surfaceValidationErrors = useCallback(
    (errors: ExvsStageValidationError[], title: string) => {
      const knownFolders = [...subModels.map((s) => s.folderName), "base"];
      const errorFolders = buildErrorFolderCounts(errors, knownFolders);
      useSceneValidationStore.getState().setErrors(errors, errorFolders);
      setValidationDialog({ open: true, title, errors });
      const objectCount = Object.keys(errorFolders).length;
      toast.error(
        `${errors.length} texture issue${errors.length !== 1 ? "s" : ""}${
          objectCount ? ` on ${objectCount} object${objectCount !== 1 ? "s" : ""}` : ""
        } blocked packing`,
      );
    },
    [subModels],
  );

  const runNumatbPreflight = useCallback(
    async (root: string): Promise<boolean> => {
      try {
        const result = await validateNumatbEmptyParams(root);
        if (result.valid) {
          useSceneValidationStore.getState().clear();
          return true;
        }
        surfaceValidationErrors(result.errors, "Empty texture paths block packing");
        return false;
      } catch (err) {
        toast.error("Texture validation failed", { description: String(err) });
        return false;
      }
    },
    [surfaceValidationErrors],
  );

  const handleSaveFolder = useCallback(async () => {
    if (!stageRoot) return;

    const dirtyStore = useSceneDirtyStore.getState();
    const changePreview = buildSaveChangePreview(dirtyStore);
    if (changePreview.hasChanges) {
      const confirmed = await promptSaveConfirm(changePreview);
      if (!confirmed) return;
    }

    if (!(await runNumatbPreflight(stageRoot))) return;

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
        subModels,
        importedDaeObjects,
        sceneSessionId,
        onProgress: updateSaveProgress,
        onDeleteConfirm: autoApproveSaveDelete,
      });

      if (!result.success) {
        setSaveProgressState((prev) => ({ ...prev, canClose: true }));
        return;
      }

      if (result.hasStructuralChanges && result.reloadedBundle) {
        await applyBundle(stageRoot, result.reloadedBundle as any, { showToast: false });
      } else if (!result.hasStructuralChanges) {
        // Non-structural save: in-memory state is already correct, just update baseline snapshot
        initialSnapshotRef.current = {
          graphicParams: graphicParams.map((p) => ({ ...p })),
          placementEntries: placementEntries.map((e) => ({ ...e, rawFields: [...e.rawFields] })),
        };
      }

      if (result.convertedDaeObjectIds.length > 0) {
        const convertedIds = new Set(result.convertedDaeObjectIds);
        setImportedDaeObjects((prev) => prev.filter((obj) => !convertedIds.has(obj.id)));
      }

      useSceneDirtyStore.getState().reset();
      useSceneTextureManagerStore.getState().markTexturesSaved();
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
  }, [stageRoot, graphicParams, placementHeader, placementEntries, subModels, importedDaeObjects, sceneSessionId, applyBundle, updateSaveProgress, autoApproveSaveDelete, promptSaveConfirm, runNumatbPreflight, surfaceValidationErrors]);

  const handleSaveFhm2d = useCallback(async () => {
    if (!stageRoot) return;

    const dirtyStore = useSceneDirtyStore.getState();
    const changePreview = buildSaveChangePreview(dirtyStore);
    if (changePreview.hasChanges) {
      const confirmed = await promptSaveConfirm(changePreview);
      if (!confirmed) return;
    }

    if (!(await runNumatbPreflight(stageRoot))) return;

    const outputPath = await save({
      filters: [{ name: "FHM2D File", extensions: ["fhm2d"] }],
      defaultPath: await getStoredDialogDefaultPath(SCENE_SAVE_FHM2D_DIALOG_PATH_KEY),
    });
    if (!outputPath) return;
    await rememberStoredDialogSelection(SCENE_SAVE_FHM2D_DIALOG_PATH_KEY, outputPath, "file");

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
        subModels,
        importedDaeObjects,
        sceneSessionId,
        outputFhm2dPath: outputPath,
        onProgress: updateSaveProgress,
        onDeleteConfirm: autoApproveSaveDelete,
      });

      if (!result.success) {
        setSaveProgressState((prev) => ({ ...prev, canClose: true }));
        if (result.validationErrors && result.validationErrors.length > 0) {
          surfaceValidationErrors(result.validationErrors, "Missing textures block packing");
        }
        return;
      }

      if (result.hasStructuralChanges && result.reloadedBundle) {
        await applyBundle(stageRoot, result.reloadedBundle as any, { showToast: false });
      } else if (!result.hasStructuralChanges) {
        initialSnapshotRef.current = {
          graphicParams: graphicParams.map((p) => ({ ...p })),
          placementEntries: placementEntries.map((e) => ({ ...e, rawFields: [...e.rawFields] })),
        };
      }

      if (result.convertedDaeObjectIds.length > 0) {
        const convertedIds = new Set(result.convertedDaeObjectIds);
        setImportedDaeObjects((prev) => prev.filter((obj) => !convertedIds.has(obj.id)));
      }

      useSceneDirtyStore.getState().reset();
      useSceneTextureManagerStore.getState().markTexturesSaved();
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
  }, [stageRoot, graphicParams, placementHeader, placementEntries, subModels, importedDaeObjects, sceneSessionId, applyBundle, updateSaveProgress, autoApproveSaveDelete, promptSaveConfirm, runNumatbPreflight, surfaceValidationErrors]);

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
      useSceneTextureManagerStore.getState().markTexturesSaved();
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
    clearSceneTextureThumbnailCache();
  }, []);

  const handleTextureSlotMode = useCallback((mode: "all" | "none") => {
    clearNutexbRgbaCache();
    clearSceneTextureThumbnailCache();
    setTextureSlotLoadEnabled(
      mode === "all"
        ? createDefaultTextureSlotLoadEnabled()
        : createUniformTextureSlotLoadEnabled(false),
    );
  }, []);

  const handleTextureSlotToggle = useCallback(
    (key: TexturePreviewSlotKey, enabled: boolean) => {
      clearNutexbRgbaCache();
      clearSceneTextureThumbnailCache();
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

  const outlinerChildren = useMemo((): StageTreeNode[] => {
    if (!treeRoot) {
      const nodes: StageTreeNode[] = importedDaeObjects.map((obj) => ({
        id: obj.id,
        label: obj.name,
        role: "imported_dae" as const,
      }));

      if (havokMetaMap.size > 0) {
        const colChildren: StageTreeNode[] = [];
        for (const [sourceId, meta] of havokMetaMap) {
          colChildren.push({
            id: `__col__${sourceId}`,
            label: meta.objectNodeId ? `${meta.objectNodeId}/${meta.displayName}` : meta.displayName,
            role: "collision",
          });
        }
        nodes.push({
          id: "__collision_group__",
          label: `Collision (${colChildren.length})`,
          role: "collision",
          children: colChildren,
        });
      }

      return nodes;
    }

    const children: StageTreeNode[] = [];
    if (treeRoot.children) {
      for (const child of treeRoot.children) {
        if (child.role === "base") {
          children.push(child);
          continue;
        }
        if (child.role === "sub_model" && child.objectIndex != null) {
          children.push(buildSubModelOutlinerNode(child, placementEntries));
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

    if (havokMetaMap.size > 0) {
      const colChildren: StageTreeNode[] = [];
      for (const [sourceId, meta] of havokMetaMap) {
        const prefix = meta.objectNodeId ? `${meta.objectNodeId}/` : "";
        colChildren.push({
          id: `__col__${sourceId}`,
          label: `${prefix}${meta.displayName}`,
          role: "collision",
        });
      }
      children.push({
        id: "__collision_group__",
        label: `Collision (${colChildren.length})`,
        role: "collision",
        children: colChildren,
      });
    }

    return children;
  }, [treeRoot, placementEntries, importedDaeObjects, havokMetaMap]);

  const outlinerOrder = useSceneEditorStore((state) => state.outlinerOrder);

  useEffect(() => {
    if (outlinerChildren.length === 0) return;
    useSceneEditorStore.getState().syncOutlinerOrder(outlinerChildren.map((child) => child.id));
  }, [outlinerChildren]);

  const outlinerRoot = useMemo((): StageTreeNode | null => {
    if (!treeRoot && outlinerChildren.length === 0) return null;
    const children = applyOutlinerOrder(outlinerChildren, outlinerOrder);
    if (!treeRoot) {
      return {
        id: "root",
        label: "Scene",
        role: "root",
        children,
      };
    }
    return { ...treeRoot, children };
  }, [treeRoot, outlinerChildren, outlinerOrder]);

  const handleOpenProperties = useCallback(
    (nodeId: string) => {
      const node = findNode(outlinerRoot, nodeId);
      if (!node) {
        toast.error("Cannot find outliner node");
        return;
      }
      openDetailViewSession(node);
    },
    [outlinerRoot, openDetailViewSession],
  );

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
        sessionImportId: undefined,
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
    const selected = await open({
      multiple: true,
      filters: [{ name: "Static Mesh", extensions: ["dae", "fbx"] }],
      defaultPath: await getStoredDialogDefaultPath(SCENE_IMPORT_DAE_CONFIG_DIALOG_PATH_KEY),
    });
    if (!selected) return;
    const paths = Array.isArray(selected) ? selected : [selected];
    const lastPath = paths[paths.length - 1];
    if (lastPath) {
      await rememberStoredDialogSelection(SCENE_IMPORT_DAE_CONFIG_DIALOG_PATH_KEY, lastPath, "file");
    }

    const entries: DaeImportEntry[] = paths.map((filePath) => {
      const fileName = filePath.split(/[/\\]/).pop() ?? "model.dae";
      const baseName = sanitizeBaseFilename(fileName);
      const sourceFormat = detectStaticMeshImportFormat(fileName);
      const config = createDefaultDaeImportConfig(baseName);
      config.outputDirectory = stageRoot;
      return {
        importId: `dae_cfg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        fileName,
        filePath,
        sourceFormat,
        analysis: null,
        config,
        analyzing: true,
        analyzeError: null,
      };
    });

    setDaeImportEntries(entries);
    setShowDaeImportModal(true);

    for (let i = 0; i < entries.length; i++) {
      try {
        const analysis =
          entries[i].sourceFormat === "fbx"
            ? await invoke("ssbh_analyze_fbx", { fbxPath: paths[i] })
            : await invoke("ssbh_analyze_dae", { daePath: paths[i] });
        const typedAnalysis = analysis as DaeImportEntry["analysis"];
        setDaeImportEntries((prev) =>
          prev.map((e, idx) =>
            idx === i && typedAnalysis
              ? {
                  ...e,
                  analysis: typedAnalysis,
                  config: syncDaeImportConfigUpAxisFromAnalysis(e.config, typedAnalysis),
                  analyzing: false,
                }
              : e,
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
  }, [stageRoot]);

  const processSsbhSessionImport = useCallback(
    async (entries: DaeImportEntry[]) => {
      const sessionState = useDaeSsbhSessionStore.getState();
      const directEntries = entries.filter((entry) => entry.config.directToDisk);
      const previewEntries = entries.filter((entry) => !entry.config.directToDisk);

      for (const entry of directEntries) {
        try {
          if (!entry.config.outputDirectory) {
            throw new Error("Choose an output directory before converting out-of-scene");
          }
          staticMeshProgressActiveRef.current = true;
          setImportProgress({
            open: true,
            progress: 0,
            steps: createStaticMeshImportSteps(entry.fileName, true),
          });
          const explicitBaseName = sessionState.outputBaseName.trim();
          const baseFilename =
            explicitBaseName && entries.length === 1
              ? explicitBaseName
              : sanitizeBaseFilename(entry.fileName);
          const importConfig = buildSsbhSessionImportConfig(
            entry.config,
            sessionState,
            baseFilename,
          );
          const result = await sceneConvertStaticMeshToStageFilesWithProgress(
            {
              sourcePath: entry.filePath,
              outputDir: entry.config.outputDirectory,
              config: importConfig,
            },
            handleStaticMeshProgress,
          );
          applyStaticMeshProgressUpdate({
            step: "done",
            label: "Direct-to-disk static mesh conversion completed",
            progress: 100,
          });
          for (const warning of result.warnings) {
            toast.warning(warning);
          }
          toast.success(`Converted ${entry.fileName} to disk`, {
            description: `${result.filesWritten.length} file(s) written to ${result.modelDir}`,
          });
        } catch (err) {
          toast.error(
            `Direct convert failed for ${entry.fileName}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        } finally {
          staticMeshProgressActiveRef.current = false;
          setImportProgress((prev) => ({ ...prev, open: false }));
        }
      }

      if (previewEntries.length === 0) {
        return;
      }

      let activeSessionId = sceneSessionId;
      if (!activeSessionId) {
        if (stageRoot) {
          const opened = await sceneOpenFolder(stageRoot);
          activeSessionId = opened.sessionId;
          setSceneSessionId(opened.sessionId);
        } else {
          activeSessionId = await sceneSessionCreate({ type: "new" });
          setSceneSessionId(activeSessionId);
        }
      }

      let successCount = 0;
      let failCount = 0;
      let offsetX = 0;
      const spacing = 2;
      const created: ImportedDaeObject[] = [];

      for (const entry of previewEntries) {
        try {
          staticMeshProgressActiveRef.current = true;
          setImportProgress({
            open: true,
            progress: 0,
            steps: createStaticMeshImportSteps(entry.fileName, false),
          });
          const explicitBaseName = sessionState.outputBaseName.trim();
          const baseFilename =
            explicitBaseName && entries.length === 1
              ? explicitBaseName
              : sanitizeBaseFilename(entry.fileName);
          const importConfig = buildSsbhSessionImportConfig(
            entry.config,
            sessionState,
            baseFilename,
          );
          const result = await importDaeThroughSceneSession({
            sessionId: activeSessionId,
            filePath: entry.filePath,
            name: baseFilename,
            importConfig,
            onProgress: handleStaticMeshProgress,
          });
          if (!result.ssbhGenerated) {
            throw new Error("SSBH conversion did not produce in-memory artifacts");
          }

          applyStaticMeshProgressUpdate({
            step: "preview",
            label: "Receiving viewport preview bundle from Rust...",
            detail: "Large mesh preview data may take time to cross IPC.",
            progress: 94,
          });
          const ssbhBundle = await sceneBuildImportPreviewBundle({
            sessionId: activeSessionId,
            importId: result.importId,
            stageRoot,
            sourcePath: entry.filePath,
          });
          for (const warning of ssbhBundle.warnings) {
            toast.warning(warning);
          }

          if (entry.config.generateHkt) {
            if (result.hktGenerated) {
              toast.success(`HKT collision generated for ${entry.fileName}`, {
                description:
                  result.hktDetail ??
                  "Mesh collision stored in session memory.",
              });
              const havokResult = await sceneGetHavokMeta(activeSessionId, result.importId);
              if (havokResult) {
                const meshData = parseHavokXML(havokResult.hktXml);
                setHavokMeshDataMap((prev) => {
                  const next = new Map(prev);
                  next.set(havokResult.sourceId, meshData);
                  return next;
                });
                setHavokMetaMap((prev) => {
                  const next = new Map(prev);
                  next.set(havokResult.sourceId, { displayName: havokResult.displayName, objectNodeId: havokResult.objectNodeId });
                  return next;
                });
              }
            } else {
              const hktWarning =
                result.warnings.find((w) => w.toLowerCase().includes("hkt")) ??
                "HKT generation did not produce collision data.";
              toast.warning(`HKT not generated for ${entry.fileName}`, {
                description: hktWarning,
              });
            }
          }

          for (const warning of result.warnings) {
            if (warning.toLowerCase().includes("hkt")) {
              continue;
            }
            toast.warning(warning);
          }

          applyStaticMeshProgressUpdate({
            step: "preview",
            label: "Loading static mesh into viewport...",
            progress: 97,
          });
          const loaded = await loadStaticMeshFromPath(
            entry.filePath,
            importConfig.ssbhConfig?.scaleFactor ?? 1,
          );
          const posX = offsetX;
          offsetX += loaded.boundingSize.x + spacing;
          created.push({
            id: `dae_${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${created.length}`,
            name: baseFilename,
            sourcePath: loaded.filePath,
            scene: loaded.scene,
            ssbhBundle,
            transform: { ...DEFAULT_TRANSFORM, posX },
            sessionImportId: result.importId,
            hktSimplify: { ...entry.config.hktSimplify },
          });
          applyStaticMeshProgressUpdate({
            step: "done",
            label: "Static mesh preview import completed",
            progress: 100,
          });
          successCount++;
        } catch (err) {
          failCount++;
          toast.error(
            `Convert failed for ${entry.fileName}: ${err instanceof Error ? err.message : String(err)}`,
          );
        } finally {
          staticMeshProgressActiveRef.current = false;
          setImportProgress((prev) => ({ ...prev, open: false }));
        }
      }

      if (created.length > 0) {
        setImportedDaeObjects((prev) => [...prev, ...created]);
        created.forEach((object) => useSceneDirtyStore.getState().markObjectAdded(object.name));
        useSceneDirtyStore.getState().markGlobalDirty("placementOrder");
        handleSelectNode(created[0]?.id ?? null);
      }

      if (successCount > 0 && failCount === 0) {
        toast.success(
          `Converted ${successCount} file(s) to SSBH in memory. Save the stage folder to write files.`,
        );
      } else if (successCount > 0 && failCount > 0) {
        toast.warning(`Converted ${successCount}, failed ${failCount}`);
      }
    },
    [sceneSessionId, stageRoot, handleSelectNode, handleStaticMeshProgress, applyStaticMeshProgressUpdate],
  );

  const importedDaeIdSet = useMemo(
    () => new Set(importedDaeObjects.map((obj) => obj.id)),
    [importedDaeObjects],
  );

  const openDaeExportDialogForNodeIds = useCallback(
    (nodeIds: string[]) => {
      const payload = buildDaeExportDialogState({
        nodeIds,
        baseModel,
        subModels,
        importedDaeIds: importedDaeIdSet,
        exportObjects: viewportRef.current?.getSelectedExportObjects() ?? [],
      });
      if (!payload) {
        toast.error("This object cannot be exported as a model");
        return false;
      }
      setDaeExportDialog({ open: true, ...payload });
      return true;
    },
    [baseModel, importedDaeIdSet, subModels],
  );

  const handleExportSelectedDae = useCallback(() => {
    const objects = viewportRef.current?.getSelectedExportObjects() ?? [];
    if (objects.length === 0) {
      toast.error("Select one or more scene objects before exporting");
      return;
    }
    openDaeExportDialogForNodeIds(objects.map((entry) => entry.name));
  }, [openDaeExportDialogForNodeIds]);

  const handleExportDaeFromOutliner = useCallback(
    (nodeId: string) => {
      if (!(nodeVisibility[nodeId] ?? true)) {
        toast.error("Cannot export a hidden object");
        return;
      }
      useSceneEditorStore.getState().select(nodeId);
      applyPrimarySelectionState(nodeId);
      requestAnimationFrame(() => {
        openDaeExportDialogForNodeIds([nodeId]);
      });
    },
    [applyPrimarySelectionState, nodeVisibility, openDaeExportDialogForNodeIds],
  );

  const handleDaeExportConfirm = useCallback(async (config: DaeExportConfig) => {
    const { targets, threeObjects } = daeExportDialog;
    setDaeExportDialog((prev) => ({ ...prev, open: false }));

    try {
      const wantsDae = config.formats.includes("dae");
      const wantsFbx = config.formats.includes("fbx");
      const ssbhTargets = targets.filter((t) => t.type === "ssbh" && t.rootPath);
      const daeTargets = targets.filter((t) => t.type === "imported-dae");
      const outputDir = config.outputDirectory;

      if (wantsDae && ssbhTargets.length > 0) {
        const entries: BatchDaeExportEntry[] = ssbhTargets.map((t) => ({
          rootPath: t.rootPath!,
          outputName: t.name,
        }));
        await exportStageDaeBatchToDirectory(entries, outputDir, {
          scaleFactor: config.scaleFactor,
          upAxis: config.upAxis,
          exportTextures: config.exportTextures,
        });
      }

      const selectedExportObjects: SceneExportObject[] = targets
        .map((t) => {
          const found = threeObjects.find((o) => o.name === t.nodeId);
          return found ? { object: found.object, name: t.name } : null;
        })
        .filter((o): o is SceneExportObject => o !== null);

      if (wantsDae && daeTargets.length > 0) {
        const daeObjects: SceneExportObject[] = daeTargets
          .map((t) => {
            const found = threeObjects.find((o) => o.name === t.nodeId);
            return found ? { object: found.object, name: t.name } : null;
          })
          .filter((o): o is SceneExportObject => o !== null);
        if (daeObjects.length > 0) {
          const exported = await exportObjectsAsDAEToDirectory(daeObjects, outputDir);
          toast.success(`Exported ${exported.length} DAE file${exported.length === 1 ? "" : "s"}`);
        }
      }

      if (wantsFbx) {
        if (selectedExportObjects.length === 0) {
          toast.warning("FBX export needs the selected object to be visible in the viewport");
        } else {
          const exported = await exportObjectsAsFBXToDirectory(selectedExportObjects, outputDir, {
            exportTextures: config.exportTextures,
            upAxis: config.upAxis,
          });
          toast.success(`Exported ${exported.length} FBX file${exported.length === 1 ? "" : "s"}`);
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to export model");
    }
  }, [daeExportDialog]);

  // Tear down the in-memory HKT collision overlay for deleted folder-based models
  // (sub-models / base). Imported-DAE objects clean their own overlay by sessionImportId.
  const removeHavokOverlayForFolders = useCallback(
    (folderNames: string[]) => {
      if (folderNames.length === 0) return;
      const folderSet = new Set(folderNames);
      const candidateIds = new Set<string>([
        ...havokMeshDataMap.keys(),
        ...havokMetaMap.keys(),
      ]);
      const sourceIds = collectHavokSourceIdsForFolders(candidateIds, folderSet);
      if (sourceIds.length === 0) return;
      const idSet = new Set(sourceIds);
      setHavokMeshDataMap((prev) => {
        const next = new Map(prev);
        idSet.forEach((id) => next.delete(id));
        return next;
      });
      setHavokMetaMap((prev) => {
        const next = new Map(prev);
        idSet.forEach((id) => next.delete(id));
        return next;
      });
      if (sceneSessionId) {
        idSet.forEach((id) => {
          sceneRemoveHavokData(sceneSessionId, id).catch(() => {});
        });
      }
    },
    [havokMeshDataMap, havokMetaMap, sceneSessionId],
  );

  const handleDeleteSelected = useCallback(
    async (ids?: string[]) => {
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

      // Branch 1: Imported DAE objects
      const daeIds = requestedIds.filter((id) => importedDaeObjects.some((obj) => obj.id === id));
      if (daeIds.length > 0) {
        const deleted = importedDaeObjects.filter((obj) => daeIds.includes(obj.id));
        setImportedDaeObjects((prev) => prev.filter((obj) => !daeIds.includes(obj.id)));
        daeIds.forEach((id) => useSceneAssetStore.getState().removeAsset(id));
        // Backend cleanup: remove import + havok data
        if (sceneSessionId) {
          for (const obj of deleted) {
            if (obj.sessionImportId) {
              sceneRemoveImport(sceneSessionId, obj.sessionImportId).catch(() => {});
              sceneRemoveHavokData(sceneSessionId, obj.sessionImportId).catch(() => {});
            }
          }
        }
        // Remove havok state
        setHavokMeshDataMap((prev) => {
          const next = new Map(prev);
          for (const obj of deleted) {
            if (obj.sessionImportId) next.delete(obj.sessionImportId);
          }
          return next;
        });
        setHavokMetaMap((prev) => {
          const next = new Map(prev);
          for (const obj of deleted) {
            if (obj.sessionImportId) next.delete(obj.sessionImportId);
          }
          return next;
        });
        useSceneDirtyStore.getState().markGlobalDirty("placementOrder");
        handleClearSelection();
        toast.success(`Deleted ${deleted.length} DAE object(s)`);
        return;
      }

      // Branch 2: Sub-model deletion
      const subModelIds = requestedIds.filter((id) =>
        subModels.some((s) => s.folderName === id),
      );
      if (subModelIds.length > 0 && stageRoot) {
        const preview = await buildDeletePreview(stageRoot, subModelIds);
        // Count affected placements
        let placementCount = 0;
        for (const folderId of subModelIds) {
          const sub = subModels.find((s) => s.folderName === folderId);
          if (sub) {
            placementCount += placementEntries.filter(
              (e) => e.vdkType.toUpperCase() === "OBJECT" && e.objectNumber === sub.objectIndex,
            ).length;
          }
        }
        const confirmed = await new Promise<boolean>((resolve) => {
          setDeleteConfirmState({
            open: true,
            preview,
            meta: { placementCount },
            resolve,
          });
        });
        if (!confirmed) return;

        // Mark for Phase 1 deletion at save time
        for (const folderId of subModelIds) {
          useSceneDirtyStore.getState().markObjectDeleted(folderId);
        }
        // Forget the model in the in-memory session so a save commits the
        // deletion instead of re-materializing the folder from a lingering
        // converted import (memory-only; disk is untouched until save).
        if (sceneSessionId) {
          for (const folderId of subModelIds) {
            sceneForgetModel(sceneSessionId, folderId).catch(() => {});
          }
        }
        // Remove placement entries matching deleted sub-models
        const deletedObjectIndices = new Set(
          subModelIds
            .map((id) => subModels.find((s) => s.folderName === id)?.objectIndex)
            .filter((v): v is number => v != null),
        );
        setPlacementEntries((prev) =>
          prev.filter(
            (e) => !(e.vdkType.toUpperCase() === "OBJECT" && deletedObjectIndices.has(e.objectNumber ?? -1)),
          ),
        );
        // Remove from tree
        setTreeRoot((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            children: prev.children?.filter((c) => !subModelIds.includes(c.id)),
          };
        });
        // Remove from subModels state
        setSubModels((prev) => prev.filter((s) => !subModelIds.includes(s.folderName)));
        // Tear down their collision overlay so the viewport matches the deletion
        removeHavokOverlayForFolders(subModelIds);
        useSceneDirtyStore.getState().markGlobalDirty("placementOrder");
        handleClearSelection();
        toast.success(`Deleted ${subModelIds.length} sub-model(s)`);
        return;
      }

      // Branch 3: Base model deletion
      const hasBase = requestedIds.includes("base");
      if (hasBase && stageRoot) {
        const preview = await buildBaseDeletePreview(stageRoot);
        const confirmed = await new Promise<boolean>((resolve) => {
          setDeleteConfirmState({ open: true, preview, resolve });
        });
        if (!confirmed) return;

        useSceneDirtyStore.getState().markObjectDeleted("base");
        // Forget the base model in the in-memory session so a save commits the
        // deletion instead of re-writing the cached root files (memory-only).
        if (sceneSessionId) {
          sceneForgetBaseModel(sceneSessionId).catch(() => {});
        }
        setBaseModel(null);
        setTreeRoot((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            children: prev.children?.filter((c) => c.role !== "base"),
          };
        });
        // Tear down the base model's collision overlay so the viewport matches the deletion
        removeHavokOverlayForFolders(["base"]);
        handleClearSelection();
        toast.success("Base model marked for deletion");
        return;
      }

      // Branch 4: Placement rows (existing behavior)
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
      importedDaeObjects,
      nodeIdForPlacementIndex,
      placementEntries,
      placementIndexForNodeId,
      removeHavokOverlayForFolders,
      sceneSessionId,
      selectedNodeId,
      selectedPlacementIdx,
      stageRoot,
      subModels,
    ],
  );

  const handleHavokDataUpdated = useCallback((sourceId: string, meshData: HavokMeshData) => {
    setHavokMeshDataMap((prev) => {
      const next = new Map(prev);
      next.set(sourceId, meshData);
      return next;
    });
  }, []);

  const handleImportedDaeHktSimplifyChange = useCallback(
    (nodeId: string, next: HktSimplifyConfig) => {
      setImportedDaeObjects((prev) =>
        prev.map((entry) => (entry.id === nodeId ? { ...entry, hktSimplify: next } : entry)),
      );
    },
    [],
  );

  const handleGenerateHkt = useCallback(
    async (ids: string[]) => {
      if (!sceneSessionId) {
        toast.error("No scene session — open a stage first");
        return;
      }
      for (const id of ids) {
        // Try as imported DAE object first
        const obj = importedDaeObjects.find((o) => o.id === id);
        if (obj) {
          const hktSimplify = obj.hktSimplify ?? { ...DEFAULT_HKT_SIMPLIFY };
          try {
            toast.loading(`Generating HKT for ${obj.name}...`, { id: `hkt-${id}` });
            const sessionImportId = await ensureImportedDaeSessionImport({
              sessionId: sceneSessionId,
              object: { ...obj, hktSimplify },
            });
            const baseConfig = await sceneGetImportConfig(sceneSessionId, sessionImportId).catch(
              () => null,
            );
            await sceneConfigureImport(sceneSessionId, sessionImportId, {
              loadToScene: baseConfig?.loadToScene ?? false,
              convertToSsbh: baseConfig?.convertToSsbh ?? false,
              generateHkt: true,
              ssbhConfig: baseConfig?.ssbhConfig ?? null,
              hktSimplify,
            });
            setImportedDaeObjects((prev) =>
              prev.map((entry) =>
                entry.id === obj.id
                  ? { ...entry, sessionImportId, hktSimplify }
                  : entry,
              ),
            );
            await sceneGenerateHkt(sceneSessionId, sessionImportId, "auto");
            const havokResult = await sceneGetHavokMeta(sceneSessionId, sessionImportId);
            if (havokResult) {
              const meshData = parseHavokXML(havokResult.hktXml);
              setHavokMeshDataMap((prev) => {
                const next = new Map(prev);
                next.set(havokResult.sourceId, meshData);
                return next;
              });
              setHavokMetaMap((prev) => {
                const next = new Map(prev);
                next.set(havokResult.sourceId, { displayName: havokResult.displayName, objectNodeId: havokResult.objectNodeId });
                return next;
              });
            }
            useSceneDirtyStore.getState().markObjectModified(obj.name, "hkt");
            toast.success(`HKT generated for ${obj.name}`, { id: `hkt-${id}` });
          } catch (err) {
            toast.error(`HKT failed for ${obj.name}: ${err instanceof Error ? err.message : String(err)}`, { id: `hkt-${id}` });
          }
          continue;
        }

        // Resolve collision sourceId to folder name:
        // - disk-loaded HKT: "folderName\file.hkt" or "folderName/file.hkt" → "folderName"
        // - mesh-generated HKT: "mesh-hkt-folderName" → "folderName"
        let resolvedId = id;
        if (resolvedId.startsWith("mesh-hkt-")) {
          resolvedId = resolvedId.slice("mesh-hkt-".length);
        } else if (/[/\\]/.test(resolvedId)) {
          resolvedId = resolvedId.split(/[/\\]/)[0];
        }

        // Try as sub_model node (or any folder-based node with numshb)
        const subModel = subModels.find((s) => s.folderName === resolvedId);
        if (subModel || resolvedId === "base") {
          const folderName = resolvedId;
          const hktSimplify = { ...DEFAULT_HKT_SIMPLIFY };
          try {
            toast.loading(`Generating HKT for ${folderName}...`, { id: `hkt-${id}` });
            await sceneGenerateHktFromMesh(sceneSessionId, folderName, hktSimplify);
            const havokResult = await sceneGetHavokMeta(sceneSessionId, `mesh-hkt-${folderName}`);
            if (havokResult) {
              const meshData = parseHavokXML(havokResult.hktXml);
              setHavokMeshDataMap((prev) => {
                const next = new Map(prev);
                if (id !== resolvedId) next.delete(id);
                next.set(havokResult.sourceId, meshData);
                return next;
              });
              setHavokMetaMap((prev) => {
                const next = new Map(prev);
                if (id !== resolvedId) next.delete(id);
                next.set(havokResult.sourceId, { displayName: havokResult.displayName, objectNodeId: havokResult.objectNodeId });
                return next;
              });
            }
            useSceneDirtyStore.getState().markObjectModified(folderName, "hkt");
            toast.success(`HKT generated for ${folderName}`, { id: `hkt-${id}` });
          } catch (err) {
            toast.error(`HKT failed for ${folderName}: ${err instanceof Error ? err.message : String(err)}`, { id: `hkt-${id}` });
          }
          continue;
        }
      }
    },
    [sceneSessionId, importedDaeObjects, subModels],
  );

  const handleReplaceHkt = useCallback(
    async (importId: string) => {
      if (!sceneSessionId) return;
      const selected = await open({
        title: "Select HKT file",
        filters: [{ name: "Havok", extensions: ["hkt"] }],
        multiple: false,
      });
      if (!selected) return;
      const hktPath = typeof selected === "string" ? selected : selected[0];
      if (!hktPath) return;

      // For sub_model/base nodes, resolve to disk-relative HKT path (folderName/map_hit.hkt)
      let resolvedImportId = importId;
      const isSubModelOrBase = subModels.some((s) => s.folderName === importId) || importId === "base";
      if (isSubModelOrBase) {
        resolvedImportId = `${importId}/map_hit.hkt`;
      }

      try {
        toast.loading("Replacing HKT...", { id: `replace-hkt-${importId}` });
        await sceneReplaceHkt(sceneSessionId, resolvedImportId, hktPath);
        const havokResult = await sceneGetHavokMeta(sceneSessionId, resolvedImportId);
        if (havokResult) {
          const meshData = parseHavokXML(havokResult.hktXml);
          setHavokMeshDataMap((prev) => {
            const next = new Map(prev);
            next.set(havokResult.sourceId, meshData);
            return next;
          });
          setHavokMetaMap((prev) => {
            const next = new Map(prev);
            next.set(havokResult.sourceId, { displayName: havokResult.displayName, objectNodeId: havokResult.objectNodeId });
            return next;
          });
        }
        const daeObj = importedDaeObjects.find((o) => o.id === importId);
        useSceneDirtyStore.getState().markObjectModified(daeObj ? daeObj.name : importId, "hkt");
        toast.success("HKT replaced", { id: `replace-hkt-${importId}` });
      } catch (err) {
        toast.error(`Replace HKT failed: ${err instanceof Error ? err.message : String(err)}`, { id: `replace-hkt-${importId}` });
      }
    },
    [sceneSessionId, subModels, importedDaeObjects],
  );

  // Feature 1: open the new-model HKT window for the replace target. Unlike
  // handleReplaceHkt (which picks an existing .hkt), this reads a fresh DAE/FBX,
  // rebuilds a Havok collision, previews it, then replaces the target's HKT.
  const handleGenerateHktFromModel = useCallback(
    (importId: string) => {
      if (!sceneSessionId) return;
      let resolvedImportId = importId;
      const isSubModelOrBase = subModels.some((s) => s.folderName === importId) || importId === "base";
      if (isSubModelOrBase) {
        resolvedImportId = `${importId}/map_hit.hkt`;
      }
      const daeObj = importedDaeObjects.find((o) => o.id === importId);
      const targetName = daeObj?.name ?? (importId === "base" ? "Base model" : importId);
      setGenHktFromModel({ open: true, targetImportId: resolvedImportId, targetName });
    },
    [sceneSessionId, subModels, importedDaeObjects],
  );

  const handleGenHktFromModelReplaced = useCallback(
    async (resolvedImportId: string) => {
      if (!sceneSessionId) return;
      const havokResult = await sceneGetHavokMeta(sceneSessionId, resolvedImportId);
      if (havokResult) {
        const meshData = parseHavokXML(havokResult.hktXml);
        setHavokMeshDataMap((prev) => {
          const next = new Map(prev);
          next.set(havokResult.sourceId, meshData);
          return next;
        });
        setHavokMetaMap((prev) => {
          const next = new Map(prev);
          next.set(havokResult.sourceId, { displayName: havokResult.displayName, objectNodeId: havokResult.objectNodeId });
          return next;
        });
      }
      useSceneDirtyStore
        .getState()
        .markObjectModified(genHktFromModel.targetName || resolvedImportId, "hkt");
    },
    [sceneSessionId, genHktFromModel.targetName],
  );

  const handleReorderOutlinerNode = useCallback((activeId: string, overId: string) => {
    useSceneEditorStore.getState().reorderOutlinerNode(activeId, overId);
    useSceneDirtyStore.getState().markGlobalDirty("placementOrder");
  }, []);

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

  const selectedImportedDae = useMemo(() => {
    if (!selectedNodeId) return null;
    const direct = importedDaeObjects.find((obj) => obj.id === selectedNodeId);
    if (direct) return direct;
    if (selectedNodeId.startsWith("__col__")) {
      const sourceId = selectedNodeId.slice("__col__".length);
      const meta = havokMetaMap.get(sourceId);
      if (meta?.objectNodeId) {
        return importedDaeObjects.find((obj) => obj.id === meta.objectNodeId) ?? null;
      }
    }
    return null;
  }, [selectedNodeId, importedDaeObjects, havokMetaMap]);

  const selectedCollisionSourceId = useMemo(() => {
    if (!selectedNodeId?.startsWith("__col__")) return null;
    return selectedNodeId.slice("__col__".length);
  }, [selectedNodeId]);

  const selectedImportedDaeMeshData = useMemo(() => {
    if (selectedCollisionSourceId) {
      return havokMeshDataMap.get(selectedCollisionSourceId) ?? null;
    }
    if (!selectedImportedDae?.sessionImportId) return null;
    return havokMeshDataMap.get(selectedImportedDae.sessionImportId) ?? null;
  }, [selectedImportedDae, selectedCollisionSourceId, havokMeshDataMap]);

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
          onImportDaeWithConfig={handleImportDae}
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
          <AlertDialogContent showCloseButton>
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
          <AlertDialogContent showCloseButton>
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
              <Tabs defaultValue="outliner" className="flex h-full flex-col">
                <TabsList className={SCENE_HIERARCHY_TABS_LIST}>
                  <TabsTrigger value="outliner" className={SCENE_HIERARCHY_TAB_TRIGGER}>
                    Outliner
                  </TabsTrigger>
                  <TabsTrigger value="textures" className={SCENE_HIERARCHY_TAB_TRIGGER}>
                    Textures
                  </TabsTrigger>
                  <TabsTrigger value="structure" className={SCENE_HIERARCHY_TAB_TRIGGER}>
                    Structure
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="outliner" className="mt-0 min-h-0 flex-1 overflow-hidden">
                  <SceneOutliner
                    root={outlinerRoot}
                    isLoading={isLoading}
                    onSelect={handleOutlinerSelectNode}
                    onDuplicate={handleDuplicateSelected}
                    onDelete={handleDeleteSelected}
                    onPaste={handlePasteAsNew}
                    onFocusSelected={handleFocusSelected}
                    onClearSelection={handleClearSelection}
                    onSelectAll={(ids) => {
                      if (ids.length > 0) applyPrimarySelectionState(ids[ids.length - 1]);
                    }}
                    onGenerateHkt={handleGenerateHkt}
                    onReplaceHkt={handleReplaceHkt}
                    onGenerateHktFromModel={handleGenerateHktFromModel}
                    onReorderRootChild={handleReorderOutlinerNode}
                    onOpenProperties={handleOpenProperties}
                    onExportDae={handleExportDaeFromOutliner}
                  />
                  {havokMeshDataMap.size > 0 && (
                    <MayaSection title="Collision" badge={havokMeshDataMap.size}>
                      <CollisionListPanel
                        sourceIds={Array.from(havokMeshDataMap.keys())}
                        meshDataMap={havokMeshDataMap}
                        metaMap={havokMetaMap}
                      />
                    </MayaSection>
                  )}
                </TabsContent>
                <TabsContent value="textures" className="mt-0 min-h-0 flex-1 overflow-hidden">
                  <SceneTextureManager
                    textureDataMap={textureDataMap}
                    decodeContext={sceneTextureDecodeContext}
                  />
                </TabsContent>
                <TabsContent value="structure" className="mt-0 min-h-0 flex-1 overflow-hidden">
                  <StructureInspectorPanel stageRoot={stageRoot} />
                </TabsContent>
              </Tabs>
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
            className="relative z-0 min-w-0"
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
                selectedCollisionSourceId={selectedCollisionSourceId}
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
            className="relative z-20 min-w-0"
          >
            <ScenePropertiesPanel
              headerActions={
                <ResetIconButton
                  onClick={handleResetSession}
                  label="Reset all changes"
                  disabled={!initialSnapshotRef.current}
                />
              }
              textureBadge={textureDataMap.size}
              graphicBadge={`${appliedGraphicParamKeys.size}/${graphicParams.length}`}
              placementBadge={placementEntries.length}
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
                      />
                    </MayaSection>
                  )}

                  <MayaSection title="Scene">
                    <SceneInfoContent
                      stageName={stageName}
                      stageRoot={stageRoot}
                      selectedNode={selectedNode}
                      subModelCount={effectiveSubModels.length}
                      textureCount={textureDataMap.size}
                    />
                  </MayaSection>

                  {selectedNodeId && (
                    <MayaSection title="Asset Config" defaultOpen>
                      <SceneAssetConfigPanel assetId={selectedNodeId} />
                    </MayaSection>
                  )}

                  {selectedImportedDae && (
                    <MayaSection title="HKT Collision" defaultOpen>
                      <HavokCollisionEditorPanel
                        sessionId={sceneSessionId}
                        sessionImportId={selectedImportedDae.sessionImportId}
                        sourcePath={selectedImportedDae.sourcePath}
                        sourceName={selectedImportedDae.name}
                        hktSimplify={selectedImportedDae.hktSimplify}
                        onHktSimplifyChange={(next) =>
                          handleImportedDaeHktSimplifyChange(selectedImportedDae.id, next)
                        }
                        onHavokDataUpdated={(sourceId, meshData) => {
                          handleHavokDataUpdated(sourceId, meshData);
                          useSceneDirtyStore.getState().markObjectModified(selectedImportedDae.name, "hkt");
                        }}
                        activeMeshData={selectedImportedDaeMeshData}
                      />
                    </MayaSection>
                  )}

                  <MayaSection title="Stats" defaultOpen={false}>
                    <SceneStatsContent
                      drawStats={drawStats}
                      subModelCount={effectiveSubModels.length}
                      textureCount={textureDataMap.size}
                      stageName={stageName}
                    />
                  </MayaSection>
                </>
              }
              textureContent={
                <>
                  <MayaSection title="Texture Quality" defaultOpen>
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
                    subModels={effectiveSubModels}
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
                        effectiveSubModels,
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
          onClose={() => setImportProgress((prev) => ({ ...prev, open: false }))}
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
        <GenerateHktFromModelDialog
          open={genHktFromModel.open}
          onOpenChange={(open) => setGenHktFromModel((prev) => ({ ...prev, open }))}
          sessionId={sceneSessionId}
          targetImportId={genHktFromModel.targetImportId}
          targetName={genHktFromModel.targetName}
          onReplaced={handleGenHktFromModelReplaced}
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
          meta={deleteConfirmState.meta}
          onConfirm={handleDeleteConfirmAccept}
          onCancel={handleDeleteConfirmCancel}
        />
        <StageValidationErrorDialog
          open={validationDialog.open}
          title={validationDialog.title}
          errors={validationDialog.errors}
          knownFolderNames={[...subModels.map((s) => s.folderName), "base"]}
          onClose={() => setValidationDialog((prev) => ({ ...prev, open: false }))}
          onSelectFolder={(folderName) => {
            applyPrimarySelectionState(folderName);
            setValidationDialog((prev) => ({ ...prev, open: false }));
          }}
        />

        {showDaeImportModal && daeImportEntries.length > 0 && (
          <DaeImportConfigModal
            entries={daeImportEntries}
            havokInfo={havokInfo}
            stageRoot={stageRoot}
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
                  !entry.config.directToDisk &&
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
                    const loaded = await loadStaticMeshFromPath(entry.filePath);
                    const posX = offsetX;
                    offsetX += loaded.boundingSize.x + SPACING;
                    created.push({
                      id: `dae_${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${created.length}`,
                      name: loaded.fileName.replace(/\.(dae|fbx)$/i, ""),
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

              if (!sceneSessionId && !stageRoot) {
                const sid = await sceneSessionCreate({ type: "new" });
                setSceneSessionId(sid);
              }
              await processSsbhSessionImport(entriesToProcess);
            }}
            onCancel={() => {
              setShowDaeImportModal(false);
              setDaeImportEntries([]);
            }}
          />
        )}
        <SceneDetailViewHost
          sessions={detailViewSessions}
          onActivateSession={activateDetailViewSession}
          onCloseSession={closeDetailViewSession}
          onTabChange={setDetailViewActiveTab}
          onNumdlbDraftChange={setDetailViewNumdlbDraft}
          onNumdlbSave={saveDetailViewNumdlb}
          onNumatbDraftChange={setDetailViewNumatbDraft}
          onNumatbSave={saveDetailViewNumatb}
          onNuhlpbDraftChange={setDetailViewNuhlpbDraft}
          onNuhlpbSave={saveDetailViewNuhlpb}
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
