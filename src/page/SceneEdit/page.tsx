import { useState, useCallback, useRef, useTransition, useEffect, useMemo } from "react";
import { useDefaultLayout } from "react-resizable-panels";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { toast } from "sonner";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
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
import {
  MapViewport,
  type MapViewportHandle,
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
import { PlacementPanel, type PlacementRow } from "./components/PlacementPanel";
import {
  formatPlacementViewportNodeId,
  parsePlacementViewportNodeId,
} from "./utils/placementNodeId";
import {
  clonePlacementRow,
  patchPlacementRawFieldsForNumericField,
  patchPlacementRowTransform,
} from "./utils/patchPlacementRawFields";
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
import { SceneStatusPanel } from "./components/SceneStatusPanel";
import { useSceneTextureLoader } from "./hooks/useSceneTextureLoader";
import { TextureQualityPanel, getMaxDimensionForQuality } from "./components/TextureQualityPanel";
import { disposeFhm2dMemorySession } from "@/page/TestEditor/components/ssbh-model-preview/fhm2dMemoryPreviewService";
import {
  clearNutexbPreviewCacheAsync,
  clearNutexbRgbaCache,
} from "@/page/TestEditor/components/ssbh-model-preview/nutexbPreviewCache";
import { clearSceneEditColladaModelCache } from "./components/DAEModel";
import { reorderPlacementEntriesBySubModels } from "./utils/reorderPlacementBySubModels";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

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

/** Default split: 20% | 60% | 20% (percent keys match Panel `id`) */
const SCENE_EDIT_DEFAULT_LAYOUT: Record<(typeof SCENE_EDIT_PANEL_IDS)[number], number> =
  {
    "scene-hierarchy": 20,
    "scene-viewport": 60,
    "scene-properties": 20,
  };

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
  const [placementHeader, setPlacementHeader] = useState<string[]>([]);
  const [placementColMap, setPlacementColMap] = useState<
    Record<string, number>
  >({});
  const [placementEntries, setPlacementEntries] = useState<PlacementRow[]>([]);
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

  const [showGrid, setShowGrid] = useState(true);
  const [showAxes, setShowAxes] = useState(true);
  const [wireframe, setWireframe] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [textureQuality, setTextureQuality] = useState("original");
  const [viewportClickPickSelection, setViewportClickPickSelection] = useState(false);
  const [sceneAnimeRenderEnabled, setSceneAnimeRenderEnabled] = useState(false);
  const [placementGizmoMode, setPlacementGizmoMode] = useState<PlacementGizmoMode>("translate");
  const [drawStats, setDrawStats] = useState<SceneDrawStats | null>(null);
  const [clearCacheDialogOpen, setClearCacheDialogOpen] = useState(false);

  const textureMaxDimension = getMaxDimensionForQuality(textureQuality);
  const scenePreviewRenderStyle: PreviewRenderStyle = sceneAnimeRenderEnabled
    ? "anime"
    : "standard";
  const {
    textureDataMap,
    progress: textureProgress,
    warnings: textureWarnings,
  } = useSceneTextureLoader(baseModel, subModels, sessionId, textureMaxDimension);

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

  const handleSelectNode = useCallback(
    (id: string | null) => {
      if (!id) {
        setSelectedNodeIdRaw(null);
        setSelectedPlacementIdxRaw(null);
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

  const handleDuplicatePlacement = useCallback(() => {
    if (selectedPlacementIdx === null) return;
    const src = placementEntries[selectedPlacementIdx];
    if (src.vdkType.toUpperCase() !== "OBJECT") {
      toast.error("Only OBJECT rows can be duplicated");
      return;
    }
    const dup = clonePlacementRow(src);
    const insertAt = selectedPlacementIdx + 1;
    setPlacementEntries((prev) => {
      const next = [...prev];
      next.splice(insertAt, 0, dup);
      return next;
    });
    setSelectedPlacementIdxRaw(insertAt);
    const sub =
      src.objectNumber !== null
        ? subModels.find((s) => s.objectIndex === src.objectNumber)
        : null;
    if (sub) {
      setSelectedNodeIdRaw(formatPlacementViewportNodeId(sub.folderName, insertAt));
    }
    setHasUnsavedChanges(true);
    toast.success("Placement row duplicated");
  }, [selectedPlacementIdx, placementEntries, subModels]);

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
        setPlacementEntries(
          reorderPlacementEntriesBySubModels(mappedPlacements, bundle.subModels),
        );
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
    setPlacementHeader([]);
    setPlacementColMap({});
    setPlacementEntries([]);
    setTreeRoot(null);
    setDrawStats(null);
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
      const selected = await open({ directory: true });
      if (!selected || typeof selected !== "string") return;

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
      });
      if (!selected || typeof selected !== "string") return;

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

      if (placementHeader.length > 0 && placementEntries.length > 0) {
        const headerLine = placementHeader.join(",");
        const dataLines = placementEntries.map((e) => e.rawFields.join(","));
        const placementCsv = [headerLine, ...dataLines].join("\n");
        await writeTextFile(`${stageRoot}/info/placement.csv`, placementCsv);
      }

      setHasUnsavedChanges(false);
      toast.success("CSV files saved");
    } catch (err: any) {
      toast.error("Save failed", { description: String(err) });
    }
  }, [stageRoot, graphicParams, placementHeader, placementEntries]);

  const handleGraphicParamChange = useCallback(
    (index: number, value: string) => {
      setGraphicParams((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], value };
        return next;
      });
      setHasUnsavedChanges(true);
    },
    []
  );

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
      setPlacementEntries((prev) => {
        const next = [...prev];
        const entry = prev[index];
        if (!entry) return prev;
        next[index] = patchPlacementRawFieldsForNumericField(
          entry,
          field,
          value,
          placementColMap
        );
        return next;
      });
      setHasUnsavedChanges(true);
    },
    [placementColMap]
  );

  const gizmoRafRef = useRef<number | null>(null);
  const gizmoPendingRef = useRef<{ idx: number; t: TransformData } | null>(null);

  const applyPlacementTransformImmediate = useCallback(
    (idx: number, t: TransformData) => {
      setPlacementEntries((prev) => {
        const entry = prev[idx];
        if (!entry || entry.vdkType.toUpperCase() !== "OBJECT") return prev;
        const patched = patchPlacementRowTransform(entry, t, placementColMap);
        const next = [...prev];
        next[idx] = patched;
        return next;
      });
      setHasUnsavedChanges(true);
    },
    [placementColMap],
  );

  const schedulePlacementGizmo = useCallback(
    (idx: number, t: TransformData) => {
      gizmoPendingRef.current = { idx, t };
      if (gizmoRafRef.current !== null) return;
      gizmoRafRef.current = requestAnimationFrame(() => {
        gizmoRafRef.current = null;
        const p = gizmoPendingRef.current;
        if (!p) return;
        applyPlacementTransformImmediate(p.idx, p.t);
      });
    },
    [applyPlacementTransformImmediate],
  );

  const commitPlacementGizmo = useCallback(
    (idx: number, t: TransformData) => {
      if (gizmoRafRef.current !== null) {
        cancelAnimationFrame(gizmoRafRef.current);
        gizmoRafRef.current = null;
      }
      gizmoPendingRef.current = null;
      applyPlacementTransformImmediate(idx, t);
    },
    [applyPlacementTransformImmediate],
  );

  const handleTransformChange = useCallback(
    (field: keyof TransformData, value: number) => {
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
    [selectedPlacementIdx, handlePlacementChange]
  );

  const handleDrawStatsChange = useCallback((stats: SceneDrawStats) => {
    setDrawStats(stats);
  }, []);

  const handleTextureQualityChange = useCallback((quality: string) => {
    setTextureQuality(quality);
    clearNutexbRgbaCache();
  }, []);

  const selectedTreeId = useMemo(() => {
    if (!selectedNodeId) return null;
    const parsed = parsePlacementViewportNodeId(selectedNodeId);
    return parsed ? parsed.folderName : selectedNodeId;
  }, [selectedNodeId]);

  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    const parsed = parsePlacementViewportNodeId(selectedNodeId);
    const treeLookupId = parsed ? parsed.folderName : selectedNodeId;
    return findNode(treeRoot, treeLookupId);
  }, [treeRoot, selectedNodeId]);
  const selectedTransform: TransformData | null =
    selectedPlacementIdx !== null && placementEntries[selectedPlacementIdx]
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

  const canDuplicatePlacement =
    selectedPlacementIdx !== null &&
    placementEntries[selectedPlacementIdx]?.vdkType.toUpperCase() === "OBJECT";

  return (
    <TooltipProvider>
      <div className="flex h-full min-h-0 min-w-0 flex-col bg-background">
        <MapToolbar
          onOpenFolder={handleOpenFolder}
          onImportFhm2d={handleImportFhm2d}
          onSave={handleSave}
          canSave={!!stageName && !isMemoryImport}
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
          <ResizablePanel
            id="scene-hierarchy"
            defaultSize="20%"
            minSize="10%"
            maxSize="50%"
            className="min-w-0"
          >
            <div className="flex h-full min-w-0 flex-col overflow-hidden border-r">
              <div className="shrink-0 text-[10px] font-semibold px-3 py-1.5 border-b bg-muted/30 text-muted-foreground uppercase tracking-widest select-none whitespace-nowrap">
                Scene
              </div>
              <div className="min-h-0 flex-1 overflow-hidden">
                <StageHierarchyTree
                  root={treeRoot}
                  selectedId={selectedTreeId}
                  onSelect={handleSelectNode}
                />
              </div>
            </div>
          </ResizablePanel>

          <ResizableHandle
            withHandle
            className="relative z-30 w-2 shrink-0 bg-border/30 hover:bg-primary/25"
          />

          <ResizablePanel
            id="scene-viewport"
            defaultSize="60%"
            minSize="35%"
            maxSize="80%"
            className="min-w-0"
          >
            <div className="relative h-full min-h-0 min-w-0 overflow-hidden">
              <MapViewport
                ref={viewportRef}
                baseModel={baseModel}
                subModels={subModels}
                placementEntries={placementEntries}
                showGrid={showGrid}
                showAxes={showAxes}
                wireframe={wireframe}
                showStats={showStats}
                selectedNodeId={selectedNodeId}
                selectedPlacementIdx={selectedPlacementIdx}
                onSelectNode={handleSelectNode}
                textureDataMap={textureDataMap}
                onDrawStatsChange={handleDrawStatsChange}
                graphicParams={graphicParams}
                clickPickSelectionEnabled={viewportClickPickSelection}
                previewRenderStyle={scenePreviewRenderStyle}
                placementGizmoMode={placementGizmoMode}
                onPlacementGizmoFrame={schedulePlacementGizmo}
                onPlacementGizmoCommit={commitPlacementGizmo}
              />
              <SceneViewportOverlay textureProgress={textureProgress} />
            </div>
          </ResizablePanel>

          <ResizableHandle
            withHandle
            className="relative z-30 w-2 shrink-0 bg-border/30 hover:bg-primary/25"
          />

          <ResizablePanel
            id="scene-properties"
            defaultSize="20%"
            minSize="10%"
            maxSize="50%"
            className="min-w-0"
          >
            <div className="flex h-full min-w-0 flex-col overflow-hidden border-l">
              <div className="shrink-0 flex flex-col gap-2 px-3 py-2 border-b bg-muted/30">
                <div className="flex items-center justify-between gap-2">
                  <Label
                    htmlFor="scene-viewport-click-pick"
                    className="text-[10px] font-medium cursor-pointer leading-tight text-muted-foreground"
                  >
                    Viewport click select
                  </Label>
                  <Switch
                    id="scene-viewport-click-pick"
                    checked={viewportClickPickSelection}
                    onCheckedChange={setViewportClickPickSelection}
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <Label
                    htmlFor="scene-anime-render-style"
                    className="text-[10px] font-medium cursor-pointer leading-tight text-muted-foreground"
                    title="Bloom + warm lights + cel-shaded PBR (matches Test Editor Anime style)"
                  >
                    Anime render
                  </Label>
                  <Switch
                    id="scene-anime-render-style"
                    checked={sceneAnimeRenderEnabled}
                    onCheckedChange={setSceneAnimeRenderEnabled}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-[10px] text-muted-foreground">Placement gizmo</Label>
                  <ToggleGroup
                    type="single"
                    value={placementGizmoMode}
                    onValueChange={(v) => {
                      if (v) setPlacementGizmoMode(v as PlacementGizmoMode);
                    }}
                    variant="outline"
                    className="flex w-full flex-wrap justify-start gap-1"
                  >
                    <ToggleGroupItem
                      value="translate"
                      className="h-7 flex-1 min-w-[4rem] px-2 text-[10px]"
                      aria-label="Move"
                    >
                      Move
                    </ToggleGroupItem>
                    <ToggleGroupItem
                      value="rotate"
                      className="h-7 flex-1 min-w-[4rem] px-2 text-[10px]"
                      aria-label="Rotate"
                    >
                      Rotate
                    </ToggleGroupItem>
                    <ToggleGroupItem
                      value="scale"
                      className="h-7 flex-1 min-w-[4rem] px-2 text-[10px]"
                      aria-label="Scale"
                    >
                      Scale
                    </ToggleGroupItem>
                  </ToggleGroup>
                </div>
              </div>
              <Tabs defaultValue="status" className="flex min-h-0 min-w-0 flex-1 flex-col">
                <TabsList className="h-8 w-full shrink-0 justify-start rounded-none border-b bg-muted/30 px-1">
                  <TabsTrigger value="status" className="text-[10px] h-6 px-2.5 flex items-center gap-1">
                    Status
                  </TabsTrigger>
                  <TabsTrigger value="properties" className="text-[10px] h-6 px-2.5">
                    Properties
                  </TabsTrigger>
                  <TabsTrigger value="lighting" className="text-[10px] h-6 px-2.5">
                    Lighting
                  </TabsTrigger>
                  <TabsTrigger value="placement" className="text-[10px] h-6 px-2.5">
                    Placement
                  </TabsTrigger>
                  <TabsTrigger value="texture" className="text-[10px] h-6 px-2.5">
                    Texture
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="status" className="mt-0 min-h-0 flex-1 overflow-hidden">
                  <SceneStatusPanel
                    stageName={stageName}
                    stageRoot={stageRoot}
                    selectedNode={selectedNode}
                    selectedPlacementIdx={selectedPlacementIdx}
                    placementEntry={selectedPlacementIdx !== null ? placementEntries[selectedPlacementIdx] : null}
                    drawStats={drawStats}
                    subModelCount={subModels.length}
                    textureCount={textureDataMap.size}
                  />
                </TabsContent>

                <TabsContent value="properties" className="mt-0 min-h-0 flex-1 space-y-2 overflow-auto p-2">
                  <StagePropertyEditor
                    selectedNodeId={selectedNodeId}
                    selectedNodeLabel={selectedNode?.label ?? null}
                    selectedNodeRole={selectedNode?.role ?? null}
                    transform={selectedTransform}
                    onTransformChange={handleTransformChange}
                  />
                </TabsContent>

                <TabsContent value="lighting" className="mt-0 min-h-0 flex-1 space-y-2 overflow-auto p-2">
                  <GraphicParamPanel
                    params={graphicParams}
                    onChange={handleGraphicParamChange}
                  />
                </TabsContent>

                <TabsContent value="placement" className="mt-0 min-h-0 flex-1 space-y-2 overflow-auto p-2">
                  <PlacementPanel
                    entries={placementEntries}
                    selectedIndex={selectedPlacementIdx}
                    onSelectEntry={handleSelectPlacement}
                    onEntryChange={handlePlacementChange}
                    onDuplicate={handleDuplicatePlacement}
                    duplicateDisabled={!canDuplicatePlacement}
                  />
                </TabsContent>

                <TabsContent value="texture" className="mt-0 min-h-0 flex-1 overflow-auto">
                  <TextureQualityPanel
                    quality={textureQuality}
                    onQualityChange={handleTextureQualityChange}
                    textureDataMap={textureDataMap}
                    isDecoding={textureProgress !== null}
                  />
                </TabsContent>
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

  children.push({
    id: "info",
    label: "info",
    role: "info",
  });

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
