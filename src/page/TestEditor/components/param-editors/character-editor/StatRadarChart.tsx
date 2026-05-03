import { useMemo } from "react";
import type { TypedParamEntry } from "../../param-editor/typedParamTypes";

interface StatRadarChartProps {
  entry: TypedParamEntry | null;
}

const AXES = [
  { key: "maxHp", label: "HP", max: 1000 },
  { key: "baseUnitCost", label: "Cost", max: 6000 },
  { key: "walkSpeed", label: "Walk", max: 5 },
  { key: "mainShotDamage", label: "Main", max: 300 },
  { key: "meleeDamage", label: "Melee", max: 300 },
  { key: "redLockDistance", label: "Lock", max: 600 },
] as const;

const SIZE = 200;
const CX = SIZE / 2;
const CY = SIZE / 2;
const RADIUS = 80;
const GRID_LEVELS = [0.25, 0.5, 0.75, 1.0];

function polarToXY(angleDeg: number, r: number): [number, number] {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return [CX + r * Math.cos(rad), CY + r * Math.sin(rad)];
}

function hexagonPoints(r: number): string {
  return AXES.map((_, i) => {
    const angle = (360 / AXES.length) * i;
    const [x, y] = polarToXY(angle, r);
    return `${x},${y}`;
  }).join(" ");
}

function num(entry: TypedParamEntry, key: string): number {
  const v = entry[key];
  return typeof v === "number" ? v : 0;
}

export function StatRadarChart({ entry }: StatRadarChartProps) {
  const dataPoints = useMemo(() => {
    if (!entry) return null;
    return AXES.map((axis, i) => {
      const raw = num(entry, axis.key);
      const norm = Math.min(Math.max(raw / axis.max, 0), 1);
      const angle = (360 / AXES.length) * i;
      const [x, y] = polarToXY(angle, RADIUS * norm);
      return { x, y, norm, raw };
    });
  }, [entry]);

  const maxHp = entry ? num(entry, "maxHp") : 0;
  const hpMaxValue = entry ? num(entry, "hpMaxValue") : 0;
  const ehp = maxHp > 0 && hpMaxValue > 0 ? maxHp * (hpMaxValue / 100) : null;

  return (
    <div className="flex flex-col items-center gap-3 p-4">
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="shrink-0"
      >
        {GRID_LEVELS.map((level) => (
          <polygon
            key={level}
            points={hexagonPoints(RADIUS * level)}
            fill="none"
            stroke="currentColor"
            strokeOpacity={0.12}
            strokeWidth={1}
          />
        ))}

        {AXES.map((_, i) => {
          const angle = (360 / AXES.length) * i;
          const [x, y] = polarToXY(angle, RADIUS);
          return (
            <line
              key={i}
              x1={CX}
              y1={CY}
              x2={x}
              y2={y}
              stroke="currentColor"
              strokeOpacity={0.08}
              strokeWidth={1}
            />
          );
        })}

        {AXES.map((axis, i) => {
          const angle = (360 / AXES.length) * i;
          const [x, y] = polarToXY(angle, RADIUS + 16);
          return (
            <text
              key={axis.key}
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="central"
              className="fill-muted-foreground text-[9px]"
            >
              {axis.label}
            </text>
          );
        })}

        {dataPoints ? (
          <>
            <polygon
              points={dataPoints.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="hsl(var(--primary))"
              fillOpacity={0.2}
              stroke="hsl(var(--primary))"
              strokeWidth={1.5}
            />
            {dataPoints.map((p, i) => (
              <circle
                key={i}
                cx={p.x}
                cy={p.y}
                r={2.5}
                fill="hsl(var(--primary))"
              />
            ))}
          </>
        ) : (
          <text
            x={CX}
            y={CY}
            textAnchor="middle"
            dominantBaseline="central"
            className="fill-muted-foreground text-[11px]"
          >
            No entry selected
          </text>
        )}
      </svg>

      {ehp !== null && (
        <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-1.5 text-[11px]">
          <span className="text-muted-foreground">EHP</span>
          <span className="font-mono font-medium">
            {ehp.toFixed(1)}
          </span>
          <span className="text-[9px] text-muted-foreground">
            ({maxHp} x {(hpMaxValue / 100).toFixed(2)})
          </span>
        </div>
      )}
    </div>
  );
}
