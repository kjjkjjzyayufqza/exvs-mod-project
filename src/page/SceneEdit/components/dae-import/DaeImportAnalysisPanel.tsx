import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import type { DaeAnalysisResult } from "./daeImportTypes";
import { DaeImportFieldRow, DaeImportSection, DaeImportStatusAlert } from "./daeImportUi";
import { useTranslation } from "react-i18next";

interface DaeImportAnalysisPanelProps {
  analysis: DaeAnalysisResult | null;
  analyzing: boolean;
  analyzeError: string | null;
}

export function DaeImportAnalysisPanel({
  analysis,
  analyzing,
  analyzeError,
}: DaeImportAnalysisPanelProps) {
  const { t } = useTranslation("scene-dae");
  if (analyzing) {
    return (
      <DaeImportStatusAlert tone="info">
        <span className="inline-flex items-center gap-1.5">
          <Loader2 className="h-3 w-3 animate-spin" />
          {t("analysis.analyzing")}
        </span>
      </DaeImportStatusAlert>
    );
  }

  if (analyzeError) {
    return <DaeImportStatusAlert tone="error">{analyzeError}</DaeImportStatusAlert>;
  }

  if (!analysis) return null;

  const meshCount = analysis.meshRows.length;
  const vertexCount = analysis.meshRows.reduce((sum, row) => sum + row.vertexCount, 0);

  return (
    <DaeImportSection title={t("analysis.title")}>
      <DaeImportFieldRow label={t("analysis.convertible")}>
        <span className="flex items-center justify-end gap-1 text-[11px]">
          {analysis.canConvert ? (
            <>
              <CheckCircle2 className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
              <span className="text-emerald-600 dark:text-emerald-400">{t("common.yes")}</span>
            </>
          ) : (
            <>
              <AlertCircle className="h-3 w-3 text-destructive" />
              <span className="text-destructive">{t("common.no")}</span>
            </>
          )}
        </span>
      </DaeImportFieldRow>
      <DaeImportFieldRow label={t("analysis.meshes")}>
        <span className="block text-right font-mono text-[11px]">{meshCount}</span>
      </DaeImportFieldRow>
      <DaeImportFieldRow label={t("analysis.vertices")}>
        <span className="block text-right font-mono text-[11px]">
          {vertexCount.toLocaleString()}
        </span>
      </DaeImportFieldRow>
      <DaeImportFieldRow label={t("analysis.bones")}>
        <span className="block text-right font-mono text-[11px]">{analysis.boneCount}</span>
      </DaeImportFieldRow>
      {analysis.warnings.map((warning, index) => (
        <DaeImportStatusAlert key={`warn-${index}`} tone="warning">
          {warning}
        </DaeImportStatusAlert>
      ))}
      {analysis.blockingErrors.map((error, index) => (
        <DaeImportStatusAlert key={`err-${index}`} tone="error">
          {error}
        </DaeImportStatusAlert>
      ))}
    </DaeImportSection>
  );
}
