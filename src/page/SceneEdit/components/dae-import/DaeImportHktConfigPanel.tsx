import type { HavokInstallInfo } from "./daeImportTypes";
import { DaeImportFieldRow, DaeImportSection, DaeImportStatusAlert } from "./daeImportUi";

interface DaeImportHktConfigPanelProps {
  havokInfo: HavokInstallInfo | null;
}

export function DaeImportHktConfigPanel({ havokInfo }: DaeImportHktConfigPanelProps) {
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

  return (
    <DaeImportSection title="Collision (HKT)">
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
  );
}
