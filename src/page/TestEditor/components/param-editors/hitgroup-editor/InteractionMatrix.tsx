import { formatHash } from "@/models/commandTable";
import type { TypedParamEntry } from "../../param-editor/typedParamTypes";

interface HitboxVisualizerProps {
  entry: TypedParamEntry | null;
}

function num(entry: TypedParamEntry, key: string): number {
  const v = entry[key];
  return typeof v === "number" ? v : 0;
}

const SVG_W = 400;
const SVG_H = 300;
const CX = SVG_W / 2;
const CY = SVG_H / 2;

export function InteractionMatrix({ entry }: HitboxVisualizerProps) {
  if (!entry) {
    return (
      <div className="flex h-full items-center justify-center rounded-md border bg-card text-xs text-muted-foreground">
        No entry selected
      </div>
    );
  }

  const radius = num(entry, "radius");
  const offsetX = num(entry, "offsetX");
  const offsetY = num(entry, "offsetY");
  const offsetZ = num(entry, "offsetZ");
  const boneHash = num(entry, "boneHash");
  const parentBoneHash = num(entry, "parentBoneHash");
  const hitType = num(entry, "hitType");

  const displayRadius = Math.min(Math.max(radius * 10, 5), 120);

  return (
    <div className="rounded-md border bg-card p-3 shadow-sm">
      <h4 className="mb-2 text-[11px] font-semibold text-muted-foreground">
        Hitbox Visualizer
      </h4>
      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        className="w-full"
        style={{ maxWidth: 460 }}
      >
        <line
          x1={CX}
          y1={0}
          x2={CX}
          y2={SVG_H}
          stroke="#1e293b"
          strokeWidth={0.5}
        />
        <line
          x1={0}
          y1={CY}
          x2={SVG_W}
          y2={CY}
          stroke="#1e293b"
          strokeWidth={0.5}
        />

        <circle
          cx={CX}
          cy={CY}
          r={8}
          fill="#475569"
          fillOpacity={0.5}
          stroke="#64748b"
          strokeWidth={1}
        />
        <text
          x={CX}
          y={CY + 3}
          textAnchor="middle"
          fontSize={7}
          fill="#94a3b8"
        >
          ORIGIN
        </text>

        <circle
          cx={CX + offsetX * 10}
          cy={CY - offsetY * 10}
          r={displayRadius}
          fill="hsl(210 80% 60%)"
          fillOpacity={0.15}
          stroke="hsl(210 80% 55%)"
          strokeWidth={1.5}
        />

        <text
          x={CX + offsetX * 10}
          y={CY - offsetY * 10 - displayRadius - 6}
          textAnchor="middle"
          fontSize={10}
          fill="hsl(210 80% 55%)"
          fontFamily="monospace"
        >
          r={radius.toFixed(2)}
        </text>

        <g fontSize={9} fill="#94a3b8" fontFamily="monospace">
          <text x={8} y={16}>
            Type: {hitType}
          </text>
          <text x={8} y={30}>
            Offset: ({offsetX.toFixed(1)}, {offsetY.toFixed(1)},{" "}
            {offsetZ.toFixed(1)})
          </text>
          <text x={8} y={44}>
            Bone: {formatHash(boneHash >>> 0)}
          </text>
          <text x={8} y={58}>
            Parent: {formatHash(parentBoneHash >>> 0)}
          </text>
        </g>

        {[25, 50, 75, 100].map((r) => (
          <g key={r}>
            <circle
              cx={CX}
              cy={CY}
              r={r}
              fill="none"
              stroke="#1e293b"
              strokeWidth={0.3}
              strokeDasharray="2 3"
            />
            <text
              x={CX + r + 2}
              y={CY - 2}
              fontSize={7}
              fill="#475569"
            >
              {(r / 10).toFixed(0)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
