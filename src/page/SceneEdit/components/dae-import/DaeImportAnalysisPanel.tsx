import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import type { DaeAnalysisResult } from "./daeImportTypes";
import { UnrealDetailsSection, UnrealPropertyRow, UnrealStatusBanner } from "./daeImportUnrealUi";

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
  if (analyzing) {
    return (
      <UnrealStatusBanner tone="info">
        <span className="inline-flex items-center gap-1.5">
          <Loader2 className="h-3 w-3 animate-spin" />
          Analyzing DAE...
        </span>
      </UnrealStatusBanner>
    );
  }

  if (analyzeError) {
    return <UnrealStatusBanner tone="error">{analyzeError}</UnrealStatusBanner>;
  }

  if (!analysis) return null;

  const meshCount = analysis.meshRows.length;
  const vertexCount = analysis.meshRows.reduce((sum, row) => sum + row.vertexCount, 0);

  return (
    <UnrealDetailsSection title="Source Analysis">
      <UnrealPropertyRow label="Convertible">
        <span className="flex items-center justify-end gap-1 text-[11px]">
          {analysis.canConvert ? (
            <>
              <CheckCircle2 className="h-3 w-3 text-[#6ecf6e]" />
              <span className="text-[#6ecf6e]">Yes</span>
            </>
          ) : (
            <>
              <AlertCircle className="h-3 w-3 text-[#ff8a8a]" />
              <span className="text-[#ff8a8a]">No</span>
            </>
          )}
        </span>
      </UnrealPropertyRow>
      <UnrealPropertyRow label="Meshes">
        <span className="block text-right text-[11px] font-mono text-[#e8e8e8]">{meshCount}</span>
      </UnrealPropertyRow>
      <UnrealPropertyRow label="Vertices">
        <span className="block text-right text-[11px] font-mono text-[#e8e8e8]">
          {vertexCount.toLocaleString()}
        </span>
      </UnrealPropertyRow>
      <UnrealPropertyRow label="Bones">
        <span className="block text-right text-[11px] font-mono text-[#e8e8e8]">
          {analysis.boneCount}
        </span>
      </UnrealPropertyRow>
      {analysis.warnings.map((warning, index) => (
        <UnrealStatusBanner key={`warn-${index}`} tone="warning">
          {warning}
        </UnrealStatusBanner>
      ))}
      {analysis.blockingErrors.map((error, index) => (
        <UnrealStatusBanner key={`err-${index}`} tone="error">
          {error}
        </UnrealStatusBanner>
      ))}
    </UnrealDetailsSection>
  );
}
