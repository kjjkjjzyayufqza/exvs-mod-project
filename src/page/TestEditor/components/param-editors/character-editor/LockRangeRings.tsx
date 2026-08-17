import { useMemo } from "react";
import type { TypedParamEntry } from "../../param-editor/typedParamTypes";
import {
  buildLockRingViews,
  formatGameNumber,
  hasNumericField,
  maxLockRingDistance,
  scaleRingRadius,
} from "./characterVisualizerHelpers";

interface LockRangeRingsProps {
  entry: TypedParamEntry;
}

const SIZE = 240;
const CX = SIZE / 2;
const CY = SIZE / 2;
const MAX_RADIUS = 100;

const RING_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "hsl(var(--primary))",
];

const LOCK_FOV_ANGLE_KEY = "lockOnFovAngle";

function polarToXY(angleDeg: number, r: number): [number, number] {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return [CX + r * Math.cos(rad), CY + r * Math.sin(rad)];
}

function fovWedgePath(fovDeg: number, radius: number): string {
  const half = Math.min(fovDeg, 359.9) / 2;
  const [x1, y1] = polarToXY(-half, radius);
  const [x2, y2] = polarToXY(half, radius);
  const largeArc = fovDeg > 180 ? 1 : 0;
  return `M ${CX} ${CY} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;
}

/**
 * Phase 3.3: top-down concentric-ring view of the six family-1 lock-distance
 * thresholds from sub_1405F8600, plus a lockOnFovAngle wedge overlay when the
 * field is present. Slot-to-HUD-color mapping is unproven, so labels stay
 * neutral (Slot 0-4 / Default).
 */
export function LockRangeRings({ entry }: LockRangeRingsProps) {
  const rings = useMemo(() => buildLockRingViews(entry), [entry]);
  const maxDistance = maxLockRingDistance(rings);
  const anyFieldPresent = rings.some((ring) => ring.distance !== null);

  const fovAngle = hasNumericField(entry, LOCK_FOV_ANGLE_KEY)
    ? (entry[LOCK_FOV_ANGLE_KEY] as number)
    : null;

  const drawableRings = rings
    .filter(
      (ring): ring is (typeof rings)[number] & { distance: number } =>
        ring.distance !== null && ring.distance > 0,
    )
    .sort((a, b) => b.distance - a.distance);

  return (
    <div className="rounded-md border bg-card p-3 shadow-sm">
      <h4 className="mb-2 text-[11px] font-semibold text-muted-foreground">
        Lock Distance Thresholds (family 1, top-down)
      </h4>

      {!anyFieldPresent ? (
        <div className="text-[10px] text-amber-700 dark:text-amber-400">
          field unavailable: no lockDistanceThresholdFamily1 fields are
          present in this entry.
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <svg
            width={SIZE}
            height={SIZE}
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            className="shrink-0"
          >
            {fovAngle !== null && fovAngle > 0 && (
              <path
                d={fovWedgePath(fovAngle, MAX_RADIUS)}
                fill="hsl(var(--primary))"
                fillOpacity={0.07}
                stroke="hsl(var(--primary))"
                strokeOpacity={0.25}
                strokeWidth={1}
              />
            )}

            {drawableRings.map((ring) => {
              const radius = scaleRingRadius(
                ring.distance,
                maxDistance,
                MAX_RADIUS,
              );
              return (
                <circle
                  key={ring.id}
                  cx={CX}
                  cy={CY}
                  r={radius}
                  fill="none"
                  stroke={RING_COLORS[ring.id]}
                  strokeWidth={1.5}
                  strokeDasharray={ring.id === 5 ? "4 3" : undefined}
                />
              );
            })}

            <circle cx={CX} cy={CY} r={3} fill="currentColor" />
            <text
              x={CX}
              y={CY + 12}
              textAnchor="middle"
              className="fill-muted-foreground text-[9px]"
            >
              self
            </text>
          </svg>

          <div className="flex min-w-40 flex-col gap-0.5 text-[10px]">
            {rings.map((ring) => (
              <div key={ring.id} className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: RING_COLORS[ring.id] }}
                />
                <span className="w-12">{ring.label}</span>
                {ring.distance !== null ? (
                  <span className="font-mono tabular-nums">
                    {formatGameNumber(ring.distance)}
                  </span>
                ) : (
                  <span className="text-amber-700 dark:text-amber-400">
                    unavailable
                  </span>
                )}
                <span className="truncate font-mono text-[9px] text-muted-foreground">
                  {ring.key}
                </span>
              </div>
            ))}
            <div className="mt-1 text-[9px] text-muted-foreground">
              {fovAngle !== null ? (
                <>
                  {LOCK_FOV_ANGLE_KEY}: {formatGameNumber(fovAngle)} deg
                  (wedge overlay)
                </>
              ) : (
                <span className="text-amber-700 dark:text-amber-400">
                  {LOCK_FOV_ANGLE_KEY}: unavailable
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
