import type { ShootingLoopResult } from "@/lib/gameAlgorithms/shootingLoop";
import type { TrajectoryResult } from "../../bullet-preview/TrajectorySimulator";

interface ShootingLoopPanelProps {
  result: ShootingLoopResult<TrajectoryResult> | null;
}

function formatFrames(frame: number): string {
  return `${frame}f (${(frame / 60).toFixed(2)}s)`;
}

function reasonLabel(reason: string): string {
  switch (reason) {
    case "hit":
      return "Hit";
    case "effectiveRange":
      return "Range despawn";
    case "lifetime":
      return "Lifetime end";
    default:
      return "Unknown stop";
  }
}

export function ShootingLoopPanel({ result }: ShootingLoopPanelProps) {
  if (!result) {
    return (
      <div className="rounded-md border bg-card p-3 text-[11px] text-muted-foreground shadow-sm">
        Load an armsparam and pick an arms entry to enable the manual shooting
        loop workbench.
      </div>
    );
  }

  const { timeline } = result;

  return (
    <div className="rounded-md border bg-card p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="text-[11px] font-semibold text-muted-foreground">
          Shooting Loop
        </h4>
        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
          manual pair
        </span>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
        <span className="text-muted-foreground">Startup:</span>
        <span className="font-mono">{formatFrames(timeline.startupFrame)}</span>
        <span className="text-muted-foreground">Active End:</span>
        <span className="font-mono">{formatFrames(timeline.activeEndFrame)}</span>
        <span className="text-muted-foreground">Recovery End:</span>
        <span className="font-mono">
          {formatFrames(timeline.recoveryEndFrame)}
        </span>
        <span className="text-muted-foreground">Cooldown End:</span>
        <span className="font-mono">
          {formatFrames(timeline.cooldownEndFrame)}
        </span>
        <span className="text-muted-foreground">Ammo:</span>
        <span className="font-mono">
          {result.ammoBeforeFire}
          {" -> "}
          {result.ammoAfterFire}
        </span>
      </div>

      <div className="mt-3 space-y-1 border-t pt-2">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Spawned Bullets
        </div>
        {result.shots.length === 0 ? (
          <div className="text-[11px] text-muted-foreground">No shots spawned.</div>
        ) : (
          result.shots.map((shot) => (
            <div
              key={shot.shotIndex}
              className="grid grid-cols-[40px_1fr] gap-x-2 rounded bg-muted/40 px-2 py-1 text-[11px]"
            >
              <span className="font-mono">#{shot.shotIndex + 1}</span>
              <span className="font-mono text-muted-foreground">
                spawn {shot.spawnFrame}f / end {shot.endFrame}f /{" "}
                {reasonLabel(shot.endReason)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
