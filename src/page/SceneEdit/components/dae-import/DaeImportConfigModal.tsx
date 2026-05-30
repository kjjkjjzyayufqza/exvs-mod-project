import { memo, useCallback, useEffect, useMemo, useState, type ComponentProps } from "react";
import { createPortal } from "react-dom";
import { Box, X } from "lucide-react";
import { Rnd } from "react-rnd";
import { useShallow } from "zustand/react/shallow";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { DaeImportAnalysisPanel } from "./DaeImportAnalysisPanel";
import { DaeImportSsbhFullPanel } from "./DaeImportSsbhFullPanel";
import { DaeImportHktConfigPanel } from "./DaeImportHktConfigPanel";
import type {
  DaeImportEntry,
  DaeImportConfig,
  HavokInstallInfo,
} from "./daeImportTypes";
import { isHktGenerationAvailable } from "./daeImportDefaults";
import { useDaeSsbhSessionStore } from "@/page/TestEditor/components/ssbh-model-preview/store/daeSsbhSessionStore";
import { collectMissingTexturePathsForExportSession } from "@/page/TestEditor/components/ssbh-model-preview/store/numatbTemplateStoreHelpers";
import {
  DaeImportBoolField,
  DaeImportFieldRow,
  DaeImportSection,
} from "./daeImportUi";
import { useSceneModalViewportSuspendInteraction } from "../../hooks/useSceneModalViewportSuspendInteraction";
import {
  SCENE_EDIT_RND_SIZE_KEYS,
  persistSceneEditRndSize,
  resolveSceneEditRndInitialSize,
} from "../sceneEditRndSizePersistence";
import { clampRndSizeToConstraints } from "../sceneEditRndModalUtils";

export type DaeImportPrimaryMode = "preview" | "ssbh";

const VIEWPORT_MARGIN = 48;
const SSBH_MAX_WIDTH = 1080;
const DAE_IMPORT_MODAL_HANDLE = "dae-import-modal-handle";
const DAE_IMPORT_MODAL_LAYER_ID = "dae-import-modal-layer";

interface DaeImportModalDimensions {
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
  maxWidth: number;
  maxHeight: number;
}

function getViewportSize() {
  if (typeof window === "undefined") {
    return { width: 1280, height: 800 };
  }
  return { width: window.innerWidth, height: window.innerHeight };
}

function getDaeImportModalDimensions(mode: DaeImportPrimaryMode): DaeImportModalDimensions {
  const { width: vw, height: vh } = getViewportSize();
  const maxWidth = Math.max(320, vw - VIEWPORT_MARGIN);
  const maxHeight = Math.max(280, vh - VIEWPORT_MARGIN);

  if (mode === "ssbh") {
    const width = Math.min(
      maxWidth,
      SSBH_MAX_WIDTH,
      Math.max(560, Math.round(vw * 0.68)),
    );
    const height = Math.min(maxHeight, Math.max(480, Math.round(vh * 0.78)));
    return {
      width,
      height,
      minWidth: Math.min(maxWidth, 520),
      minHeight: 360,
      maxWidth,
      maxHeight,
    };
  }

  const width = Math.min(maxWidth, Math.max(360, Math.round(vw * 0.38)));
  const height = Math.min(maxHeight, Math.max(400, Math.round(vh * 0.62)));
  return {
    width,
    height,
    minWidth: Math.min(maxWidth, 320),
    minHeight: 280,
    maxWidth,
    maxHeight,
  };
}

function getCenteredModalPosition(size: { width: number; height: number }) {
  const { width: vw, height: vh } = getViewportSize();
  return {
    x: Math.round((vw - size.width) / 2),
    y: Math.round((vh - size.height) / 2),
  };
}

function clampModalPosition(
  position: { x: number; y: number },
  size: { width: number; height: number },
) {
  const { width: vw, height: vh } = getViewportSize();
  const edge = VIEWPORT_MARGIN / 2;
  const maxX = Math.max(edge, vw - size.width - edge);
  const maxY = Math.max(edge, vh - size.height - edge);
  return {
    x: Math.min(Math.max(edge, position.x), maxX),
    y: Math.min(Math.max(edge, position.y), maxY),
  };
}

function getDaeImportSizeStorageKey(mode: DaeImportPrimaryMode) {
  return mode === "ssbh"
    ? SCENE_EDIT_RND_SIZE_KEYS.daeImportSsbh
    : SCENE_EDIT_RND_SIZE_KEYS.daeImportPreview;
}

function resolveDaeImportModalSize(
  mode: DaeImportPrimaryMode,
  dims: DaeImportModalDimensions,
) {
  return resolveSceneEditRndInitialSize(getDaeImportSizeStorageKey(mode), dims);
}

interface DaeImportConfigModalProps {
  entries: DaeImportEntry[];
  havokInfo: HavokInstallInfo | null;
  stageRoot: string | null;
  onConfigChange: (importId: string, config: DaeImportConfig) => void;
  onImport: () => void;
  onCancel: () => void;
}

function getPrimaryMode(config: DaeImportConfig): DaeImportPrimaryMode {
  return config.convertToSsbh ? "ssbh" : "preview";
}

interface DaeImportConfigModalBodyProps {
  entry: DaeImportEntry;
  entries: DaeImportEntry[];
  config: DaeImportConfig;
  havokInfo: HavokInstallInfo | null;
  stageRoot: string | null;
  onConfigChange: (importId: string, config: DaeImportConfig) => void;
  onImport: () => void;
  onCancel: () => void;
  onDragHandlePointerDownCapture?: (event: React.PointerEvent) => void;
}

const DaeImportConfigModalBody = memo(function DaeImportConfigModalBody({
  entry,
  entries,
  config,
  havokInfo,
  stageRoot,
  onConfigChange,
  onImport,
  onCancel,
  onDragHandlePointerDownCapture,
}: DaeImportConfigModalBodyProps) {
  const primaryMode = getPrimaryMode(config);
  const hktAvailable = isHktGenerationAvailable(havokInfo);

  const ssbhSession = useDaeSsbhSessionStore(
    useShallow((state) => ({
      outputBaseName: state.outputBaseName,
      includeGeometryNames: state.includeGeometryNames,
      numdlbEntries: state.numdlbEntries,
      mayaFile: state.mayaFile,
      nustFile: state.nustFile,
      writeNumatb: state.writeNumatb,
      writeMayaProfile: state.writeMayaProfile,
    })),
  );

  const ssbhReady = useMemo(() => {
    if (primaryMode !== "ssbh") return true;
    if (!ssbhSession.outputBaseName.trim()) return false;
    if (ssbhSession.includeGeometryNames.length === 0) return false;
    if (!ssbhSession.numdlbEntries.every((r) => r.materialLabel.trim())) return false;
    const missing = collectMissingTexturePathsForExportSession(
      ssbhSession.mayaFile,
      ssbhSession.nustFile,
      {
        writeNumatb: ssbhSession.writeNumatb,
        writeMayaProfile: ssbhSession.writeMayaProfile,
      },
    );
    return missing.length === 0;
  }, [primaryMode, ssbhSession]);

  const updateConfig = (partial: Partial<DaeImportConfig>) => {
    onConfigChange(entry.importId, { ...config, ...partial });
  };

  const setPrimaryMode = (mode: DaeImportPrimaryMode) => {
    updateConfig({
      loadToScene: mode === "preview",
      convertToSsbh: mode === "ssbh",
    });
  };

  const canImport =
    !entry.analyzing &&
    (primaryMode === "preview"
      ? true
      : (entry.analysis?.canConvert ?? false) && ssbhReady);

  return (
    <Card
      role="dialog"
      aria-modal="true"
      aria-labelledby="dae-import-modal-title"
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-md border bg-background shadow-2xl"
    >
      <div
        className={cn(
          "flex shrink-0 items-center justify-between border-b bg-linear-to-r from-muted/80 to-muted/40 px-4 py-3 select-none",
          DAE_IMPORT_MODAL_HANDLE,
          "cursor-grab active:cursor-grabbing",
        )}
        onPointerDownCapture={onDragHandlePointerDownCapture}
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Box className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <h2 id="dae-import-modal-title" className="truncate text-sm font-semibold">
              Import Static Mesh
            </h2>
            <p className="truncate text-xs text-muted-foreground">
              {entry.fileName}
              {entries.length > 1 ? ` · +${entries.length - 1} more` : ""}
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 rounded-full hover:bg-destructive/10 hover:text-destructive"
          data-no-drag
          onClick={onCancel}
          aria-label="Close import dialog"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <CardContent className="flex min-h-0 flex-1 flex-col p-0">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <DaeImportAnalysisPanel
            analysis={entry.analysis}
            analyzing={entry.analyzing}
            analyzeError={entry.analyzeError}
          />

          <DaeImportSection title="Import Options">
            <DaeImportFieldRow label="Import Mode">
              <Tabs
                value={primaryMode}
                onValueChange={(value) => {
                  if (value === "preview" || value === "ssbh") {
                    setPrimaryMode(value);
                  }
                }}
              >
                <TabsList className="h-8 w-full">
                  <TabsTrigger value="preview" className="flex-1 text-[11px]">
                    Preview
                  </TabsTrigger>
                  <TabsTrigger value="ssbh" className="flex-1 text-[11px]">
                    Convert SSBH
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </DaeImportFieldRow>

            <DaeImportBoolField
              label="Generate HKT Collision"
              hint={
                hktAvailable
                  ? "Uses Havok tools with automatic profile selection"
                  : "Havok tools are not available on this machine"
              }
              checked={config.generateHkt}
              disabled={!hktAvailable}
              onCheckedChange={(checked) => updateConfig({ generateHkt: checked })}
            />
          </DaeImportSection>

          {config.generateHkt && (
            <DaeImportHktConfigPanel
              havokInfo={havokInfo}
              config={config}
              onConfigChange={updateConfig}
              sourcePath={entry.filePath}
              sourceName={entry.fileName}
            />
          )}

          {primaryMode === "ssbh" && (
            <DaeImportSsbhFullPanel
              analysis={entry.analysis}
              sourcePath={entry.filePath}
              stageRoot={stageRoot}
            />
          )}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t bg-muted/20 px-4 py-3">
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={onImport} disabled={!canImport}>
            {primaryMode === "ssbh" ? "Convert to SSBH" : "Import"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
});

export function DaeImportConfigModal({
  entries,
  havokInfo,
  stageRoot,
  onConfigChange,
  onImport,
  onCancel,
}: DaeImportConfigModalProps) {
  const { startViewportSuspend, stopViewportSuspend, onDragHandlePointerDownCapture } =
    useSceneModalViewportSuspendInteraction();
  const [position, setPosition] = useState(() => {
    const dims = getDaeImportModalDimensions("preview");
    const size = resolveDaeImportModalSize("preview", dims);
    return clampModalPosition(getCenteredModalPosition(size), size);
  });
  const [size, setSize] = useState(() => {
    const dims = getDaeImportModalDimensions("preview");
    return resolveDaeImportModalSize("preview", dims);
  });
  const [modeConstraints, setModeConstraints] = useState(() =>
    getDaeImportModalDimensions("preview"),
  );

  const entry = entries[0];
  const config = entry?.config;

  useEffect(() => {
    if (!entry || !config) return;
    const primaryMode = getPrimaryMode(config);
    const dims = getDaeImportModalDimensions(primaryMode);
    const nextSize = resolveDaeImportModalSize(primaryMode, dims);
    setModeConstraints(dims);
    setSize(nextSize);
    setPosition(clampModalPosition(getCenteredModalPosition(nextSize), nextSize));
  }, [entry, config?.convertToSsbh, config?.loadToScene]);

  useEffect(() => {
    const onResize = () => {
      if (!config) return;
      const primaryMode = getPrimaryMode(config);
      const dims = getDaeImportModalDimensions(primaryMode);
      setModeConstraints(dims);
      setSize((prev) => {
        const next = clampRndSizeToConstraints(prev, dims);
        setPosition((pos) => clampModalPosition(pos, next));
        return next;
      });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [config?.convertToSsbh, config?.loadToScene]);

  const handleDragStart = useCallback(() => {
    startViewportSuspend();
  }, [startViewportSuspend]);

  const handleDragStop = useCallback(
    (...args: Parameters<NonNullable<ComponentProps<typeof Rnd>["onDragStop"]>>) => {
      stopViewportSuspend();
      const data = args[1];
      setPosition({ x: data.x, y: data.y });
    },
    [stopViewportSuspend],
  );

  const handleResizeStart = useCallback(() => {
    startViewportSuspend();
  }, [startViewportSuspend]);

  const handleResizeStop = useCallback(
    (...args: Parameters<NonNullable<ComponentProps<typeof Rnd>["onResizeStop"]>>) => {
      stopViewportSuspend();
      const ref = args[2];
      const nextPosition = args[4];
      if (!config) return;
      const primaryMode = getPrimaryMode(config);
      const dims = getDaeImportModalDimensions(primaryMode);
      const nextSize = persistSceneEditRndSize(
        getDaeImportSizeStorageKey(primaryMode),
        { width: ref.offsetWidth, height: ref.offsetHeight },
        dims,
      );
      setSize(nextSize);
      setPosition(nextPosition);
    },
    [config, stopViewportSuspend],
  );

  if (!entry || !config) return null;

  const modalLayer = (
    <div
      id={DAE_IMPORT_MODAL_LAYER_ID}
      className="pointer-events-none fixed inset-0 z-100"
    >
      <Rnd
        size={size}
        position={position}
        bounds="parent"
        minWidth={modeConstraints.minWidth}
        minHeight={modeConstraints.minHeight}
        maxWidth={modeConstraints.maxWidth}
        maxHeight={modeConstraints.maxHeight}
        dragHandleClassName={DAE_IMPORT_MODAL_HANDLE}
        cancel="button, input, textarea, select, label, a, [data-no-drag]"
        enableResizing={{
          top: false,
          right: true,
          bottom: true,
          left: false,
          topRight: false,
          bottomRight: true,
          bottomLeft: false,
          topLeft: false,
        }}
        resizeHandleStyles={{
          right: { width: 8, right: 0 },
          bottom: { height: 8, bottom: 0 },
          bottomRight: { width: 12, height: 12, right: 0, bottom: 0 },
        }}
        className="pointer-events-auto"
        onDragStart={handleDragStart}
        onDragStop={handleDragStop}
        onResizeStart={handleResizeStart}
        onResizeStop={handleResizeStop}
      >
        <DaeImportConfigModalBody
          entry={entry}
          entries={entries}
          config={config}
          havokInfo={havokInfo}
          stageRoot={stageRoot}
          onConfigChange={onConfigChange}
          onImport={onImport}
          onCancel={onCancel}
          onDragHandlePointerDownCapture={onDragHandlePointerDownCapture}
        />
      </Rnd>
    </div>
  );

  return createPortal(modalLayer, document.body);
}
