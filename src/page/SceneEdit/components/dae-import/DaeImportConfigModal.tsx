import { useEffect, useMemo, useState } from "react";
import { FileCode2, X } from "lucide-react";
import { Rnd } from "react-rnd";
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
  UnrealDetailsSection,
  UnrealModeToggle,
  UnrealPropertyBool,
  UnrealPropertyRow,
  unrealFooterClass,
  unrealPanelClass,
  unrealPrimaryButtonClass,
  unrealSecondaryButtonClass,
  unrealMutedTextClass,
  unrealSubtleTextClass,
  unrealTitleBarClass,
} from "./daeImportUnrealUi";

export type DaeImportPrimaryMode = "preview" | "ssbh";

const PREVIEW_WIDTH = 420;
const SSBH_WIDTH = 680;
const DEFAULT_HEIGHT = 520;
const MIN_WIDTH = 360;
const MIN_HEIGHT = 280;
const DAE_IMPORT_MODAL_HANDLE = "dae-import-modal-handle";

interface DaeImportConfigModalProps {
  entries: DaeImportEntry[];
  havokInfo: HavokInstallInfo | null;
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
  onConfigChange,
  onImport,
  onCancel,
}: DaeImportConfigModalProps) {
  const [position, setPosition] = useState({ x: 120, y: 80 });
  const [size, setSize] = useState({ width: PREVIEW_WIDTH, height: DEFAULT_HEIGHT });

  const entry = entries[0];
  const config = entry?.config;
  const primaryMode = config ? getPrimaryMode(config) : "preview";

  useEffect(() => {
    if (!entry) return;
    setSize((prev) => ({
      ...prev,
      width: primaryMode === "ssbh" ? SSBH_WIDTH : PREVIEW_WIDTH,
    }));
  }, [entry, primaryMode]);

  const hktAvailable = isHktGenerationAvailable(havokInfo);

  const sessionState = useDaeSsbhSessionStore();
  const ssbhReady = useMemo(() => {
    if (!entry || primaryMode !== "ssbh") return true;
    if (!sessionState.outputDir?.trim() || !sessionState.outputBaseName.trim()) return false;
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

  const maxWidth =
    typeof window !== "undefined" ? Math.max(MIN_WIDTH, window.innerWidth - 48) : 900;

  return (
    <div className="pointer-events-none absolute inset-0 z-50">
      <Rnd
        size={size}
        position={position}
        bounds="window"
        minWidth={MIN_WIDTH}
        minHeight={MIN_HEIGHT}
        maxWidth={maxWidth}
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
        <div className={cn(unrealPanelClass, "flex h-full min-h-0 flex-col overflow-hidden")}>
          <div className={cn(unrealTitleBarClass, DAE_IMPORT_MODAL_HANDLE)}>
            <div className="flex min-w-0 items-center gap-2">
              <FileCode2 className="h-3.5 w-3.5 shrink-0 text-orange-400" />
              <span className="truncate text-[11px] font-medium text-[#e8e8e8]">
                Import Static Mesh
              </span>
              <span className={cn("truncate text-[10px]", unrealMutedTextClass)}>/ {entry.fileName}</span>
              {entries.length > 1 && (
                <span className={cn("shrink-0 text-[10px]", unrealSubtleTextClass)}>
                  +{entries.length - 1}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={onCancel}
              className={cn("rounded-sm p-0.5 hover:bg-[#3a3a3a] hover:text-white", unrealMutedTextClass)}
              aria-label="Close import dialog"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <DaeImportAnalysisPanel
              analysis={entry.analysis}
              analyzing={entry.analyzing}
              analyzeError={entry.analyzeError}
            />

            <UnrealDetailsSection title="Import Options">
              <UnrealPropertyRow label="Import Mode">
                <UnrealModeToggle
                  value={primaryMode}
                  options={[
                    { value: "preview", label: "Preview" },
                    { value: "ssbh", label: "Convert SSBH" },
                  ]}
                  onValueChange={(value) => {
                    if (value === "preview" || value === "ssbh") {
                      setPrimaryMode(value);
                    }
                  }}
                />
              </UnrealPropertyRow>

              {primaryMode === "preview" && (
                <UnrealPropertyBool
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
              )}
            </UnrealDetailsSection>

            {primaryMode === "ssbh" && (
              <DaeImportSsbhFullPanel
                analysis={entry.analysis}
                sourcePath={entry.filePath}
              />
            )}

            {primaryMode === "preview" && config.generateHkt && (
              <DaeImportHktConfigPanel havokInfo={havokInfo} />
            )}
          </div>

          <div className={cn(unrealFooterClass, "shrink-0")}>
            <button type="button" className={unrealSecondaryButtonClass} onClick={onCancel}>
              Cancel
            </button>
            <button
              type="button"
              className={unrealPrimaryButtonClass}
              onClick={onImport}
              disabled={!canImport}
            >
              {primaryMode === "ssbh" ? "Convert to SSBH" : "Import"}
            </button>
          </div>
        </div>
      </Rnd>
    </div>
  );
}
