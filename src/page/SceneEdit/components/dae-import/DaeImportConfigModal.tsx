import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertCircle,
  Box,
  CheckCircle2,
  FolderOpen,
  Loader2,
} from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { useShallow } from "zustand/react/shallow";
import { Button } from "@/components/ui/button";
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
import { useDaeSsbhSessionStore } from "@/components/ssbh-model-preview/store/daeSsbhSessionStore";
import {
  collectDeclaredTexturePathSlotRefsForExportSession,
  collectMissingTexturePathsForExportSession,
} from "@/components/ssbh-model-preview/store/numatbTemplateStoreHelpers";
import { useNumatbTextureReferenceValidation } from "@/components/ssbh-model-preview/hooks/useNumatbTextureReferenceValidation";
import {
  DaeImportBoolField,
  DaeImportFieldRow,
  DaeImportSection,
} from "./daeImportUi";
import { SCENE_EDIT_RND_SIZE_KEYS } from "../sceneEditRndSizePersistence";
import { SceneEditRndModalShell } from "../SceneEditRndModalShell";

export type DaeImportPrimaryMode = "preview" | "ssbh";
export type DaeImportWorkflowMode = "standard" | "batchDisk" | "unitModel";

const VIEWPORT_MARGIN = 48;
const SSBH_MAX_WIDTH = 1080;
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

interface DaeImportConfigModalProps {
  entries: DaeImportEntry[];
  havokInfo: HavokInstallInfo | null;
  stageRoot: string | null;
  workflowMode?: DaeImportWorkflowMode;
  /** When set, out-of-scene writes go to `{stageRoot}/{replaceFolderName}/0/...` only. */
  replaceFolderName?: string | null;
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
  workflowMode: DaeImportWorkflowMode;
  replaceFolderName?: string | null;
  onConfigChange: (importId: string, config: DaeImportConfig) => void;
  onImport: () => void;
  onCancel: () => void;
}

const DaeImportConfigModalBody = memo(function DaeImportConfigModalBody({
  entry,
  entries,
  config,
  havokInfo,
  stageRoot,
  workflowMode,
  replaceFolderName,
  onConfigChange,
  onImport,
  onCancel,
}: DaeImportConfigModalBodyProps) {
  const batchDiskMode = workflowMode === "batchDisk";
  const unitModelMode = workflowMode === "unitModel";
  const primaryMode = getPrimaryMode(config);
  const hktAvailable = isHktGenerationAvailable(havokInfo);
  const [hktValidationError, setHktValidationError] = useState<string | null>(null);

  const handleHktValidationChange = useCallback((error: string | null) => {
    setHktValidationError(error);
  }, []);

  useEffect(() => {
    if (!config.generateHkt) {
      setHktValidationError(null);
    }
  }, [config.generateHkt]);

  // Batch import defaults HKT generation on; if Havok is unavailable, force it off
  // so the import is not blocked and still runs as a pure SSBH conversion.
  useEffect(() => {
    if (!hktAvailable && config.generateHkt) {
      onConfigChange(entry.importId, { ...config, generateHkt: false });
    }
  }, [hktAvailable, config, entry.importId, onConfigChange]);

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

  const declaredTextureSlots = useMemo(
    () =>
      collectDeclaredTexturePathSlotRefsForExportSession(
        ssbhSession.mayaFile,
        ssbhSession.nustFile,
        {
          writeNumatb: ssbhSession.writeNumatb,
          writeMayaProfile: ssbhSession.writeMayaProfile,
        },
      ),
    [
      ssbhSession.mayaFile,
      ssbhSession.nustFile,
      ssbhSession.writeMayaProfile,
      ssbhSession.writeNumatb,
    ],
  );
  const textureReferenceValidation = useNumatbTextureReferenceValidation({
    enabled: primaryMode === "ssbh",
    sourcePath: entry.filePath,
    stageRoot: config.directToDisk ? config.outputDirectory : stageRoot,
    slots: declaredTextureSlots,
  });

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
    return (
      missing.length === 0 &&
      !textureReferenceValidation.validating &&
      textureReferenceValidation.issues.length === 0 &&
      !textureReferenceValidation.error
    );
  }, [primaryMode, ssbhSession, textureReferenceValidation]);

  const updateConfig = (partial: Partial<DaeImportConfig>) => {
    onConfigChange(entry.importId, { ...config, ...partial });
  };

  const setPrimaryMode = (mode: DaeImportPrimaryMode) => {
    updateConfig({
      loadToScene: mode === "preview",
      convertToSsbh: mode === "ssbh",
      directToDisk: mode === "preview" ? false : config.directToDisk,
    });
  };

  const blockedByHkt =
    config.generateHkt &&
    Boolean(hktValidationError) &&
    (config.directToDisk || primaryMode === "ssbh");

  const allEntriesReady = entries.every(
    (candidate) =>
      !candidate.analyzing &&
      !candidate.analyzeError &&
      (candidate.analysis?.canConvert ?? false),
  );
  const canImport =
    (batchDiskMode ? allEntriesReady : !entry.analyzing) &&
    !blockedByHkt &&
    (!config.generateHkt || hktAvailable) &&
    (config.directToDisk
      ? Boolean(config.outputDirectory) && (entry.analysis?.canConvert ?? false) && ssbhReady
      : primaryMode === "preview"
        ? true
        : (entry.analysis?.canConvert ?? false) && ssbhReady);

  return (
    <div className="flex h-full min-h-0 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <DaeImportAnalysisPanel
            analysis={entry.analysis}
            analyzing={entry.analyzing}
            analyzeError={entry.analyzeError}
          />

          {batchDiskMode ? (
            <DaeImportSection title={`Batch Sources (${entries.length})`}>
              <div className="max-h-36 space-y-1 overflow-y-auto px-1">
                {entries.map((candidate) => {
                  const failed =
                    Boolean(candidate.analyzeError) ||
                    (candidate.analysis !== null && !candidate.analysis.canConvert);
                  return (
                    <div
                      key={candidate.importId}
                      className="flex min-w-0 items-center justify-between gap-3 rounded border px-2 py-1.5 text-[11px]"
                    >
                      <span className="min-w-0 truncate font-mono" title={candidate.filePath}>
                        {candidate.fileName}
                      </span>
                      <span
                        className={cn(
                          "inline-flex shrink-0 items-center gap-1",
                          candidate.analyzing
                            ? "text-sky-500"
                            : failed
                              ? "text-destructive"
                              : "text-emerald-500",
                        )}
                      >
                        {candidate.analyzing ? (
                          <>
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Analyzing
                          </>
                        ) : failed ? (
                          <>
                            <AlertCircle className="h-3 w-3" />
                            Invalid
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="h-3 w-3" />
                            Ready
                          </>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            </DaeImportSection>
          ) : null}

          <DaeImportSection title="Import Options">
            {unitModelMode ? (
              <DaeImportFieldRow label="Import Mode">
                <span className="text-right text-[11px] font-medium">
                  Add to Unit model package
                </span>
              </DaeImportFieldRow>
            ) : batchDiskMode ? (
              <DaeImportFieldRow label="Import Mode">
                <span className="text-right text-[11px] font-medium">
                  Direct-to-disk batch
                </span>
              </DaeImportFieldRow>
            ) : (
              <>
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
                      <TabsTrigger
                        value="preview"
                        className="flex-1 text-[11px]"
                        disabled={config.directToDisk}
                      >
                        Preview
                      </TabsTrigger>
                      <TabsTrigger value="ssbh" className="flex-1 text-[11px]">
                        Convert SSBH
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </DaeImportFieldRow>

                <DaeImportBoolField
                  label="Out-of-scene conversion"
                  hint="Write files to disk and skip viewport loading"
                  checked={config.directToDisk}
                  onCheckedChange={(checked) =>
                    updateConfig({
                      directToDisk: checked,
                      loadToScene: !checked && primaryMode === "preview",
                      convertToSsbh: checked ? true : config.convertToSsbh,
                    })
                  }
                />
              </>
            )}

            {config.directToDisk && !unitModelMode && (
              <DaeImportFieldRow
                label="Output Directory"
                hint={
                  replaceFolderName
                    ? `Replaces ${replaceFolderName} under the open stage folder`
                    : "Writes model folder under this directory"
                }
              >
                {replaceFolderName ? (
                  <span className="block truncate px-1 text-[10px] text-muted-foreground">
                    {stageRoot
                      ? `${stageRoot}\\${replaceFolderName}\\0\\`
                      : "Open a stage folder first"}
                  </span>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 w-full justify-start gap-2 px-2 text-[10px]"
                    onClick={async () => {
                      const selected = await open({
                        directory: true,
                        title: "Select static mesh output directory",
                        defaultPath: config.outputDirectory ?? stageRoot ?? undefined,
                      });
                      if (typeof selected === "string") {
                        updateConfig({ outputDirectory: selected });
                      }
                    }}
                  >
                    <FolderOpen className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">
                      {config.outputDirectory ?? "Choose folder"}
                    </span>
                  </Button>
                )}
              </DaeImportFieldRow>
            )}

            {!unitModelMode ? (
              <DaeImportBoolField
                label="Generate HKT Collision"
                hint={
                  hktAvailable
                    ? batchDiskMode
                      ? "Generate Havok collision per file (default: shape-preserving, most compact)"
                      : "Uses Havok tools with automatic profile selection"
                    : "Havok tools are not available on this machine"
                }
                checked={config.generateHkt}
                disabled={!hktAvailable}
                onCheckedChange={(checked) => updateConfig({ generateHkt: checked })}
              />
            ) : null}
          </DaeImportSection>

          {config.generateHkt && !unitModelMode && (
            <DaeImportHktConfigPanel
              havokInfo={havokInfo}
              config={config}
              onConfigChange={updateConfig}
              sourcePath={entry.filePath}
              sourceName={entry.fileName}
              onValidationChange={handleHktValidationChange}
            />
          )}

          {primaryMode === "ssbh" && (
            <DaeImportSsbhFullPanel
              analysis={entry.analysis}
              sourcePath={entry.filePath}
              stageRoot={stageRoot}
              directToDisk={config.directToDisk}
              batchCount={batchDiskMode ? entries.length : 1}
              unitModelMode={unitModelMode}
              textureReferenceIssues={textureReferenceValidation.issues}
              textureReferenceValidationError={textureReferenceValidation.error}
              textureReferencesValidating={textureReferenceValidation.validating}
            />
          )}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t bg-muted/20 px-4 py-3">
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={onImport} disabled={!canImport}>
            {unitModelMode
              ? "Add Unit Model"
              : batchDiskMode
              ? `Convert ${entries.length} File${entries.length === 1 ? "" : "s"} to Disk`
              : config.directToDisk
              ? "Convert to Disk"
              : primaryMode === "ssbh"
                ? "Convert to SSBH"
                : "Import"}
          </Button>
        </div>
    </div>
  );
});

export function DaeImportConfigModal({
  entries,
  havokInfo,
  stageRoot,
  workflowMode = "standard",
  replaceFolderName,
  onConfigChange,
  onImport,
  onCancel,
}: DaeImportConfigModalProps) {
  const entry = entries[0];
  const config = entry?.config;
  const primaryMode = config ? getPrimaryMode(config) : "preview";
  const getDimensions = useCallback(
    () => getDaeImportModalDimensions(primaryMode),
    [primaryMode],
  );
  const getInitialPosition = useCallback(
    (modalSize: { width: number; height: number }) =>
      clampModalPosition(getCenteredModalPosition(modalSize), modalSize),
    [],
  );

  if (!entry || !config) return null;
  const batchDiskMode = workflowMode === "batchDisk";
  const unitModelMode = workflowMode === "unitModel";
  const title = unitModelMode
    ? "Import Unit Model"
    : batchDiskMode
      ? "Batch Import Static Mesh"
      : "Import Static Mesh";
  const subtitle = unitModelMode
    ? `${entry.fileName} to Unit model package`
    : batchDiskMode
    ? `${entries.length} FBX/DAE file${entries.length === 1 ? "" : "s"} to disk`
    : `${entry.fileName}${entries.length > 1 ? ` · +${entries.length - 1} more` : ""}`;

  const modalLayer = (
    <div
      id={DAE_IMPORT_MODAL_LAYER_ID}
      className="pointer-events-none fixed inset-x-0 bottom-0 top-[var(--layout-topbar-height)] z-[var(--z-modal-nested)]"
    >
      <SceneEditRndModalShell
        cascadeIndex={0}
        zIndex={1}
        titleId="dae-import-modal-title"
        title={title}
        subtitle={subtitle}
        headerIcon={<Box className="h-4 w-4 text-primary" />}
        onActivate={() => {}}
        onClose={onCancel}
        getDimensions={getDimensions}
        getInitialPosition={getInitialPosition}
        sizeStorageKey={getDaeImportSizeStorageKey(primaryMode)}
        skipActivate
      >
        <DaeImportConfigModalBody
          entry={entry}
          entries={entries}
          config={config}
          havokInfo={havokInfo}
          stageRoot={stageRoot}
          workflowMode={workflowMode}
          replaceFolderName={replaceFolderName}
          onConfigChange={onConfigChange}
          onImport={onImport}
          onCancel={onCancel}
        />
      </SceneEditRndModalShell>
    </div>
  );

  return createPortal(modalLayer, document.body);
}
