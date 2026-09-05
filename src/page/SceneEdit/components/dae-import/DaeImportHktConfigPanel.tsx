import { useMemo } from "react";
import { useTranslation } from "react-i18next";
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
  onValidationChange?: (error: string | null) => void;
}

export function DaeImportHktConfigPanel({
  havokInfo,
  config,
  onConfigChange,
  sourcePath,
  sourceName,
  onValidationChange,
}: DaeImportHktConfigPanelProps) {
  const { t } = useTranslation("scene-dae-hkt");
  if (!havokInfo) {
    return (
      <DaeImportStatusAlert tone="error">
        {t("errors.toolsNotDetected")}
      </DaeImportStatusAlert>
    );
  }

  if (!havokInfo.filterManagerAvailable) {
    return (
      <DaeImportStatusAlert tone="error">
        {t("errors.filterManagerNotFound")}
      </DaeImportStatusAlert>
    );
  }

  const profileCount = havokInfo.configProfiles.length;
  const backendConfig = useMemo(() => mapDaeImportConfigToBackend(config), [config]);

  return (
    <>
      <DaeImportSection title={t("section.collisionTitle")}>
        <DaeImportStatusAlert tone="info">
          {t("section.collisionDescription")}
        </DaeImportStatusAlert>
        <DaeImportFieldRow label={t("fields.havokVersion")}>
          <span className="block truncate text-right font-mono text-[11px]">{havokInfo.version}</span>
        </DaeImportFieldRow>
        <DaeImportFieldRow
          label={t("fields.conversionProfile")}
          hint={t("fields.conversionProfileHint")}
        >
          <span className="block truncate text-right text-[11px] text-muted-foreground">
            {t("fields.automatic")}
            {profileCount > 0
              ? ` · ${t("fields.profileCount", { count: profileCount })}`
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
        onValidationChange={onValidationChange}
      />
    </>
  );
}
