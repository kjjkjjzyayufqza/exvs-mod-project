import type { TypedParamEntry } from "../../param-editor/typedParamTypes";

interface GrabRangeVisualizerProps {
  entry: TypedParamEntry | null;
}

const SVG_W = 400;
const SVG_H = 300;
const CX = SVG_W / 2;
const CY = SVG_H * 0.5;

function num(entry: TypedParamEntry, key: string): number {
  const v = entry[key];
  return typeof v === "number" ? v : 0;
}

export function GrabRangeVisualizer({ entry }: GrabRangeVisualizerProps) {
  if (!entry) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        No entry selected
      </div>
    );
  }

  const reach = num(entry, "reach");
  const damage = num(entry, "damage");
  const startupFrame = num(entry, "startupFrame");
  const trackingFrame = num(entry, "trackingFrame");
  const grapTotalFrame = num(entry, "grapTotalFrame");
  const recoveryFrame = num(entry, "recoveryFrame");

  const maxReach = 100;
  const radiusScale = Math.min(reach / maxReach, 1) * 100;

  const totalTimeline = Math.max(startupFrame + trackingFrame + grapTotalFrame + recoveryFrame, 1);
  const barY = SVG_H - 60;
  const barW = SVG_W - 60;
  const barX = 30;
  const barH = 18;

  const phases = [
    { label: "Startup", frames: startupFrame, color: "#f59e0b" },
    { label: "Tracking", frames: trackingFrame, color: "#3b82f6" },
    { label: "Active", frames: grapTotalFrame, color: "#22c55e" },
    { label: "Recovery", frames: recoveryFrame, color: "#94a3b8" },
  ];

  let phaseX = barX;

  return (
    <div className="flex h-full flex-col items-center justify-center p-4">
      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        className="w-full max-w-[400px]"
        style={{ aspectRatio: `${SVG_W}/${SVG_H}` }}
      >
        <circle
          cx={CX}
          cy={CY - 20}
          r={12}
          fill="hsl(0 0% 50%)"
          fillOpacity={0.3}
          stroke="hsl(0 0% 60%)"
          strokeWidth={1.5}
        />
        <text
          x={CX}
          y={CY - 17}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={8}
          fill="currentColor"
          fillOpacity={0.6}
        >
          UNIT
        </text>

        {radiusScale > 0 && (
          <>
            <circle
              cx={CX}
              cy={CY - 20}
              r={radiusScale}
              fill="hsl(210 80% 60%)"
              fillOpacity={0.1}
              stroke="hsl(210 80% 55%)"
              strokeWidth={1.5}
              strokeDasharray="4 2"
            />
            <text
              x={CX + radiusScale + 6}
              y={CY - 24}
              fontSize={10}
              fill="hsl(210 80% 55%)"
              fontFamily="monospace"
            >
              Reach: {reach}
            </text>
          </>
        )}

        <text
          x={CX}
          y={CY + 20}
          textAnchor="middle"
          fontSize={14}
          fill="#ef4444"
          fontFamily="monospace"
          fontWeight={600}
        >
          DMG {damage}
        </text>

        {phases.map((phase) => {
          const w = (phase.frames / totalTimeline) * barW;
          const x = phaseX;
          phaseX += w;
          if (phase.frames <= 0) return null;
          return (
            <g key={phase.label}>
              <rect
                x={x}
                y={barY}
                width={Math.max(w, 1)}
                height={barH}
                fill={phase.color}
                opacity={0.7}
                rx={2}
              />
              {w > 30 && (
                <text
                  x={x + w / 2}
                  y={barY + barH / 2 + 3}
                  textAnchor="middle"
                  fontSize={8}
                  fill="#fff"
                  fontFamily="monospace"
                >
                  {phase.label} {phase.frames}f
                </text>
              )}
            </g>
          );
        })}

        <text
          x={SVG_W / 2}
          y={barY - 6}
          textAnchor="middle"
          fontSize={9}
          fill="#94a3b8"
        >
          Frame Timeline (total: {totalTimeline}f)
        </text>

        <g fontSize={9} fill="currentColor" fillOpacity={0.5}>
          {phases.map((phase, i) => (
            <g key={phase.label}>
              <rect
                x={8}
                y={8 + i * 14}
                width={8}
                height={8}
                rx={1}
                fill={phase.color}
                fillOpacity={0.7}
              />
              <text x={20} y={15 + i * 14}>
                {phase.label}
              </text>
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}
