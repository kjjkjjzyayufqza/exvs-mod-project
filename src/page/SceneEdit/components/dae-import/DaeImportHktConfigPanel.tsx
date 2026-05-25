import { useMemo } from "react";
import type { HavokInstallInfo, DaeImportConfig } from "./daeImportTypes";
import { DaeImportFieldRow, DaeImportSection, DaeImportStatusAlert } from "./daeImportUi";
import { DaeImportHktSimplifyFields } from "./DaeImportHktSimplifyFields";
import { mapDaeImportConfigToBackend } from "../../utils/sceneSessionService";

interface DaeImportHktConfigPanelProps {
  havokInfo: HavokInstallInfo | null;
  config: DaeImportConfig;
  onConfigChange: (partial: Partial<DaeImportConfig>) => void;
  sourcePath?: string;
  sourceName?: string;
}

export function DaeImportHktConfigPanel({
  havokInfo,
  config,
  onConfigChange,
  sourcePath,
  sourceName,
}: DaeImportHktConfigPanelProps) {
  if (!havokInfo) {
    return (
      <DaeImportStatusAlert tone="error">
        Havok Content Tools not detected. Install to C:\Program Files\Havok\HavokContentTools
        to enable HKT generation.
      </DaeImportStatusAlert>
    );
  }

  if (!havokInfo.filterManagerAvailable) {
    return (
      <DaeImportStatusAlert tone="error">
        hctStandAloneFilterManager.exe not found in the Havok installation.
      </DaeImportStatusAlert>
    );
  }

  const profileCount = havokInfo.configProfiles.length;
  const backendConfig = useMemo(() => mapDaeImportConfigToBackend(config), [config]);

  return (
    <>
      <DaeImportSection title="Collision (HKT)">
        <DaeImportStatusAlert tone="info">
          Builds simplified collision from DAE/FBX geometry (skin-baked when rigged), then converts
          to HKT via Havok Content Tools.
        </DaeImportStatusAlert>
        <DaeImportFieldRow label="Havok Version">
          <span className="block truncate text-right font-mono text-[11px]">{havokInfo.version}</span>
        </DaeImportFieldRow>
        <DaeImportFieldRow
          label="Conversion Profile"
          hint="Auto-selected from installed Havok configs"
        >
          <span className="block truncate text-right text-[11px] text-muted-foreground">
            Automatic
            {profileCount > 0
              ? ` · ${profileCount} profile${profileCount === 1 ? "" : "s"}`
              : ""}
          </span>
        </DaeImportFieldRow>
      </DaeImportSection>

      <DaeImportHktSimplifyFields
        value={config.hktSimplify}
        onChange={(hktSimplify) => onConfigChange({ hktSimplify })}
        importConfig={backendConfig}
        sourcePath={sourcePath}
        sourceName={sourceName}
      />
    </>
  );
}
