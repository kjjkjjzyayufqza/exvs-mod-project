import type { TypedParamEntry } from "../../param-editor/typedParamTypes";
import type { TrajectoryResult } from "../../bullet-preview/TrajectorySimulator";

interface BulletDpsPanelProps {
  entry: TypedParamEntry;
  trajectory: TrajectoryResult | null;
}

function calcDps(
  entry: TypedParamEntry,
  trajectory: TrajectoryResult | null,
): {
  damage: number;
  lifetime: number;
  dps: number;
  hitFrame: number;
  travelTime: string;
} {
  const damage = typeof entry.damage === "number" ? entry.damage : 0;
  const lifetime = trajectory?.totalFrames ?? 60;
  const hitFrame = trajectory?.hitFrame ?? lifetime;
  const dps = lifetime > 0 ? (damage * 60) / lifetime : 0;
  const travelTime = hitFrame > 0 ? `${(hitFrame / 60).toFixed(2)}s` : "\u2014";
  return { damage, lifetime, dps, hitFrame, travelTime };
}

export function BulletDpsPanel({ entry, trajectory }: BulletDpsPanelProps) {
  const stats = calcDps(entry, trajectory);

  return (
    <div className="rounded-md border bg-card p-3 shadow-sm">
      <h4 className="mb-2 text-[11px] font-semibold text-muted-foreground">
        Combat Stats
      </h4>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
        <span className="text-muted-foreground">Damage:</span>
        <span className="font-mono font-medium">{stats.damage}</span>
        <span className="text-muted-foreground">Lifetime:</span>
        <span className="font-mono">
          {stats.lifetime}f ({(stats.lifetime / 60).toFixed(2)}s)
        </span>
        <span className="text-muted-foreground">DPS (theoretical):</span>
        <span className="font-mono font-medium">{stats.dps.toFixed(1)}</span>
        <span className="text-muted-foreground">Hit Frame:</span>
        <span className="font-mono">{stats.hitFrame}f</span>
        <span className="text-muted-foreground">Travel Time:</span>
        <span className="font-mono">{stats.travelTime}</span>
        {trajectory && (
          <>
            <span className="text-muted-foreground">Max Range:</span>
            <span className="font-mono">
              {trajectory.maxRange.toFixed(1)}m
            </span>
            <span className="text-muted-foreground">Move Type:</span>
            <span className="font-mono">{trajectory.moveTypeLabel}</span>
          </>
        )}
      </div>
    </div>
  );
}
