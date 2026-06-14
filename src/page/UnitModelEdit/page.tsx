import { useCallback, useEffect, useMemo, useState } from "react";
import { useDefaultLayout } from "react-resizable-panels";
import { exists, readTextFile } from "@tauri-apps/plugin-fs";

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
import { exportStageDaeBatchToDirectory } from "@/page/SceneEdit/utils/daeExportImport";
import { UNIT_MODEL_EDIT_ROUTE_URL } from "./constants";
import { UnitModelDaeExchangeModal } from "./components/UnitModelDaeExchangeModal";
import { UnitModelHierarchyPanel } from "./components/UnitModelHierarchyPanel";
import { UnitModelPropertiesPanel } from "./components/UnitModelPropertiesPanel";
import { UnitModelRepackDialog } from "./components/UnitModelRepackDialog";
import { UnitModelTexturePanel } from "./components/UnitModelTexturePanel";
import { UnitModelToolbar } from "./components/UnitModelToolbar";
import { useUnitModelWorkspace } from "./hooks/useUnitModelWorkspace";
import {
  UNIT_MODEL_EDIT_DEFAULT_LAYOUT,
  UNIT_MODEL_EDIT_PANEL_IDS,
  UNIT_MODEL_HIERARCHY_TAB_BADGE,
  UNIT_MODEL_HIERARCHY_TAB_TRIGGER,
  UNIT_MODEL_HIERARCHY_TABS_LIST,
} from "./utils/unitModelEditorSettings";
import { listUnitModelTextures } from "./utils/unitModelTextureService";
import { inferUnitModelStructurePath } from "./utils/unitModelRepackService";

function UnitModelEditWorkspace({
  unitRoot,
  onUnitRootChange,
  structureJson,
  onStructureMutated,
  daeExchangeOpen,
  setDaeExchangeOpen,
  setDaeModalViewportSuspend,
}: {
  unitRoot: string | null;
  onUnitRootChange: (path: string | null) => void;
  structureJson: unknown | null;
  onStructureMutated: () => void;
  daeExchangeOpen: boolean;
  setDaeExchangeOpen: (open: boolean) => void;
  setDaeModalViewportSuspend: (suspended: boolean) => void;
}) {
  const workspace = useUnitModelWorkspace(unitRoot, onUnitRootChange);
  const preview = useSsbhModelPreview();
  const [daeExportDialog, setDaeExportDialog] = useState<{
    open: boolean;
    targets: DaeExportTarget[];
  }>({ open: false, targets: [] });
  const [leftTab, setLeftTab] = useState<"structure" | "textures">("structure");
  const [textureCount, setTextureCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!workspace.activeRoot || !workspace.structurePath) {
      setTextureCount(0);
      return;
    }
    void listUnitModelTextures(workspace.activeRoot, workspace.structurePath)
      .then((inventory) => {
        if (!cancelled) setTextureCount(inventory.textures.length);
      })
      .catch(() => {
        if (!cancelled) setTextureCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, [workspace.activeRoot, workspace.structurePath, structureJson]);

  useEffect(() => {
    const onTexturesChanged = () => {
      if (!workspace.activeRoot || !workspace.structurePath) return;
      void listUnitModelTextures(workspace.activeRoot, workspace.structurePath)
        .then((inventory) => setTextureCount(inventory.textures.length))
        .catch(() => setTextureCount(0));
    };
    window.addEventListener("unit-model-textures-changed", onTexturesChanged);
    return () => window.removeEventListener("unit-model-textures-changed", onTexturesChanged);
  }, [workspace.activeRoot, workspace.structurePath]);

  const { defaultLayout: persistedLayout, onLayoutChanged } = useDefaultLayout({
    id: "unit-model-edit-layout",
    panelIds: [...UNIT_MODEL_EDIT_PANEL_IDS],
    storage: globalThis.localStorage,
  });

  const unitEditLayout = useMemo(
    () => persistedLayout ?? UNIT_MODEL_EDIT_DEFAULT_LAYOUT,
    [persistedLayout],
  );

  const activeExportRoot = useMemo(() => {
    const active = preview.previewInstances.find((inst) => inst.id === preview.activePreviewInstanceId);
    const bundle = active?.bundle ?? preview.previewInstances[0]?.bundle ?? preview.bundle;
    if (!bundle || bundle.sourceKind !== "disk" || !bundle.rootFolder) return null;
    return bundle.rootFolder;
  }, [preview.activePreviewInstanceId, preview.bundle, preview.previewInstances]);

  const openDaeExportDialog = useCallback(() => {
    if (!activeExportRoot) return;
    const active = preview.previewInstances.find((inst) => inst.id === preview.activePreviewInstanceId);
    const label = active?.displayLabel ?? activeExportRoot.split(/[/\\]/).pop() ?? "model";
    setDaeExportDialog({
      open: true,
      targets: [
        {
          nodeId: active?.id ?? label,
          name: label,
          rootPath: activeExportRoot,
          type: "ssbh",
        },
      ],
    });
  }, [activeExportRoot, preview.activePreviewInstanceId, preview.previewInstances]);

  const handleDaeExport = useCallback(
    async (config: DaeExportConfig) => {
      const targets = daeExportDialog.targets;
      setDaeExportDialog((prev) => ({ ...prev, open: false }));
      const ssbhTargets = targets.filter((t) => t.type === "ssbh" && t.rootPath);
      if (ssbhTargets.length === 0 || !config.formats.includes("dae")) return;

      await exportStageDaeBatchToDirectory(
        ssbhTargets.map((t) => ({
          rootPath: t.rootPath!,
          outputName: t.name,
        })),
        config.outputDirectory,
        {
          scaleFactor: config.scaleFactor,
          upAxis: config.upAxis,
          exportTextures: config.exportTextures,
        },
      );
    },
    [daeExportDialog.targets],
  );

  return (
    <>
      <UnitModelToolbar
        folderName={workspace.folderName}
        statusLabel={workspace.statusLabel}
        hasErrors={workspace.hasErrors}
        validationValid={Boolean(workspace.validation?.valid)}
        busy={workspace.busy}
        canUseLoadedRoot={Boolean(workspace.loadedRoot)}
        canOperateOnRoot={Boolean(workspace.activeRoot)}
        canExportDae={Boolean(activeExportRoot)}
        onOpenFolder={() => void workspace.pickUnitFolder()}
        onExtractFhm2d={() => void workspace.extractFromFhm2d()}
        onUseLoadedRoot={workspace.useLoadedRoot}
        onValidate={() => void workspace.runValidation()}
        onRepack={workspace.openRepackDialog}
        onCopyReviewPayload={() => void workspace.copyReviewPayload()}
        onOpenDaeExchange={() => setDaeExchangeOpen(true)}
        onExportDae={openDaeExportDialog}
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
                  onMutated={onStructureMutated}
                />
              </TabsContent>
              <TabsContent value="textures" className="mt-0 min-h-0 flex-1 overflow-hidden">
                <UnitModelTexturePanel unitRoot={workspace.activeRoot} embedded />
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
            isValidating={workspace.busy === "validate"}
          />
        </ResizablePanel>
      </ResizablePanelGroup>

      <UnitModelDaeExchangeModal
        open={daeExchangeOpen}
        onClose={() => setDaeExchangeOpen(false)}
        onViewportSuspendChange={setDaeModalViewportSuspend}
      />

      <DaeExportDialog
        open={daeExportDialog.open}
        targets={daeExportDialog.targets}
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
        onRepacked={workspace.setLastRepack}
      />
    </>
  );
}

export default function UnitModelEdit() {
  const [unitRoot, setUnitRoot] = useState<string | null>(null);
  const [structureJson, setStructureJson] = useState<unknown | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [daeExchangeOpen, setDaeExchangeOpen] = useState(false);
  const [daeModalViewportSuspend, setDaeModalViewportSuspend] = useState(false);
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

  const previewSuspended = !isPageActive || daeExchangeOpen || daeModalViewportSuspend;

  return (
    <SsbhModelPreviewProvider workspaceRoot={unitRoot} previewSuspended={previewSuspended}>
      <TooltipProvider>
        <div className="flex h-full min-h-0 min-w-0 flex-col bg-background">
          <UnitModelEditWorkspace
            unitRoot={unitRoot}
            onUnitRootChange={setUnitRoot}
            structureJson={structureJson}
            onStructureMutated={() => setReloadTick((t) => t + 1)}
            daeExchangeOpen={daeExchangeOpen}
            setDaeExchangeOpen={setDaeExchangeOpen}
            setDaeModalViewportSuspend={setDaeModalViewportSuspend}
          />
        </div>
      </TooltipProvider>
    </SsbhModelPreviewProvider>
  );
}
