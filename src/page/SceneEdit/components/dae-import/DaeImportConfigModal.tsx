import { FileCode2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useDraggableModal } from "@/hooks/useDraggableModal";
import { DaeImportAnalysisPanel } from "./DaeImportAnalysisPanel";
import { DaeImportSsbhConfigPanel } from "./DaeImportSsbhConfigPanel";
import { DaeImportHktConfigPanel } from "./DaeImportHktConfigPanel";
import type {
  DaeImportEntry,
  DaeImportConfig,
  HavokInstallInfo,
  SsbhImportConfig,
  HktImportConfig,
} from "./daeImportTypes";

interface DaeImportConfigModalProps {
  entries: DaeImportEntry[];
  havokInfo: HavokInstallInfo | null;
  onConfigChange: (importId: string, config: DaeImportConfig) => void;
  onImport: () => void;
  onCancel: () => void;
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

  const updateConfig = (partial: Partial<DaeImportConfig>) => {
    onConfigChange(entry.importId, { ...config, ...partial });
  };

  const updateSsbhConfig = (next: SsbhImportConfig) => {
    updateConfig({ ssbhConfig: next });
  };

  const updateHktConfig = (next: HktImportConfig) => {
    updateConfig({ hktConfig: next });
  };

  const canImport =
    !entry.analyzing &&
    (!config.convertToSsbh || (entry.analysis?.canConvert ?? false));

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

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={config.loadToScene}
                  onCheckedChange={(checked) =>
                    updateConfig({ loadToScene: checked === true })
                  }
                />
                Load to scene (preview only)
              </label>

              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={config.convertToSsbh}
                  onCheckedChange={(checked) =>
                    updateConfig({ convertToSsbh: checked === true })
                  }
                />
                Convert to SSBH
              </label>

              {config.convertToSsbh && (
                <DaeImportSsbhConfigPanel
                  config={config.ssbhConfig}
                  onChange={updateSsbhConfig}
                />
              )}

              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={config.generateHkt}
                  onCheckedChange={(checked) =>
                    updateConfig({ generateHkt: checked === true })
                  }
                  disabled={!havokInfo?.fileConvertAvailable}
                />
                Generate HKT collision
              </label>

              {config.generateHkt && (
                <DaeImportHktConfigPanel
                  config={config.hktConfig}
                  havokInfo={havokInfo}
                  onChange={updateHktConfig}
                />
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
