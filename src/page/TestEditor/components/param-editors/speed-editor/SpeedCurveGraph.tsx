import type { TypedParamEntry } from "../../param-editor/typedParamTypes";

interface SpeedCurveGraphProps {
  entry: TypedParamEntry | null;
}

function num(entry: TypedParamEntry, key: string): number {
  const v = entry[key];
  return typeof v === "number" ? v : 0;
}

interface SpeedBar {
  label: string;
  value: number;
  color: string;
}

export function SpeedCurveGraph({ entry }: SpeedCurveGraphProps) {
  if (!entry) {
    return (
      <div className="flex h-40 items-center justify-center rounded-md border bg-card text-xs text-muted-foreground">
        No data
      </div>
    );
  }

  const bars: SpeedBar[] = [
    { label: "Walk", value: num(entry, "walkSpeedBase"), color: "#22c55e" },
    { label: "Run", value: num(entry, "groundRunSpeed"), color: "#10b981" },
    { label: "Dash Init", value: num(entry, "boostDashInitialSpeed"), color: "#3b82f6" },
    { label: "Dash Max", value: num(entry, "boostDashMaxSpeed"), color: "#60a5fa" },
    { label: "Air Dash", value: num(entry, "airDashSpeed"), color: "#8b5cf6" },
    { label: "Fall", value: num(entry, "fallSpeed"), color: "#f59e0b" },
  ];

  const maxVal = Math.max(...bars.map((b) => b.value), 1);

  const W = 320;
  const H = 140;
  const barH = 16;
  const gap = 6;
  const labelW = 70;

  return (
    <div className="rounded-md border bg-card p-3 shadow-sm">
      <h4 className="mb-2 text-[11px] font-semibold text-muted-foreground">
        Speed Comparison
      </h4>
      <svg viewBox={`0 0 ${W} ${bars.length * (barH + gap)}`} className="w-full">
        {bars.map((bar, i) => {
          const y = i * (barH + gap);
          const w = maxVal > 0 ? ((bar.value / maxVal) * (W - labelW - 50)) : 0;
          return (
            <g key={bar.label}>
              <text
                x={labelW - 4}
                y={y + barH / 2 + 3}
                textAnchor="end"
                className="text-[9px]"
                fill="#94a3b8"
              >
                {bar.label}
              </text>
              <rect
                x={labelW}
                y={y}
                width={Math.max(w, 0)}
                height={barH}
                rx={3}
                fill={bar.color}
                opacity={0.8}
              />
              <text
                x={labelW + Math.max(w, 0) + 4}
                y={y + barH / 2 + 3}
                className="text-[8px]"
                fill="#e2e8f0"
                fontFamily="monospace"
              >
                {bar.value.toFixed(2)}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="mt-2 grid grid-cols-3 gap-2 text-[10px]">
        <div className="text-center">
          <div className="font-mono font-medium text-green-400">
            {num(entry, "stepDistance").toFixed(1)}
          </div>
          <div className="text-muted-foreground">Step Distance</div>
        </div>
        <div className="text-center">
          <div className="font-mono font-medium text-blue-400">
            {num(entry, "boostGaugeCapacity").toFixed(0)}
          </div>
          <div className="text-muted-foreground">Boost Gauge</div>
        </div>
        <div className="text-center">
          <div className="font-mono font-medium text-amber-400">
            {num(entry, "jumpInitialVelocity").toFixed(2)}
          </div>
          <div className="text-muted-foreground">Jump Velocity</div>
        </div>
      </div>
    </div>
  );
}
