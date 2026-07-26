import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDefaultLayout } from "react-resizable-panels";
import { exists, readTextFile } from "@tauri-apps/plugin-fs";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { toast } from "sonner";

import { useIsKeepAliveRouteActive } from "@/layout/KeepAliveContext";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  SsbhModelPreviewProvider,
  SsbhModelPreviewViewport,
  useSsbhModelPreview,
} from "@/components/ssbh-model-preview/SsbhModelPreviewPanel";
import {
  DaeExportDialog,
  type DaeExportConfig,
  type DaeExportTarget,
} from "@/page/SceneEdit/components/DaeExportDialog";
import {
  buildUnitModelExportDialogState,
  exportUnitModelsAsFbx,
  filterUnitModelInstancesByLabel,
  getUnitModelExportCapabilities,
} from "./utils/unitModelExport";
import type { SsbhModelPreviewInstance } from "@/components/ssbh-model-preview/types";
import { UNIT_MODEL_EDIT_ROUTE_URL } from "./constants";
import { UnitModelHierarchyPanel } from "./components/UnitModelHierarchyPanel";
import { UnitModelPropertiesPanel } from "./components/UnitModelPropertiesPanel";
import { UnitModelRepackDialog } from "./components/UnitModelRepackDialog";
import { UnitModelExtractDialog } from "./components/UnitModelExtractDialog";
import { UnitModelTexturePanel } from "./components/UnitModelTexturePanel";
import { UnitModelToolbar } from "./components/UnitModelToolbar";
import { useUnitModelWorkspace } from "./hooks/useUnitModelWorkspace";
import {
  UNIT_MODEL_EDIT_DEFAULT_LAYOUT,
  UNIT_MODEL_EDIT_PANEL_IDS,
  UNIT_MODEL_EXPORT_DAE_FOLDER_DIALOG_PATH_KEY,
  UNIT_MODEL_HIERARCHY_TAB_BADGE,
  UNIT_MODEL_HIERARCHY_TAB_TRIGGER,
  UNIT_MODEL_HIERARCHY_TABS_LIST,
} from "./utils/unitModelEditorSettings";
import {
  listUnitModelTextures,
  syncUnitModelTextureContainers,
  unitTextureToManagerEntry,
} from "./utils/unitModelTextureService";
import type { TextureManagerEntry } from "@/page/SceneEdit/store/sceneTextureManagerStore";
import { NumatbTextureOptionsProvider } from "@/components/ssbh-model-preview/numatbTextureOptionsContext";
import { getParentDir, inferUnitModelStructurePath } from "./utils/unitModelRepackService";
import { rememberStoredDialogSelection } from "@/utils/dialogDefaultPathStore";
import { normalizeComparePath, resolveUnitModelNodeAbsPath } from "./utils/unitModelNodePaths";
import { listUnitModelDiskModelNames } from "./utils/unitModelDiskModels";
import {
  buildUnitModelStructureTree,
  collectModelGroupNames,
  mergeShlModelFolderNames,
  type UnitModelTreeNode,
} from "./utils/unitModelStructureTree";
import { useSsbhFileEditorSessions } from "@/components/ssbh-model-preview/useSsbhFileEditorSessions";
import { SsbhFileEditorHosts } from "@/components/ssbh-model-preview/SsbhFileEditorHosts";

function UnitModelEditWorkspace({
  unitRoot,
  onUnitRootChange,
  structureJson,
  onStructureMutated,
  setModelImportViewportSuspend,
}: {
  unitRoot: string | null;
  onUnitRootChange: (path: string | null) => void;
  structureJson: unknown | null;
  onStructureMutated: () => void;
  setModelImportViewportSuspend: (suspended: boolean) => void;
}) {
  const previewReloadTimer = useRef<number | null>(null);

  const clearPreviewReloadTimer = useCallback(() => {
    if (previewReloadTimer.current !== null) {
      window.clearTimeout(previewReloadTimer.current);
      previewReloadTimer.current = null;
    }
  }, []);

  const workspace = useUnitModelWorkspace(unitRoot, onUnitRootChange, {
    clearScheduledPreviewReload: clearPreviewReloadTimer,
  });
  const preview = useSsbhModelPreview();
  const [daeExportDialog, setDaeExportDialog] = useState<{
    open: boolean;
    targets: DaeExportTarget[];
  }>({ open: false, targets: [] });
  const [leftTab, setLeftTab] = useState<"structure" | "textures">("structure");
  const [textureCount, setTextureCount] = useState(0);
  // Package nutexb pool fed to the NUMATB texture-path picker (DAE/FBX to SSBH flows),
  // so its dropdown lists this Unit model's textures instead of "No scene textures yet".
  const [textureManagerEntries, setTextureManagerEntries] = useState<TextureManagerEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (!workspace.activeRoot || !workspace.structurePath) {
      setTextureCount(0);
      setTextureManagerEntries([]);
      return;
    }
    void listUnitModelTextures(workspace.activeRoot, workspace.structurePath)
      .then((inventory) => {
        if (cancelled) return;
        setTextureCount(inventory.textures.length);
        setTextureManagerEntries(inventory.textures.map(unitTextureToManagerEntry));
      })
      .catch(() => {
        if (cancelled) return;
        setTextureCount(0);
        setTextureManagerEntries([]);
      });
    return () => {
      cancelled = true;
    };
  }, [workspace.activeRoot, workspace.structurePath, structureJson]);

  useEffect(() => {
    const onTexturesChanged = () => {
      if (!workspace.activeRoot || !workspace.structurePath) return;
      void listUnitModelTextures(workspace.activeRoot, workspace.structurePath)
        .then((inventory) => {
          setTextureCount(inventory.textures.length);
          setTextureManagerEntries(inventory.textures.map(unitTextureToManagerEntry));
        })
        .catch(() => {
          setTextureCount(0);
          setTextureManagerEntries([]);
        });
    };
    window.addEventListener("unit-model-textures-changed", onTexturesChanged);
    return () => window.removeEventListener("unit-model-textures-changed", onTexturesChanged);
  }, [workspace.activeRoot, workspace.structurePath]);

  const numatbTextureOptions = useMemo(
    () => ({ entries: textureManagerEntries, recentEntryIds: [] as string[] }),
    [textureManagerEntries],
  );

  // --- SSBH file editing (numatb / numdlb / nuhlpb / jnttbl) ------------------
  const [modifiedPaths, setModifiedPaths] = useState<Set<string>>(new Set());
  const [focusTextureFilename, setFocusTextureFilename] = useState<string | null>(null);

  // Clear "modified this session" markers when the workspace root changes.
  useEffect(() => {
    setModifiedPaths(new Set());
  }, [workspace.activeRoot]);

  useEffect(
    () => () => {
      clearPreviewReloadTimer();
    },
    [clearPreviewReloadTimer],
  );

  // Normalized key of the `_structure.json` directory; node fileUrls are relative to it.
  const structureDirKey = useMemo(
    () => (workspace.structurePath ? normalizeComparePath(getParentDir(workspace.structurePath)) : null),
    [workspace.structurePath],
  );

  const toRelKey = useCallback(
    (absPath: string): string | null => {
      if (!structureDirKey) return null;
      const key = normalizeComparePath(absPath);
      const prefix = `${structureDirKey}/`;
      return key.startsWith(prefix) ? key.slice(prefix.length) : null;
    },
    [structureDirKey],
  );

  const schedulePreviewReload = useCallback(() => {
    const root = workspace.activeRoot;
    if (!root || preview.loading) return;
    setModelImportViewportSuspend(false);
    clearPreviewReloadTimer();
    previewReloadTimer.current = window.setTimeout(() => {
      previewReloadTimer.current = null;
      if (preview.loading) return;
      void (async () => {
        try {
          await preview.loadModelAt(root);
          preview.requestCameraFit();
        } catch (error) {
          console.error("Failed to reload unit model preview after package mutation", error);
          toast.error("Preview reload failed", { description: String(error) });
        }
      })();
    }, 200);
  }, [clearPreviewReloadTimer, preview, workspace.activeRoot, setModelImportViewportSuspend]);

  const handleStructureMutated = useCallback(() => {
    onStructureMutated();
    workspace.markValidationStale();
    schedulePreviewReload();
  }, [onStructureMutated, workspace.markValidationStale, schedulePreviewReload]);

  const handleEditorSaved = useCallback(
    (savedAbsPath: string) => {
      const rel = toRelKey(savedAbsPath);
      if (rel) {
        setModifiedPaths((prev) => {
          if (prev.has(rel)) return prev;
          const next = new Set(prev);
          next.add(rel);
          return next;
        });
      }
      const lower = savedAbsPath.toLowerCase();
      if (lower.endsWith(".numatb")) {
        void (async () => {
          try {
            if (workspace.activeRoot && workspace.structurePath) {
              const result = await syncUnitModelTextureContainers(
                workspace.activeRoot,
                workspace.structurePath,
              );
              if (result.changed) {
                handleStructureMutated();
                return;
              }
            }
          } catch (error) {
            console.error("Failed to auto-sync unit model texture containers", error);
            toast.error("Auto-fix failed", { description: String(error) });
          }
          schedulePreviewReload();
          workspace.markValidationStale();
        })();
      } else if (lower.endsWith(".numdlb")) {
        // Material / model-mapping edits change what the preview renders.
        schedulePreviewReload();
        workspace.markValidationStale();
      }
    },
    [
      handleStructureMutated,
      schedulePreviewReload,
      toRelKey,
      workspace.activeRoot,
      workspace.markValidationStale,
      workspace.structurePath,
    ],
  );

  const editors = useSsbhFileEditorSessions({ onSaved: handleEditorSaved });

  // Editor `editingPaths` are absolute; the tree compares relative fileUrls.
  const editingRelPaths = useMemo(() => {
    const set = new Set<string>();
    for (const abs of editors.editingPaths) {
      const rel = toRelKey(abs);
      if (rel) set.add(rel);
    }
    return set;
  }, [editors.editingPaths, toRelKey]);

  const structureModelNames = useMemo(() => {
    if (structureJson == null) return [];
    try {
      return collectModelGroupNames(buildUnitModelStructureTree(structureJson).root);
    } catch {
      return [];
    }
  }, [structureJson]);

  const [diskModelNames, setDiskModelNames] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (!workspace.activeRoot) {
      setDiskModelNames([]);
      return;
    }
    void listUnitModelDiskModelNames(workspace.activeRoot)
      .then((names) => {
        if (!cancelled) setDiskModelNames(names);
      })
      .catch(() => {
        if (!cancelled) setDiskModelNames([]);
      });
    return () => {
      cancelled = true;
    };
  }, [workspace.activeRoot, structureJson]);

  // Structure order defines `folder_index`; append disk-only models so SHL can target new folders.
  const shlModelFolderNames = useMemo(() => {
    const merged = mergeShlModelFolderNames(structureModelNames, diskModelNames);
    return merged.length > 0 ? merged : undefined;
  }, [structureModelNames, diskModelNames]);

  const handleOpenEditor = useCallback(
    (node: UnitModelTreeNode) => {
      if (!workspace.structurePath || !node.fileUrl) return;
      const abs = resolveUnitModelNodeAbsPath(workspace.structurePath, node.fileUrl);
      if (!editors.openEditorForPath(abs)) {
        toast.message(`No editor available for ${node.label}`);
      }
    },
    [workspace.structurePath, editors],
  );

  const handleRevealNode = useCallback(
    (node: UnitModelTreeNode) => {
      if (!workspace.structurePath || !node.fileUrl) return;
      void revealItemInDir(resolveUnitModelNodeAbsPath(workspace.structurePath, node.fileUrl));
    },
    [workspace.structurePath],
  );

  const handleCopyNodePath = useCallback(
    (node: UnitModelTreeNode) => {
      if (!workspace.structurePath || !node.fileUrl) return;
      void writeText(resolveUnitModelNodeAbsPath(workspace.structurePath, node.fileUrl)).then(
        () => toast.success("Copied path"),
        (error) => toast.error("Failed to copy path", { description: String(error) }),
      );
    },
    [workspace.structurePath],
  );

  const handleShowTextureInPanel = useCallback((node: UnitModelTreeNode) => {
    const ref = node.fileUrl ?? node.label;
    const name = ref.replace(/\\/g, "/").split("/").pop() ?? node.label;
    setLeftTab("textures");
    setFocusTextureFilename(name);
  }, []);

  const handleOpenReferencingNumatb = useCallback(
    (numatbBasename: string) => {
      if (!workspace.structurePath || structureJson == null) return;
      let tree: ReturnType<typeof buildUnitModelStructureTree> | null = null;
      try {
        tree = buildUnitModelStructureTree(structureJson);
      } catch {
        tree = null;
      }
      if (!tree) return;
      const target = numatbBasename.toLowerCase();
      const stack: UnitModelTreeNode[] = [tree.root];
      let foundUrl: string | null = null;
      while (stack.length > 0) {
        const n = stack.pop()!;
        if (n.kind === "item" && n.fileUrl) {
          const base = (n.fileUrl.replace(/\\/g, "/").split("/").pop() ?? "").toLowerCase();
          if (base === target) {
            foundUrl = n.fileUrl;
            break;
          }
        }
        for (const c of n.children ?? []) stack.push(c);
      }
      if (foundUrl) {
        editors.openEditorForPath(resolveUnitModelNodeAbsPath(workspace.structurePath, foundUrl));
      } else {
        toast.message(`Could not locate "${numatbBasename}" in the structure`);
      }
    },
    [workspace.structurePath, structureJson, editors],
  );
  const { defaultLayout: persistedLayout, onLayoutChanged } = useDefaultLayout({
    id: "unit-model-edit-layout",
    panelIds: [...UNIT_MODEL_EDIT_PANEL_IDS],
    storage: globalThis.localStorage,
  });

  const unitEditLayout = useMemo(
    () => persistedLayout ?? UNIT_MODEL_EDIT_DEFAULT_LAYOUT,
    [persistedLayout],
  );

  const exportCapabilities = useMemo(
    () => getUnitModelExportCapabilities(preview.previewInstances),
    [preview.previewInstances],
  );
  const canExportModels = exportCapabilities.canExport;

  const daeExportDialogSubtitle = useMemo(() => {
    if (daeExportDialog.targets.length === 1) {
      return daeExportDialog.targets[0]?.name ?? "Loaded model";
    }
    return `${daeExportDialog.targets.length} loaded models`;
  }, [daeExportDialog.targets]);

  const daeExportDialogSummary = useMemo(() => {
    return (
      <p className="text-muted-foreground">
        <span className="font-medium text-foreground">{daeExportDialog.targets.length}</span> loaded model
        {daeExportDialog.targets.length > 1 ? "s" : ""} ready for FBX export
      </p>
    );
  }, [daeExportDialog.targets.length]);

  const openDaeExportDialogForInstances = useCallback(
    (instances: readonly SsbhModelPreviewInstance[]) => {
      const payload = buildUnitModelExportDialogState(instances);
      if (!payload) {
        toast.error("No disk-backed SSBH models can be exported");
        return;
      }
      if (payload.skipped.length > 0) {
        const labels = payload.skipped.map((entry) => entry.label).slice(0, 3);
        const suffix =
          payload.skipped.length > labels.length ? ` (+${payload.skipped.length - labels.length} more)` : "";
        toast.message(`Skipping ${payload.skipped.length} non-disk instance(s)`, {
          description: `${labels.join(", ")}${suffix}`,
        });
      }
      setDaeExportDialog({
        open: true,
        targets: payload.targets,
      });
    },
    [],
  );

  const openDaeExportDialog = useCallback(() => {
    openDaeExportDialogForInstances(preview.previewInstances);
  }, [openDaeExportDialogForInstances, preview.previewInstances]);

  const openSingleModelExportDialog = useCallback(
    (modelLabel: string) => {
      const filtered = filterUnitModelInstancesByLabel(preview.previewInstances, modelLabel);
      if (filtered.length === 0) {
        toast.error(`Model "${modelLabel}" is not loaded in the preview`);
        return;
      }
      openDaeExportDialogForInstances(filtered);
    },
    [openDaeExportDialogForInstances, preview.previewInstances],
  );

  const handleDaeExport = useCallback(
    async (config: DaeExportConfig) => {
      const { targets } = daeExportDialog;
      setDaeExportDialog((prev) => ({ ...prev, open: false }));
      toast.loading("Exporting loaded models...", { id: "unit-model-export" });

      try {
        const outputDir = config.outputDirectory;
        const entries = targets.flatMap((target) =>
          target.rootPath
            ? [{ rootPath: target.rootPath, outputName: target.name }]
            : [],
        );
        if (entries.length === 0) {
          throw new Error("No disk-backed SSBH models are available for FBX export");
        }
        const result = await exportUnitModelsAsFbx(entries, outputDir, {
          scaleFactor: config.scaleFactor,
          upAxis: config.upAxis,
          exportTextures: config.exportTextures,
        });
        if (result.totalFailed > 0) {
          toast.warning(`Exported ${result.totalExported}, failed ${result.totalFailed}`, {
            description: result.errors.slice(0, 3).join("\n"),
          });
        } else {
          toast.success(
            `Exported ${result.totalExported} FBX file${result.totalExported === 1 ? "" : "s"}`,
          );
        }

        await rememberStoredDialogSelection(
          UNIT_MODEL_EXPORT_DAE_FOLDER_DIALOG_PATH_KEY,
          outputDir,
          "directory",
        );
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to export model");
      } finally {
        toast.dismiss("unit-model-export");
      }
    },
    [daeExportDialog],
  );

  return (
    <NumatbTextureOptionsProvider value={numatbTextureOptions}>
      <UnitModelToolbar
        folderName={workspace.folderName}
        statusLabel={workspace.statusLabel}
        hasErrors={workspace.hasErrors}
        validationValid={Boolean(workspace.validation?.valid)}
        isValidating={workspace.isValidating}
        busy={workspace.busy}
        canUseLoadedRoot={Boolean(workspace.loadedRoot)}
        canOperateOnRoot={Boolean(workspace.activeRoot)}
        canExportModels={canExportModels}
        onOpenFolder={() => void workspace.pickUnitFolder()}
        onExtractFhm2d={() => workspace.openExtractDialog()}
        onUseLoadedRoot={workspace.useLoadedRoot}
        onValidate={() => void workspace.runValidation()}
        onRepack={workspace.openRepackDialog}
        onCopyReviewPayload={() => void workspace.copyReviewPayload()}
        onExportModels={openDaeExportDialog}
        showGrid={preview.showGrid}
        showAxes={preview.showAxesGizmo}
        wireframe={preview.wireframe}
        showStats={preview.showStats}
        onToggleGrid={() => preview.setShowGrid(!preview.showGrid)}
        onToggleAxes={() => preview.setShowAxesGizmo(!preview.showAxesGizmo)}
        onToggleWireframe={() => preview.setWireframe(!preview.wireframe)}
        onToggleStats={() => preview.setShowStats(!preview.showStats)}
        onResetCamera={() => preview.requestCameraFit()}
      />

      <ResizablePanelGroup
        id="unit-model-edit-layout"
        orientation="horizontal"
        className="flex min-h-0 min-w-0 flex-1"
        defaultLayout={unitEditLayout}
        onLayoutChanged={onLayoutChanged}
        resizeTargetMinimumSize={{ fine: 16, coarse: 24 }}
      >
        <ResizablePanel
          id="unit-model-hierarchy"
          defaultSize="20%"
          minSize="10%"
          maxSize="50%"
          className="min-w-0"
        >
          <div className="flex h-full min-w-0 flex-col overflow-hidden border-r">
            <Tabs
              value={leftTab}
              onValueChange={(value) => setLeftTab(value as "structure" | "textures")}
              className="flex h-full flex-col"
            >
              <TabsList className={UNIT_MODEL_HIERARCHY_TABS_LIST}>
                <TabsTrigger value="structure" className={UNIT_MODEL_HIERARCHY_TAB_TRIGGER}>
                  Structure
                </TabsTrigger>
                <TabsTrigger value="textures" className={UNIT_MODEL_HIERARCHY_TAB_TRIGGER}>
                  Textures
                  {textureCount > 0 ? (
                    <span className={UNIT_MODEL_HIERARCHY_TAB_BADGE}>{textureCount}</span>
                  ) : null}
                </TabsTrigger>
              </TabsList>
              <TabsContent value="structure" className="mt-0 min-h-0 flex-1 overflow-hidden">
                <UnitModelHierarchyPanel
                  structureJson={structureJson}
                  structureJsonPath={workspace.structurePath}
                  modelRoot={workspace.activeRoot}
                  onMutated={handleStructureMutated}
                  onOpenEditor={handleOpenEditor}
                  onRevealNode={handleRevealNode}
                  onCopyNodePath={handleCopyNodePath}
                  onShowTextureInPanel={handleShowTextureInPanel}
                  onModelImportViewportSuspendChange={setModelImportViewportSuspend}
                  onExportModel={openSingleModelExportDialog}
                  editingPaths={editingRelPaths}
                  modifiedPaths={modifiedPaths}
                />
              </TabsContent>
              <TabsContent value="textures" className="mt-0 min-h-0 flex-1 overflow-hidden">
                <UnitModelTexturePanel
                  unitRoot={workspace.activeRoot}
                  embedded
                  focusTextureFilename={leftTab === "textures" ? focusTextureFilename : null}
                  onOpenReferencingNumatb={handleOpenReferencingNumatb}
                />
              </TabsContent>
            </Tabs>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle className="relative z-30 w-1.5 shrink-0 bg-border/20 hover:bg-primary/25" />

        <ResizablePanel
          id="unit-model-viewport"
          defaultSize="60%"
          minSize="35%"
          maxSize="80%"
          className="relative z-0 min-w-0"
        >
          <div className="relative h-full min-h-0 min-w-0 overflow-hidden bg-muted/20">
            <SsbhModelPreviewViewport />
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle className="relative z-30 w-1.5 shrink-0 bg-border/20 hover:bg-primary/25" />

        <ResizablePanel
          id="unit-model-properties"
          defaultSize="20%"
          minSize="10%"
          maxSize="50%"
          className="relative z-20 min-w-0 overflow-hidden"
        >
          <UnitModelPropertiesPanel
            unitRoot={workspace.activeRoot}
            structurePath={workspace.structurePath}
            obModPath={workspace.obModPath}
            validation={workspace.validation}
            lastRepack={workspace.lastRepack}
            onValidate={() => void workspace.runValidation()}
            onOpenOutput={() => void workspace.openOutputInExplorer()}
            isValidating={workspace.isValidating}
          />
        </ResizablePanel>
      </ResizablePanelGroup>

      <DaeExportDialog
        open={daeExportDialog.open}
        targets={daeExportDialog.targets}
        outputDialogPathKey={UNIT_MODEL_EXPORT_DAE_FOLDER_DIALOG_PATH_KEY}
        subtitle={daeExportDialogSubtitle}
        summaryContent={daeExportDialogSummary}
        formatHint="FBX is exported directly from disk SSBH data in bind pose."
        availableFormats={["fbx"]}
        defaultExportTextures
        onExport={(config) => void handleDaeExport(config)}
        onCancel={() => setDaeExportDialog((prev) => ({ ...prev, open: false }))}
      />

      <UnitModelRepackDialog
        open={workspace.repackDialogOpen}
        onOpenChange={workspace.setRepackDialogOpen}
        modelRoot={workspace.activeRoot}
        structurePath={workspace.structurePath}
        modFolder={workspace.obModPath}
        folderName={workspace.folderName}
        validation={workspace.validation}
        isValidating={workspace.isValidating}
        onValidationResult={workspace.acceptValidationResult}
        onRepacked={workspace.setLastRepack}
      />

      <UnitModelExtractDialog
        open={workspace.extractDialogOpen}
        onOpenChange={workspace.setExtractDialogOpen}
        onExtracted={(result) => workspace.handleExtracted(result)}
      />

      <SsbhFileEditorHosts {...editors.hostProps} shlModelFolderNames={shlModelFolderNames} />
    </NumatbTextureOptionsProvider>
  );
}

export default function UnitModelEdit() {
  const [unitRoot, setUnitRoot] = useState<string | null>(null);
  const [structureJson, setStructureJson] = useState<unknown | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [modelImportViewportSuspend, setModelImportViewportSuspend] = useState(false);
  const isPageActive = useIsKeepAliveRouteActive(UNIT_MODEL_EDIT_ROUTE_URL);

  useEffect(() => {
    let cancelled = false;
    if (!unitRoot) {
      setStructureJson(null);
      return;
    }
    (async () => {
      try {
        const path = inferUnitModelStructurePath(unitRoot);
        if (!(await exists(path))) {
          if (!cancelled) setStructureJson(null);
          return;
        }
        const raw = await readTextFile(path);
        const parsed = JSON.parse(raw);
        if (!cancelled) setStructureJson(parsed);
      } catch (error) {
        console.error("Failed to load unit-model structure JSON", error);
        if (!cancelled) setStructureJson(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [unitRoot, reloadTick]);

  const previewSuspended = !isPageActive || modelImportViewportSuspend;

  return (
    <SsbhModelPreviewProvider
      workspaceRoot={unitRoot}
      previewSuspended={previewSuspended}
      defaultLightingPreset="softCharacter"
    >
      <TooltipProvider>
        <div className="flex h-full min-h-0 min-w-0 flex-col bg-background">
          <UnitModelEditWorkspace
            unitRoot={unitRoot}
            onUnitRootChange={setUnitRoot}
            structureJson={structureJson}
            onStructureMutated={() => setReloadTick((t) => t + 1)}
            setModelImportViewportSuspend={setModelImportViewportSuspend}
          />
        </div>
      </TooltipProvider>
    </SsbhModelPreviewProvider>
  );
}
