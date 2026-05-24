import type { HavokInstallInfo } from "./daeImportTypes";
import {
  UnrealDetailsSection,
  UnrealPropertyRow,
  UnrealStatusBanner,
} from "./daeImportUnrealUi";

interface DaeImportHktConfigPanelProps {
  havokInfo: HavokInstallInfo | null;
}

export function DaeImportHktConfigPanel({ havokInfo }: DaeImportHktConfigPanelProps) {
  if (!havokInfo) {
    return (
      <UnrealStatusBanner tone="error">
        Havok Content Tools not detected. Install to C:\Program Files\Havok\HavokContentTools
        to enable HKT generation.
      </UnrealStatusBanner>
    );
  }

  if (!havokInfo.filterManagerAvailable) {
    return (
      <UnrealStatusBanner tone="error">
        hctStandAloneFilterManager.exe not found in the Havok installation.
      </UnrealStatusBanner>
    );
  }

  const profileCount = havokInfo.configProfiles.length;

  return (
    <UnrealDetailsSection title="Collision (HKT)">
      <UnrealPropertyRow label="Havok Version">
        <span className="block truncate text-right text-[11px] font-mono text-[#e8e8e8]">
          {havokInfo.version}
        </span>
      </UnrealPropertyRow>
      <UnrealPropertyRow
        label="Conversion Profile"
        hint="Auto-selected from installed Havok configs"
      >
        <span className="block truncate text-right text-[11px] text-[#c8c8c8]">
          Automatic
          {profileCount > 0
            ? ` · ${profileCount} profile${profileCount === 1 ? "" : "s"}`
            : ""}
        </span>
      </UnrealPropertyRow>
    </UnrealDetailsSection>
  );
}
