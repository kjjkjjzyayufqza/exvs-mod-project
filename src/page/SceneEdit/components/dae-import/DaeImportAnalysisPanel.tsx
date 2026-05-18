import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import type { DaeAnalysisResult } from "./daeImportTypes";

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
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
        <Loader2 className="h-3 w-3 animate-spin" />
        Analyzing DAE...
      </div>
    );
  }

  if (analyzeError) {
    return (
      <div className="flex items-center gap-2 text-xs text-destructive py-2">
        <AlertCircle className="h-3 w-3" />
        {analyzeError}
      </div>
    );
  }

  if (!analysis) return null;

  const meshCount = analysis.meshRows.length;
  const vertexCount = analysis.meshRows.reduce((sum, r) => sum + r.vertexCount, 0);

  return (
    <div className="space-y-1 py-2">
      <div className="flex items-center gap-2 text-xs">
        {analysis.canConvert ? (
          <CheckCircle2 className="h-3 w-3 text-green-500" />
        ) : (
          <AlertCircle className="h-3 w-3 text-destructive" />
        )}
        <span className="text-muted-foreground">
          Meshes: {meshCount} | Vertices:{" "}
          {vertexCount.toLocaleString()} | Bones:{" "}
          {analysis.boneCount}
        </span>
      </div>
      {analysis.warnings.map((w, i) => (
        <p key={i} className="text-xs text-yellow-500 pl-5">
          {w}
        </p>
      ))}
      {analysis.blockingErrors.map((e, i) => (
        <p key={i} className="text-xs text-destructive pl-5">
          {e}
        </p>
      ))}
    </div>
  );
}
