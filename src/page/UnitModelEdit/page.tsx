import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDefaultLayout } from "react-resizable-panels";
import { exists, readTextFile } from "@tauri-apps/plugin-fs";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

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
  buildUnitModelDiskExportDialogState,
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
import { UnitModelWeaponIconPanel } from "./components/UnitModelWeaponIconPanel";
import { UnitModelToolbar } from "./components/UnitModelToolbar";
import { ExvsCommonBundleDialog } from "./components/ExvsCommonBundleDialog";
import { ExvsCommonRepackDialog } from "./components/ExvsCommonRepackDialog";
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
import { isWeaponIconFileUrl, listUnitModelWeaponIcons } from "./utils/unitModelWeaponIconService";
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
import {
  isExvsCommonStructure,
  saveExvsCommonShl,
  syncExvsCommonTextureContainers,
} from "./utils/exvsCommonService";

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
  const { t } = useTranslation("unit-weapon-page");
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
  const isExvsCommon = isExvsCommonStructure(structureJson);
  const preview = useSsbhModelPreview();
  const [daeExportDialog, setDaeExportDialog] = useState<{
    open: boolean;
    targets: DaeExportTarget[];
  }>({ open: false, targets: [] });
  const [leftTab, setLeftTab] = useState<"structure" | "textures" | "icons">("structure");
  const [commonDialogOpen, setCommonDialogOpen] = useState(false);
  const [textureCount, setTextureCount] = useState(0);
  const [weaponIconCount, setWeaponIconCount] = useState(0);
  // Package nutexb pool fed to the NUMATB texture-path picker (DAE/FBX to SSBH flows),
  // so its dropdown lists this Unit model's textures instead of "No scene textures yet".
  const [textureManagerEntries, setTextureManagerEntries] = useState<TextureManagerEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (!workspace.activeRoot || !workspace.structurePath) {
      setTextureCount(0);
      setWeaponIconCount(0);
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
    void listUnitModelWeaponIcons(workspace.activeRoot, workspace.structurePath)
      .then((inventory) => {
        if (cancelled) return;
        setWeaponIconCount(inventory.icons.length);
      })
      .catch(() => {
        if (cancelled) return;
        setWeaponIconCount(0);
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
      void listUnitModelWeaponIcons(workspace.activeRoot, workspace.structurePath)
        .then((inventory) => {
          setWeaponIconCount(inventory.icons.length);
        })
        .catch(() => {
          setWeaponIconCount(0);
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
  const [focusWeaponIconFilename, setFocusWeaponIconFilename] = useState<string | null>(null);

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
          toast.error(t("errors.previewReload"), { description: String(error) });
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
              const changed = isExvsCommon
                ? await syncExvsCommonTextureContainers({
                    modelRoot: workspace.activeRoot,
                    structureJsonPath: workspace.structurePath,
                  })
                : (
                    await syncUnitModelTextureContainers(
                      workspace.activeRoot,
                      workspace.structurePath,
                    )
                  ).changed;
              if (changed) {
                handleStructureMutated();
                return;
              }
            }
          } catch (error) {
            console.error("Failed to auto-sync unit model texture containers", error);
            toast.error(t("errors.autoFix"), { description: String(error) });
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
      isExvsCommon,
    ],
  );

  const editors = useSsbhFileEditorSessions({
    onSaved: handleEditorSaved,
    allowBodylessShl: isExvsCommon,
    writeShl:
      isExvsCommon && workspace.activeRoot && workspace.structurePath
        ? async (_filePath, shl) => {
            await saveExvsCommonShl({
              modelRoot: workspace.activeRoot!,
              structureJsonPath: workspace.structurePath!,
              shl,
            });
          }
        : undefined,
  });

  // Editor `editingPaths` are absolute; the tree compares relative fileUrls.
  const editingRelPaths = useMemo(() => {
    const set = new Set<string>();
    for (const abs of editors.editingPaths) {
      const rel = toRelKey(abs);
      if (rel) set.add(rel);
    }
    return set;
  }, [editors.editingPaths, toRelKey]);

  // SHL `folder_index` is the DFS order of model-group folders in `_structure.json`
  // (not Windows/models directory enumeration order).
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
    // Disk list is only for models not yet registered in structure JSON.
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

  // Authoritative order: structure JSON. Append disk-only folder names (same identity
  // key: models/<folder>) so newly dropped folders can still be selected in SHL.
  const shlModelFolderNames = useMemo(() => {
    if (structureModelNames.length > 0) {
      return mergeShlModelFolderNames(structureModelNames, diskModelNames);
    }
    // No structure model groups yet — best-effort disk folder names only.
    return diskModelNames.length > 0 ? diskModelNames : undefined;
  }, [structureModelNames, diskModelNames]);

  const handleOpenEditor = useCallback(
    (node: UnitModelTreeNode) => {
      if (!workspace.structurePath || !node.fileUrl) return;
      const abs = resolveUnitModelNodeAbsPath(workspace.structurePath, node.fileUrl);
      if (!editors.openEditorForPath(abs)) {
        toast.message(t("errors.noEditor", { name: node.label }));
      }
    },
    [workspace.structurePath, editors, t],
  );

  const handleRevealNode = useCallback(
    (node: UnitModelTreeNode) => {
      if (!workspace.structurePath || !node.fileUrl) return;
      const abs = resolveUnitModelNodeAbsPath(workspace.structurePath, node.fileUrl);
      void revealItemInDir(abs).catch((error) => {
        toast.error(t("errors.reveal"), {
          description: t("errors.revealDetail", { path: abs, error: String(error) }),
        });
      });
    },
    [workspace.structurePath, t],
  );

  const handleCopyNodePath = useCallback(
    (node: UnitModelTreeNode) => {
      if (!workspace.structurePath || !node.fileUrl) return;
      void writeText(resolveUnitModelNodeAbsPath(workspace.structurePath, node.fileUrl)).then(
        () => toast.success(t("messages.copied")),
        (error) => toast.error(t("errors.copy"), { description: String(error) }),
      );
    },
    [workspace.structurePath, t],
  );

  const handleShowTextureInPanel = useCallback((node: UnitModelTreeNode) => {
    const ref = node.fileUrl ?? node.label;
    const name = ref.replace(/\\/g, "/").split("/").pop() ?? node.label;
    if (isWeaponIconFileUrl(node.fileUrl) || node.role === "weapon-icon") {
      setLeftTab("icons");
      setFocusWeaponIconFilename(name);
      return;
    }
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
        toast.message(t("errors.numatbMissing", { name: numatbBasename }));
      }
    },
    [workspace.structurePath, structureJson, editors, t],
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
  const handleOpenCommonRoot = useCallback(
    async (root: string) => {
      clearPreviewReloadTimer();
      onUnitRootChange(root);
      await preview.loadModelAt(root);
      preview.requestCameraFit();
      workspace.markValidationStale();
    },
    [clearPreviewReloadTimer, onUnitRootChange, preview, workspace.markValidationStale],
  );

  const daeExportDialogSubtitle = useMemo(() => {
    if (daeExportDialog.targets.length === 1) {
      return daeExportDialog.targets[0]?.name ?? t("export.loadedModel");
    }
    return t("export.loadedModels", { count: daeExportDialog.targets.length });
  }, [daeExportDialog.targets, t]);

  const daeExportDialogSummary = useMemo(() => {
    return (
      <p className="text-muted-foreground">
        {t("export.summary", { count: daeExportDialog.targets.length })}
      </p>
    );
  }, [daeExportDialog.targets.length, t]);

  const openDaeExportDialogForInstances = useCallback(
    (instances: readonly SsbhModelPreviewInstance[]) => {
      const payload = buildUnitModelExportDialogState(instances);
      if (!payload) {
        toast.error(t("errors.noExport"));
        return;
      }
      if (payload.skipped.length > 0) {
        const labels = payload.skipped.map((entry) => entry.label).slice(0, 3);
        const extra = payload.skipped.length - labels.length;
        const skippedDetail =
          extra > 0
            ? labels.join(", ") + t("export.moreSuffix", { count: extra })
            : labels.join(", ");
        toast.message(t("export.skipping", { count: payload.skipped.length }), {
          description: skippedDetail,
        });
      }
      setDaeExportDialog({
        open: true,
        targets: payload.targets,
      });
    },
    [t],
  );

  const openDaeExportDialog = useCallback(() => {
    openDaeExportDialogForInstances(preview.previewInstances);
  }, [openDaeExportDialogForInstances, preview.previewInstances]);

  const openSingleModelExportDialog = useCallback(
    (modelLabel: string) => {
      // Match by models/<folder> identity (structure / Model Manager), not only
      // the preview displayLabel (.numdlb stem can differ after renames).
      const filtered = filterUnitModelInstancesByLabel(preview.previewInstances, modelLabel);
      if (filtered.length > 0) {
        openDaeExportDialogForInstances(filtered);
        return;
      }

      // Fallback: export from disk even when this model is not currently loaded
      // in the 3D preview (e.g. load cap, failed mesh, or label/stem mismatch).
      void (async () => {
        const diskState = workspace.activeRoot
          ? buildUnitModelDiskExportDialogState(workspace.activeRoot, modelLabel)
          : null;
        const diskPath = diskState?.targets[0]?.rootPath;
        if (diskState && diskPath && (await exists(diskPath))) {
          setDaeExportDialog({
            open: true,
            targets: diskState.targets,
          });
          return;
        }
        toast.error(t("export.unavailable", { name: modelLabel }));
      })();
    },
    [openDaeExportDialogForInstances, preview.previewInstances, workspace.activeRoot, t],
  );

  const handleDaeExport = useCallback(
    async (config: DaeExportConfig) => {
      const { targets } = daeExportDialog;
      setDaeExportDialog((prev) => ({ ...prev, open: false }));
      toast.loading(t("states.exporting"), { id: "unit-model-export" });

      try {
        const outputDir = config.outputDirectory;
        const entries = targets.flatMap((target) =>
          target.rootPath
            ? [{ rootPath: target.rootPath, outputName: target.name }]
            : [],
        );
        if (entries.length === 0) {
          throw new Error(t("errors.noExport"));
        }
        const result = await exportUnitModelsAsFbx(entries, outputDir, {
          scaleFactor: config.scaleFactor,
          upAxis: config.upAxis,
          exportTextures: config.exportTextures,
        });
        if (result.totalFailed > 0) {
          toast.warning(t("export.partial", {
            exported: result.totalExported,
            failed: result.totalFailed,
          }), {
            description: result.errors.slice(0, 3).join("\n"),
          });
        } else {
          toast.success(t("export.done", { count: result.totalExported }));
        }

        await rememberStoredDialogSelection(
          UNIT_MODEL_EXPORT_DAE_FOLDER_DIALOG_PATH_KEY,
          outputDir,
          "directory",
        );
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("errors.export"));
      } finally {
        toast.dismiss("unit-model-export");
      }
    },
    [daeExportDialog, t],
  );

  return (
    <NumatbTextureOptionsProvider value={numatbTextureOptions}>
      <UnitModelToolbar
        folderName={workspace.folderName}
        statusLabel={isExvsCommon ? `EXVS Common · ${workspace.statusLabel}` : workspace.statusLabel}
        hasErrors={workspace.hasErrors}
        validationValid={Boolean(workspace.validation?.valid)}
        isValidating={workspace.isValidating}
        busy={workspace.busy}
        canUseLoadedRoot={Boolean(workspace.loadedRoot)}
        canOperateOnRoot={Boolean(workspace.activeRoot)}
        canExportModels={canExportModels}
        onOpenFolder={() => void workspace.pickUnitFolder()}
        onExtractFhm2d={() => workspace.openExtractDialog()}
        onOpenExvsCommon={() => setCommonDialogOpen(true)}
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
              onValueChange={(value) => setLeftTab(value as "structure" | "textures" | "icons")}
              className="flex h-full flex-col"
            >
              <TabsList className={UNIT_MODEL_HIERARCHY_TABS_LIST}>
                <TabsTrigger value="structure" className={UNIT_MODEL_HIERARCHY_TAB_TRIGGER}>
                  {t("tabs.structure")}
                </TabsTrigger>
                <TabsTrigger value="textures" className={UNIT_MODEL_HIERARCHY_TAB_TRIGGER}>
                  {t("tabs.textures")}
                  {textureCount > 0 ? (
                    <span className={UNIT_MODEL_HIERARCHY_TAB_BADGE}>{textureCount}</span>
                  ) : null}
                </TabsTrigger>
                <TabsTrigger value="icons" className={UNIT_MODEL_HIERARCHY_TAB_TRIGGER}>
                  {t("tabs.icons")}
                  {weaponIconCount > 0 ? (
                    <span className={UNIT_MODEL_HIERARCHY_TAB_BADGE}>{weaponIconCount}</span>
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
                  profile={isExvsCommon ? "exvsCommon" : "unit"}
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
              <TabsContent value="icons" className="mt-0 min-h-0 flex-1 overflow-hidden">
                <UnitModelWeaponIconPanel
                  unitRoot={workspace.activeRoot}
                  onMutated={handleStructureMutated}
                  focusFilename={leftTab === "icons" ? focusWeaponIconFilename : null}
                  readOnly={isExvsCommon}
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

      {isExvsCommon ? (
        <ExvsCommonRepackDialog
          open={workspace.repackDialogOpen}
          onOpenChange={workspace.setRepackDialogOpen}
          modelRoot={workspace.activeRoot}
          structurePath={workspace.structurePath}
          modFolder={workspace.obModPath}
          onValidationResult={workspace.acceptValidationResult}
          onRepacked={workspace.setLastRepack}
        />
      ) : (
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
      )}

      <UnitModelExtractDialog
        open={workspace.extractDialogOpen}
        onOpenChange={workspace.setExtractDialogOpen}
        onExtracted={(result) => workspace.handleExtracted(result)}
      />

      <ExvsCommonBundleDialog
        open={commonDialogOpen}
        onOpenChange={setCommonDialogOpen}
        onOpened={handleOpenCommonRoot}
      />

      <SsbhFileEditorHosts
        {...editors.hostProps}
        shlModelFolderNames={shlModelFolderNames}
        shlBodySlotRequired={!isExvsCommon}
      />
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
