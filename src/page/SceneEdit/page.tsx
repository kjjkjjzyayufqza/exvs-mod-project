import { useState, useCallback, useRef, useTransition, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { toast } from "sonner";

import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { TooltipProvider } from "@/components/ui/tooltip";

import { MapToolbar } from "./components/MapToolbar";
import {
  StageHierarchyTree,
  type StageTreeNode,
} from "./components/StageHierarchyTree";
import {
  MapViewport,
  type MapViewportHandle,
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
  StageRenamePreviewDialog,
  type VirtualTreeFolder,
} from "./components/StageRenamePreviewDialog";
import {
  StageImportProgressDialog,
  type ImportStep,
} from "./components/StageImportProgressDialog";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

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

export default function SceneEdit() {
  const viewportRef = useRef<MapViewportHandle>(null);
  const [, startTransition] = useTransition();

  const [stageName, setStageName] = useState<string | null>(null);
  const [stageRoot, setStageRoot] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

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
  const [renamePreview, setRenamePreview] = useState<{
    folders: VirtualTreeFolder[];
    warnings: string[];
    bundle: StageBundleResponse;
    sourceName: string;
  } | null>(null);

  const [importProgress, setImportProgress] = useState<{
    open: boolean;
    progress: number;
    steps: ImportStep[];
  }>({ open: false, progress: 0, steps: [] });

  const INITIAL_STEPS: ImportStep[] = [
    { step: "read", label: "Reading file...", status: "pending" },
    { step: "extract", label: "Decompressing FHM2D...", status: "pending" },
    { step: "rename", label: "Analyzing folder structure...", status: "pending" },
    { step: "csv", label: "Parsing stage data...", status: "pending" },
    { step: "models", label: "Building model previews...", status: "pending" },
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

  const handleSelectNode = useCallback(
    (id: string | null) => {
      setSelectedNodeIdRaw(id);
      if (!id) {
        setSelectedPlacementIdxRaw(null);
        return;
      }
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
      if (entry?.vdkType.toUpperCase() === "OBJECT" && entry.objectNumber !== null) {
        const sub = subModels.find((s) => s.objectIndex === entry.objectNumber);
        if (sub) {
          setSelectedNodeIdRaw(sub.folderName);
          return;
        }
      }
    },
    [subModels, placementEntries]
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
        setPlacementHeader(bundle.placementHeader);
        const colMap: Record<string, number> = {};
        bundle.placementHeader.forEach((h, i) => {
          colMap[h.toUpperCase()] = i;
        });
        setPlacementColMap(colMap);
        setPlacementEntries(
          bundle.placementEntries.map((e) => ({
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
          }))
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
    setStageName(null);
    setIsMemoryImport(false);
    setBaseModel(null);
    setSubModels([]);
    setGraphicParams([]);
    setPlacementHeader([]);
    setPlacementEntries([]);
    setTreeRoot(null);
  }, []);

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
      resetState();
      setImportProgress({
        open: true,
        progress: 0,
        steps: INITIAL_STEPS.map((s) => ({ ...s })),
      });

      const result = await invoke<{
        bundle: StageBundleResponse;
        virtualTree: VirtualTreeFolder[];
        warnings: string[];
      }>("import_stage_fhm2d_in_memory", { sourcePath: selected });

      setImportProgress((prev) => ({ ...prev, open: false }));

      const sourceName = selected
        .split(/[/\\]/)
        .filter(Boolean)
        .pop()
        ?.replace(/\.fhm2d$/i, "") ?? "stage";

      setRenamePreview({
        folders: result.virtualTree,
        warnings: result.warnings,
        bundle: result.bundle,
        sourceName,
      });
    } catch (err: any) {
      setImportProgress((prev) => ({ ...prev, open: false }));
      toast.error("FHM2D import failed", { description: String(err) });
    } finally {
      setIsLoading(false);
    }
  }, [resetState]);

  const handleRenameConfirm = useCallback(() => {
    if (!renamePreview) return;
    const { bundle, sourceName } = renamePreview;
    setIsMemoryImport(true);
    applyBundle(bundle.rootPath, bundle);
    setStageName(sourceName);
    setRenamePreview(null);
  }, [renamePreview, applyBundle]);

  const handleRenameCancel = useCallback(() => {
    setRenamePreview(null);
  }, []);

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
      const fieldToCol: Record<string, string> = {
        posX: "VDK_POS_X",
        posY: "VDK_POS_Y",
        posZ: "VDK_POS_Z",
        rotX: "VDK_ROT_X",
        rotY: "VDK_ROT_Y",
        rotZ: "VDK_ROT_Z",
        scaleX: "VDK_SCALE_X",
        scaleY: "VDK_SCALE_Y",
        scaleZ: "VDK_SCALE_Z",
      };
      setPlacementEntries((prev) => {
        const next = [...prev];
        const entry = { ...next[index], [field]: value };
        const colName = fieldToCol[field];
        if (colName) {
          const colIdx = placementColMap[colName];
          if (colIdx !== undefined && entry.rawFields.length > colIdx) {
            const updatedRaw = [...entry.rawFields];
            updatedRaw[colIdx] = String(value);
            entry.rawFields = updatedRaw;
          }
        }
        next[index] = entry;
        return next;
      });
    },
    [placementColMap]
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

  const selectedNode = findNode(treeRoot, selectedNodeId);
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

  return (
    <TooltipProvider>
      <div className="h-full flex flex-col">
        <MapToolbar
          onOpenFolder={handleOpenFolder}
          onImportFhm2d={handleImportFhm2d}
          onSave={handleSave}
          canSave={!!stageName && !isMemoryImport}
          stageName={stageName}
          isLoading={isLoading}
          showGrid={showGrid}
          showAxes={showAxes}
          wireframe={wireframe}
          onToggleGrid={() => setShowGrid((v) => !v)}
          onToggleAxes={() => setShowAxes((v) => !v)}
          onToggleWireframe={() => setWireframe((v) => !v)}
          onResetCamera={() => viewportRef.current?.resetCamera()}
        />
        <ResizablePanelGroup
          direction="horizontal"
          className="flex-1 min-h-0 rounded-lg border bg-card shadow-sm"
        >
          <ResizablePanel defaultSize={20} minSize={15}>
            <div className="h-full flex flex-col">
              <div className="text-xs font-medium px-3 py-2 border-b bg-muted/40 text-muted-foreground uppercase tracking-wider">
                Hierarchy
              </div>
              <div className="flex-1 min-h-0 overflow-hidden">
                <StageHierarchyTree
                  root={treeRoot}
                  selectedId={selectedNodeId}
                  onSelect={handleSelectNode}
                />
              </div>
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle className="w-1 bg-border hover:bg-primary/20 transition-colors" />

          <ResizablePanel defaultSize={55} minSize={30}>
            <div className="h-full min-h-0">
              <MapViewport
                ref={viewportRef}
                baseModel={baseModel}
                subModels={subModels}
                placementEntries={placementEntries}
                showGrid={showGrid}
                showAxes={showAxes}
                wireframe={wireframe}
                selectedNodeId={selectedNodeId}
                onSelectNode={handleSelectNode}
              />
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle className="w-1 bg-border hover:bg-primary/20 transition-colors" />

          <ResizablePanel defaultSize={25} minSize={15}>
            <div className="h-full flex flex-col">
              <div className="text-xs font-medium px-3 py-2 border-b bg-muted/40 text-muted-foreground uppercase tracking-wider">
                Properties
              </div>
              <div className="flex-1 min-h-0 overflow-auto p-2 space-y-2">
                <StagePropertyEditor
                  selectedNodeId={selectedNodeId}
                  selectedNodeLabel={selectedNode?.label ?? null}
                  selectedNodeRole={selectedNode?.role ?? null}
                  transform={selectedTransform}
                  onTransformChange={handleTransformChange}
                />
                <GraphicParamPanel
                  params={graphicParams}
                  onChange={handleGraphicParamChange}
                />
                <PlacementPanel
                  entries={placementEntries}
                  selectedIndex={selectedPlacementIdx}
                  onSelectEntry={handleSelectPlacement}
                  onEntryChange={handlePlacementChange}
                />
              </div>
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
          folders={renamePreview?.folders ?? []}
          warnings={renamePreview?.warnings ?? []}
          onConfirm={handleRenameConfirm}
          onCancel={handleRenameCancel}
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
