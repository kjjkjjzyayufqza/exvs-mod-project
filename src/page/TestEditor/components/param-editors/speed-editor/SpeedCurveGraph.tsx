import type { TypedParamEntry } from "../../param-editor/typedParamTypes";
import { getMovementCurves } from "@/lib/gameAlgorithms/movementParamSemantics";

interface SpeedCurveGraphProps {
  entry: TypedParamEntry | null;
}

export function SpeedCurveGraph({ entry }: SpeedCurveGraphProps) {
  if (!entry) {
    return (
      <div className="flex h-40 items-center justify-center rounded-md border bg-card text-xs text-muted-foreground">
        No data
      </div>
    );
  }

  const curves = getMovementCurves(entry);

  return (
    <div className="rounded-md border bg-card p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="text-[11px] font-semibold text-muted-foreground">
          Confirmed movement triplets
        </h4>
        <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-medium text-emerald-400">
          Evidence A
        </span>
      </div>
      <div className="grid grid-cols-[minmax(120px,1fr)_repeat(3,minmax(54px,auto))] gap-x-3 gap-y-1 text-[10px]">
        <span className="text-muted-foreground">MSC consumer</span>
        <span className="text-right text-muted-foreground">Initial</span>
        <span className="text-right text-muted-foreground">Delta</span>
        <span className="text-right text-muted-foreground">Terminal</span>
        {curves.map((curve) => (
          <div className="contents" key={curve.id}>
            <span className="truncate">{curve.label}</span>
            <span className="text-right font-mono">{curve.initial}</span>
            <span className="text-right font-mono">{curve.delta}</span>
            <span className="text-right font-mono">{curve.terminal}</span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[9px] leading-relaxed text-muted-foreground">
        Raw parameters only. Native scaling and action transitions are not yet
        sufficient to derive world distance, seconds, or a simulated curve.
      </p>
    </div>
  );
}
