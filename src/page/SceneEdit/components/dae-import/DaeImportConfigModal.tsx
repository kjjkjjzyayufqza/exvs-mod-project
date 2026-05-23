import { FileCode2, X } from "lucide-react";
import { useDraggableModal } from "@/hooks/useDraggableModal";
import { DaeImportAnalysisPanel } from "./DaeImportAnalysisPanel";
import { DaeImportSsbhConfigPanel } from "./DaeImportSsbhConfigPanel";
import { DaeImportHktConfigPanel } from "./DaeImportHktConfigPanel";
import { TextureFormatSelect, type DdsFormat } from "../TextureFormatSelect";
import type {
  DaeImportEntry,
  DaeImportConfig,
  HavokInstallInfo,
  SsbhImportConfig,
} from "./daeImportTypes";
import { isHktGenerationAvailable } from "./daeImportDefaults";
import {
  UnrealDetailsSection,
  UnrealModeToggle,
  UnrealPropertyBool,
  UnrealPropertyRow,
  unrealFooterClass,
  unrealPanelClass,
  unrealPrimaryButtonClass,
  unrealSecondaryButtonClass,
  unrealSelectTriggerClass,
  unrealTitleBarClass,
} from "./daeImportUnrealUi";

export type DaeImportPrimaryMode = "preview" | "ssbh";

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
  const { nodeRef, handleProps } = useDraggableModal({
    defaultPosition: { x: 120, y: 80 },
  });

  const entry = entries[0];
  if (!entry) return null;

  const config = entry.config;
  const primaryMode = getPrimaryMode(config);

  const updateConfig = (partial: Partial<DaeImportConfig>) => {
    onConfigChange(entry.importId, { ...config, ...partial });
  };

  const setPrimaryMode = (mode: DaeImportPrimaryMode) => {
    updateConfig({
      loadToScene: mode === "preview",
      convertToSsbh: mode === "ssbh",
    });
  };

  const updateSsbhConfig = (next: SsbhImportConfig) => {
    updateConfig({ ssbhConfig: next });
  };

  const hktAvailable = isHktGenerationAvailable(havokInfo);

  const canImport =
    !entry.analyzing &&
    (primaryMode === "preview" || (entry.analysis?.canConvert ?? false));

  return (
    <div className="pointer-events-none absolute inset-0 z-50">
      <div
        ref={nodeRef}
        className="pointer-events-auto absolute"
        style={{ width: 420 }}
      >
        <div className={unrealPanelClass}>
          <div {...handleProps} className={unrealTitleBarClass}>
            <div className="flex min-w-0 items-center gap-2">
              <FileCode2 className="h-3.5 w-3.5 shrink-0 text-orange-400" />
              <span className="truncate text-[11px] font-medium text-[#e8e8e8]">
                Import Static Mesh
              </span>
              <span className="truncate text-[10px] text-[#888]">/ {entry.fileName}</span>
              {entries.length > 1 && (
                <span className="shrink-0 text-[10px] text-[#707070]">
                  +{entries.length - 1}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={onCancel}
              className="rounded-sm p-0.5 text-[#888] hover:bg-[#3a3a3a] hover:text-white"
              aria-label="Close import dialog"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="max-h-[70vh] overflow-y-auto">
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

              {primaryMode === "ssbh" && (
                <UnrealPropertyRow label="Texture Format" hint="DDS format for imported PNG textures">
                  <div className="flex justify-end">
                    <TextureFormatSelect
                      value={config.defaultDdsFormat as DdsFormat}
                      onChange={(fmt) => updateConfig({ defaultDdsFormat: fmt })}
                      triggerClassName={`${unrealSelectTriggerClass} w-full max-w-[180px]`}
                    />
                  </div>
                </UnrealPropertyRow>
              )}
            </UnrealDetailsSection>

            {primaryMode === "ssbh" && (
              <DaeImportSsbhConfigPanel
                config={config.ssbhConfig}
                onChange={updateSsbhConfig}
              />
            )}

            {config.generateHkt && <DaeImportHktConfigPanel havokInfo={havokInfo} />}
          </div>

          <div className={unrealFooterClass}>
            <button type="button" className={unrealSecondaryButtonClass} onClick={onCancel}>
              Cancel
            </button>
            <button
              type="button"
              className={unrealPrimaryButtonClass}
              onClick={onImport}
              disabled={!canImport}
            >
              Import
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
