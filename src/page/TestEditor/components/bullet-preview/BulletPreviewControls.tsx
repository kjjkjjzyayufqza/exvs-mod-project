import { Play, Pause, RotateCcw, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBulletPreviewStore } from "./bulletPreviewStore";
import { MOVE_TYPE_LABELS } from "./TrajectorySimulator";
import { decodeHitEffectHash } from "./hitEffectLabels";

const SPEED_OPTIONS = [0.25, 0.5, 1, 2, 4];

export function BulletPreviewControls() {
  const entry = useBulletPreviewStore((s) => s.entry);
  const trajectory = useBulletPreviewStore((s) => s.trajectory);
  const currentFrame = useBulletPreviewStore((s) => s.currentFrame);
  const isPlaying = useBulletPreviewStore((s) => s.isPlaying);
  const playbackSpeed = useBulletPreviewStore((s) => s.playbackSpeed);
  const targetDistance = useBulletPreviewStore((s) => s.targetDistance);
  const showTrail = useBulletPreviewStore((s) => s.showTrail);
  const showRange = useBulletPreviewStore((s) => s.showRange);
  const showHitbox = useBulletPreviewStore((s) => s.showHitbox);

  const togglePlayback = useBulletPreviewStore((s) => s.togglePlayback);
  const reset = useBulletPreviewStore((s) => s.reset);
  const setPlaybackSpeed = useBulletPreviewStore((s) => s.setPlaybackSpeed);
  const setCurrentFrame = useBulletPreviewStore((s) => s.setCurrentFrame);
  const setTargetDistance = useBulletPreviewStore((s) => s.setTargetDistance);
  const setShowTrail = useBulletPreviewStore((s) => s.setShowTrail);
  const setShowRange = useBulletPreviewStore((s) => s.setShowRange);
  const setShowHitbox = useBulletPreviewStore((s) => s.setShowHitbox);

  const frame = Math.floor(currentFrame);
  const elapsed = (frame / 60).toFixed(2);

  if (!entry) {
    return (
      <div className="flex h-12 items-center justify-center border-t border-border/40 bg-background/80 px-4 text-xs text-muted-foreground">
        Select a bulletparam entry in the Param Editor to preview its trajectory
      </div>
    );
  }

  const moveType = typeof entry.moveType === "number" ? entry.moveType : 255;
  const moveLabel = MOVE_TYPE_LABELS[moveType] ?? `Type ${moveType}`;
  const hitEffectHash = typeof entry.hitEffectHash === "number" ? entry.hitEffectHash : 0;

  return (
    <div className="flex flex-col gap-0 border-t border-border/40 bg-background/90">
      {/* Info bar */}
      <div className="flex items-center gap-4 px-3 py-1.5 text-[10px] text-muted-foreground">
        <span>
          <span className="font-medium text-foreground">{moveLabel}</span>
          <span className="ml-1 opacity-60">(moveType={moveType})</span>
        </span>
        {hitEffectHash > 0 && (
          <span title={`hitEffectHash=${hitEffectHash}`}>
            hitEffect=<span className="font-mono text-foreground">{hitEffectHash}</span>
            <span className="ml-1 opacity-60">({decodeHitEffectHash(hitEffectHash)})</span>
          </span>
        )}
        {trajectory && (
          <>
            <span>
              Frame: <span className="font-mono text-foreground">{frame}</span>/{trajectory.totalFrames}
            </span>
            <span>{elapsed}s</span>
            {trajectory.hitFrame < trajectory.totalFrames && (
              <span className="text-amber-400">
                Hit @ frame {trajectory.hitFrame}
              </span>
            )}
          </>
        )}
        <span className="ml-auto">
          speed=<span className="font-mono">{typeof entry.initialSpeed === "number" ? entry.initialSpeed.toFixed(1) : "?"}</span>
          {" "}life=<span className="font-mono">{typeof entry.lifetime === "number" ? entry.lifetime : "?"}</span>
          {" "}grav=<span className="font-mono">{typeof entry.gravityRate === "number" ? entry.gravityRate.toFixed(3) : "?"}</span>
          {" "}homing=<span className="font-mono">{typeof entry.homingStrength === "number" ? entry.homingStrength.toFixed(2) : "?"}</span>
        </span>
      </div>

      {/* Control bar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-t border-border/20">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0"
          onClick={togglePlayback}
        >
          {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0"
          onClick={reset}
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </Button>

        {/* Frame scrubber */}
        {trajectory && (
          <input
            type="range"
            min={0}
            max={trajectory.totalFrames - 1}
            value={frame}
            onChange={(e) => setCurrentFrame(Number(e.target.value))}
            className="mx-2 h-1 min-w-[120px] flex-1 cursor-pointer accent-red-500"
          />
        )}

        {/* Speed selector */}
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          {SPEED_OPTIONS.map((s) => (
            <button
              key={s}
              onClick={() => setPlaybackSpeed(s)}
              className={`rounded px-1.5 py-0.5 ${
                playbackSpeed === s
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted"
              }`}
            >
              {s}x
            </button>
          ))}
        </div>

        <div className="mx-2 h-4 w-px bg-border/40" />

        {/* Target distance */}
        <div className="flex items-center gap-1 text-[10px]">
          <span className="text-muted-foreground">Target:</span>
          <input
            type="number"
            min={5}
            max={500}
            step={5}
            value={targetDistance}
            onChange={(e) => setTargetDistance(Number(e.target.value))}
            className="h-6 w-14 rounded border border-border/40 bg-background px-1 text-center text-[10px] font-mono"
          />
        </div>

        <div className="mx-2 h-4 w-px bg-border/40" />

        {/* Visibility toggles */}
        <button
          onClick={() => setShowTrail(!showTrail)}
          className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] ${showTrail ? "text-foreground" : "text-muted-foreground opacity-50"}`}
          title="Toggle trail"
        >
          {showTrail ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
          Trail
        </button>
        <button
          onClick={() => setShowRange(!showRange)}
          className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] ${showRange ? "text-foreground" : "text-muted-foreground opacity-50"}`}
          title="Toggle range spheres"
        >
          {showRange ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
          Range
        </button>
        <button
          onClick={() => setShowHitbox(!showHitbox)}
          className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] ${showHitbox ? "text-foreground" : "text-muted-foreground opacity-50"}`}
          title="Toggle hitbox"
        >
          {showHitbox ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
          Hitbox
        </button>
      </div>
    </div>
  );
}
