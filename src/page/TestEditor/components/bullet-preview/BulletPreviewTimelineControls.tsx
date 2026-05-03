import {
  Crosshair,
  Eye,
  EyeOff,
  Pause,
  Play,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { decodeHitEffectHash } from "./hitEffectLabels";
import { MOVE_TYPE_LABELS } from "./TrajectorySimulator";
import { useBulletPreviewStore } from "./bulletPreviewStore";
import type { BulletPreviewVisualization } from "./bulletPreviewTypes";

const SPEED_OPTIONS = [0.25, 0.5, 1, 2, 4];

export function BulletPreviewTimelineControls() {
  const activeEntry = useBulletPreviewStore((state) => state.activeEntry);
  const trajectory = useBulletPreviewStore((state) => state.trajectory);
  const visualization = useBulletPreviewStore((state) => state.visualization);
  const playbackFrame = useBulletPreviewStore((state) => state.playbackFrame);
  const playbackSpeed = useBulletPreviewStore((state) => state.playbackSpeed);
  const isPlaying = useBulletPreviewStore((state) => state.isPlaying);

  const togglePlayback = useBulletPreviewStore((state) => state.togglePlayback);
  const resetPlayback = useBulletPreviewStore((state) => state.resetPlayback);
  const seekToHitFrame = useBulletPreviewStore((state) => state.seekToHitFrame);
  const seekToStart = useBulletPreviewStore((state) => state.seekToStart);
  const setPlaybackSpeed = useBulletPreviewStore((state) => state.setPlaybackSpeed);
  const setPlaybackFrame = useBulletPreviewStore((state) => state.setPlaybackFrame);
  const setVisualization = useBulletPreviewStore((state) => state.setVisualization);

  const frame = Math.floor(playbackFrame);
  const elapsed = (frame / 60).toFixed(2);
  const hasHit = trajectory !== null && trajectory.hitFrame < trajectory.totalFrames;
  const moveType = typeof activeEntry?.moveType === "number" ? activeEntry.moveType : 255;
  const hitEffectHash =
    typeof activeEntry?.hitEffectHash === "number" ? activeEntry.hitEffectHash : 0;

  const toggleLayer = (key: keyof BulletPreviewVisualization) => {
    setVisualization({ [key]: !visualization[key] } as Partial<BulletPreviewVisualization>);
  };

  if (!activeEntry) {
    return (
      <div className="flex h-12 items-center border-t border-border/60 px-3 text-[11px] text-muted-foreground">
        Select one bullet row from the left workbench to start simulation.
      </div>
    );
  }

  return (
    <div className="border-t border-border/60 bg-background/95">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5 text-[10px] text-muted-foreground">
        <span className="font-medium text-foreground">
          {MOVE_TYPE_LABELS[moveType] ?? `Type ${moveType}`}
        </span>
        <span>moveType={moveType}</span>
        {hitEffectHash > 0 ? (
          <span className="flex flex-wrap items-center gap-x-1">
            <span className="font-mono text-foreground">{hitEffectHash}</span>
            <span>({decodeHitEffectHash(hitEffectHash)})</span>
          </span>
        ) : null}
        {trajectory ? (
          <>
            <span>
              frame <span className="font-mono text-foreground">{frame}</span>/
              {trajectory.totalFrames}
            </span>
            <span>{elapsed}s</span>
            {hasHit ? (
              <span className="text-amber-400/95">intercept ~ frame {trajectory.hitFrame}</span>
            ) : null}
          </>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-2 border-t border-border/40 px-3 py-2">
        <Button
          size="sm"
          variant="ghost"
          className="h-8 w-8 p-0"
          type="button"
          onClick={togglePlayback}
        >
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 w-8 p-0"
          type="button"
          onClick={resetPlayback}
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 gap-1 px-2 text-[10px]"
          type="button"
          disabled={!hasHit}
          onClick={seekToHitFrame}
        >
          <Crosshair className="h-3.5 w-3.5" />
          Hit
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 px-2 text-[10px]"
          type="button"
          onClick={seekToStart}
        >
          Start
        </Button>

        {trajectory ? (
          <input
            type="range"
            min={0}
            max={Math.max(trajectory.totalFrames - 1, 0)}
            value={Math.min(frame, Math.max(trajectory.totalFrames - 1, 0))}
            onChange={(event) => setPlaybackFrame(Number(event.target.value))}
            className="mx-1 h-1.5 min-w-[140px] flex-1 cursor-pointer accent-orange-500"
          />
        ) : null}

        <div className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
          {SPEED_OPTIONS.map((speed) => (
            <button
              key={speed}
              type="button"
              onClick={() => setPlaybackSpeed(speed)}
              className={`rounded px-2 py-1 transition-colors ${
                playbackSpeed === speed
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "hover:bg-muted/80"
              }`}
            >
              {speed}x
            </button>
          ))}
        </div>

        <div className="mx-1 hidden h-5 w-px bg-border/45 lg:block" />

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px]">
          {(
            [
              ["trail", "Trail"],
              ["fullPathGhost", "Ghost"],
              ["hitbox", "Hitbox"],
              ["maxRangeAtTarget", "Max R"],
              ["effectiveRangeAtOrigin", "Eff R"],
              ["blastRadius", "Blast"],
              ["playerDummy", "Self"],
              ["enemyDummy", "Target"],
              ["distanceMeasure", "Span"],
              ["axisHelpers", "Axes"],
            ] as const
          ).map(([key, label]) => {
            const on = visualization[key];
            return (
              <button
                key={key}
                type="button"
                onClick={() => toggleLayer(key)}
                className={`flex items-center gap-1 rounded-md px-1.5 py-1 transition-colors ${
                  on ? "text-foreground" : "text-muted-foreground opacity-55"
                } hover:bg-muted/70`}
              >
                {on ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                {label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
