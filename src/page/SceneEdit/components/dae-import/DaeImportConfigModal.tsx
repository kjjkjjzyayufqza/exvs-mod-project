import { FileCode2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
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
  HktImportConfig,
} from "./daeImportTypes";

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

  const updateHktConfig = (next: HktImportConfig) => {
    updateConfig({ hktConfig: next });
  };

  const canImport =
    !entry.analyzing &&
    (primaryMode === "preview" || (entry.analysis?.canConvert ?? false));

  return (
    <div className="pointer-events-none absolute inset-0 z-50">
      <div
        ref={nodeRef}
        className="pointer-events-auto absolute"
        style={{ width: 480 }}
      >
        <Card className="shadow-xl border-border">
          <div
            {...handleProps}
            className="flex items-center justify-between border-b border-border/50 px-4 py-2"
          >
            <div className="flex items-center gap-2">
              <FileCode2 className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium truncate max-w-[340px]">
                Import DAE: {entry.fileName}
              </span>
              {entries.length > 1 && (
                <span className="text-xs text-muted-foreground">
                  (+{entries.length - 1} more)
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={onCancel}
              className="rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <CardContent className="p-4 space-y-3">
            <DaeImportAnalysisPanel
              analysis={entry.analysis}
              analyzing={entry.analyzing}
              analyzeError={entry.analyzeError}
            />

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Import mode</Label>
                <ToggleGroup
                  type="single"
                  value={primaryMode}
                  onValueChange={(value) => {
                    if (value === "preview" || value === "ssbh") {
                      setPrimaryMode(value);
                    }
                  }}
                  className="flex w-full"
                >
                  <ToggleGroupItem
                    value="preview"
                    className="h-8 flex-1 text-[11px] px-2"
                    aria-label="Load to scene preview only"
                  >
                    Load to scene (preview only)
                  </ToggleGroupItem>
                  <ToggleGroupItem
                    value="ssbh"
                    className="h-8 flex-1 text-[11px] px-2"
                    aria-label="Convert to SSBH"
                  >
                    Convert to SSBH
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>

              {primaryMode === "ssbh" && (
                <DaeImportSsbhConfigPanel
                  config={config.ssbhConfig}
                  onChange={updateSsbhConfig}
                />
              )}

              <div className="flex items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2">
                <div className="space-y-0.5">
                  <Label htmlFor="dae-import-generate-hkt" className="text-sm">
                    Generate HKT collision
                  </Label>
                  {!havokInfo?.fileConvertAvailable && (
                    <p className="text-[10px] text-muted-foreground">
                      Havok tools are not available on this machine
                    </p>
                  )}
                </div>
                <Switch
                  id="dae-import-generate-hkt"
                  checked={config.generateHkt}
                  onCheckedChange={(checked) =>
                    updateConfig({ generateHkt: checked === true })
                  }
                  disabled={!havokInfo?.fileConvertAvailable}
                />
              </div>

              {config.generateHkt && (
                <DaeImportHktConfigPanel
                  config={config.hktConfig}
                  havokInfo={havokInfo}
                  onChange={updateHktConfig}
                />
              )}

              {primaryMode === "ssbh" && (
                <div className="flex items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2">
                  <div className="space-y-0.5">
                    <Label className="text-sm">Texture format</Label>
                    <p className="text-[10px] text-muted-foreground">
                      DDS format for imported PNG textures
                    </p>
                  </div>
                  <TextureFormatSelect
                    value={config.defaultDdsFormat as DdsFormat}
                    onChange={(fmt) => updateConfig({ defaultDdsFormat: fmt })}
                  />
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border/50">
              <Button variant="outline" size="sm" onClick={onCancel}>
                Cancel
              </Button>
              <Button size="sm" onClick={onImport} disabled={!canImport}>
                Import
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
