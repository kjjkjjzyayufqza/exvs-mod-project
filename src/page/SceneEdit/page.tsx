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
import { ModelTextureSlotPanel } from "./components/ModelTextureSlotPanel";
import { ViewportContextMenu } from "./components/ViewportContextMenu";
import { useSceneKeyboard } from "./hooks/useSceneKeyboard";
import { useSceneEditorStore } from "./store/sceneEditorStore";
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
  } = useSceneTextureLoader(
    baseModel,
    subModels,
    sessionId,
    textureMaxDimension,
    textureSlotLoadEnabled,
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
        if (!entry) return prev;
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

  const updateStandaloneTransform = useCallback(
    (nodeId: string, t: TransformData) => {
      setStandaloneTransforms((prev) => {
        const next = new Map(prev);
        next.set(nodeId, t);
        return next;
      });
    },
    [],
  );

  const handleTransformChange = useCallback(
    (field: keyof TransformData, value: number) => {
      if (selectedNodeId === "base") {
        setBaseTransform((prev) => ({ ...prev, [field]: value }));
        return;
      }
      if (
        selectedNodeId &&
        selectedPlacementIdx === null &&
        subModels.some((s) => s.folderName === selectedNodeId)
      ) {
        setStandaloneTransforms((prev) => {
          const next = new Map(prev);
          const current = prev.get(selectedNodeId) ?? { ...DEFAULT_TRANSFORM };
          next.set(selectedNodeId, { ...current, [field]: value });
          return next;
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
    [selectedNodeId, selectedPlacementIdx, handlePlacementChange, subModels]
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

  const outlinerRoot = useMemo((): StageTreeNode | null => {
    if (!treeRoot) return null;
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
    return { ...treeRoot, children };
  }, [treeRoot, placementEntries]);

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

  const handleDeleteSelected = useCallback(() => {
    if (selectedPlacementIdx === null) return;
    setPlacementEntries((prev) => prev.filter((_, i) => i !== selectedPlacementIdx));
    setSelectedNodeIdRaw(null);
    setSelectedPlacementIdxRaw(null);
    setHasUnsavedChanges(true);
  }, [selectedPlacementIdx]);

  useSceneKeyboard({
    onDelete: handleDeleteSelected,
    onDuplicate: handleDuplicatePlacement,
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

  const selectedTransform: TransformData | null = isBaseSelected
    ? baseTransform
    : isStandaloneSubModel
      ? (standaloneTransforms.get(selectedNodeId!) ?? { ...DEFAULT_TRANSFORM })
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

  const canDuplicatePlacement =
    selectedPlacementIdx !== null &&
    placementEntries[selectedPlacementIdx]?.vdkType.toUpperCase() === "OBJECT";

  return (
    <TooltipProvider>
      <div className="flex h-full min-h-0 min-w-0 flex-col bg-background">
        <MapToolbar
          onOpenFolder={handleOpenFolder}
          onImportFhm2d={handleImportFhm2d}
          onExtractFhm2d={handleExtractFhm2d}
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
                  onDuplicate={() => handleDuplicatePlacement()}
                  onDelete={handleDeleteSelected}
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
              onDuplicateSelected={handleDuplicatePlacement}
              onDeleteSelected={handleDeleteSelected}
              hasSelection={selectedNodeId !== null}
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
                textureSlotLoadEnabled={textureSlotLoadEnabled}
                onDrawStatsChange={handleDrawStatsChange}
                graphicParams={graphicParams}
                baseTransform={baseTransform}
                onBaseTransformChange={setBaseTransform}
                standaloneTransforms={standaloneTransforms}
                onStandaloneTransformChange={updateStandaloneTransform}
                clickPickSelectionEnabled
                previewRenderStyle={scenePreviewRenderStyle}
                placementGizmoMode={placementGizmoMode}
                onPlacementGizmoFrame={schedulePlacementGizmo}
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
              <ScrollArea className="flex-1">
                {selectedTransform && (
                  <MayaSection
                    title={`Transform${selectedNode ? ` — ${selectedNode.label}` : ""}`}
                  >
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

                <MayaSection
                  title="Placement"
                  badge={placementEntries.length || undefined}
                >
                  <PlacementPanel
                    entries={placementEntries}
                    selectedIndex={selectedPlacementIdx}
                    onSelectEntry={handleSelectPlacement}
                    onEntryChange={handlePlacementChange}
                    onDuplicate={handleDuplicatePlacement}
                    duplicateDisabled={!canDuplicatePlacement}
                  />
                </MayaSection>

                {selectedPlacementIdx !== null && placementEntries[selectedPlacementIdx] && (
                  <MayaSection title="Object Config" defaultOpen>
                    <PlacementConfigPanel
                      entry={placementEntries[selectedPlacementIdx]}
                      placementHeader={placementHeader}
                    />
                  </MayaSection>
                )}

                <MayaSection
                  title="Lighting"
                  badge={graphicParams.length || undefined}
                  defaultOpen={false}
                >
                  <GraphicParamPanel
                    params={graphicParams}
                    onChange={handleGraphicParamChange}
                  />
                </MayaSection>

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

                {selectedNode && selectedNodeId && (() => {
                  const bundle = selectedNodeId === "base"
                    ? baseModel
                    : subModels.find((s) => s.folderName === selectedNodeId)?.bundle ?? null;
                  if (!bundle) return null;
                  return (
                    <MayaSection title="Model Textures" defaultOpen>
                      <ModelTextureSlotPanel
                        bundle={bundle}
                        textureDataMap={textureDataMap}
                        textureSlotLoadEnabled={textureSlotLoadEnabled}
                        onSlotToggle={handleTextureSlotToggle}
                        modelLabel={selectedNode.label}
                      />
                    </MayaSection>
                  );
                })()}

                <MayaSection title="Stats" defaultOpen={false}>
                  <SceneStatsContent
                    drawStats={drawStats}
                    subModelCount={subModels.length}
                    textureCount={textureDataMap.size}
                    stageName={stageName}
                  />
                </MayaSection>
              </ScrollArea>
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
