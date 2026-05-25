import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Box, X } from "lucide-react";
import { Rnd } from "react-rnd";
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

export type DaeImportPrimaryMode = "preview" | "ssbh";

const VIEWPORT_MARGIN = 48;
const SSBH_MAX_WIDTH = 820;
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

export function DaeImportConfigModal({
  entries,
  havokInfo,
  stageRoot,
  onConfigChange,
  onImport,
  onCancel,
}: DaeImportConfigModalProps) {
  const [position, setPosition] = useState(() => {
    const dims = getDaeImportModalDimensions("preview");
    return clampModalPosition(getCenteredModalPosition(dims), dims);
  });
  const [size, setSize] = useState(() => {
    const dims = getDaeImportModalDimensions("preview");
    return { width: dims.width, height: dims.height };
  });
  const [modeConstraints, setModeConstraints] = useState(() =>
    getDaeImportModalDimensions("preview"),
  );

  const entry = entries[0];
  const config = entry?.config;
  const primaryMode = config ? getPrimaryMode(config) : "preview";

  useEffect(() => {
    if (!entry) return;
    const dims = getDaeImportModalDimensions(primaryMode);
    setModeConstraints(dims);
    setSize({ width: dims.width, height: dims.height });
    setPosition(clampModalPosition(getCenteredModalPosition(dims), dims));
  }, [entry, primaryMode]);

  useEffect(() => {
    const onResize = () => {
      const dims = getDaeImportModalDimensions(primaryMode);
      setModeConstraints(dims);
      setSize((prev) => {
        const next = {
          width: Math.min(dims.maxWidth, Math.max(dims.minWidth, prev.width)),
          height: Math.min(dims.maxHeight, Math.max(dims.minHeight, prev.height)),
        };
        setPosition((pos) => clampModalPosition(pos, next));
        return next;
      });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [primaryMode]);

  const hktAvailable = isHktGenerationAvailable(havokInfo);

  const sessionState = useDaeSsbhSessionStore();
  const ssbhReady = useMemo(() => {
    if (!entry || primaryMode !== "ssbh") return true;
    if (!sessionState.outputBaseName.trim()) return false;
    if (sessionState.includeGeometryNames.length === 0) return false;
    if (!sessionState.numdlbEntries.every((r) => r.materialLabel.trim())) return false;
    const missing = collectMissingTexturePathsForExportSession(
      sessionState.mayaFile, sessionState.nustFile, {
        writeNumatb: sessionState.writeNumatb,
        writeMayaProfile: sessionState.writeMayaProfile,
        materialLabels: sessionState.numdlbEntries.map((r) => r.materialLabel),
      });
    return missing.length === 0;
  }, [entry, primaryMode, sessionState]);

  if (!entry || !config) return null;

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
        onDragStop={(_event, data) => {
          setPosition({ x: data.x, y: data.y });
        }}
        onResizeStop={(_event, _direction, ref, _delta, nextPosition) => {
          setSize({
            width: ref.offsetWidth,
            height: ref.offsetHeight,
          });
          setPosition(nextPosition);
        }}
      >
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
      </Rnd>
    </div>
  );

  return createPortal(modalLayer, document.body);
}
