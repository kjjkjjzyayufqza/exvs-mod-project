import { useMemo } from "react";

export interface TimelineSegment {
  label: string;
  frames: number;
  color: string;
  tooltip?: string;
}

interface TimelineVisualizerProps {
  segments: TimelineSegment[];
  totalFrames?: number;
  height?: number;
  showLabels?: boolean;
  showFrameCounts?: boolean;
  className?: string;
}

const SEGMENT_MIN_WIDTH_PX = 24;

export function TimelineVisualizer({
  segments,
  totalFrames: overrideTotalFrames,
  height = 32,
  showLabels = true,
  showFrameCounts = true,
  className,
}: TimelineVisualizerProps) {
  const totalFrames =
    overrideTotalFrames ?? segments.reduce((sum, s) => sum + s.frames, 0);
  const totalSeconds = totalFrames / 60;

  if (totalFrames <= 0) {
    return (
      <div
        className={`rounded-md border bg-card p-3 text-center text-[11px] text-muted-foreground ${className ?? ""}`}
      >
        No timeline data
      </div>
    );
  }

  return (
    <div className={`rounded-md border bg-card p-3 shadow-sm ${className ?? ""}`}>
      <div className="mb-1.5 flex items-center justify-between">
        <h4 className="text-[11px] font-semibold text-muted-foreground">
          Action Timeline
        </h4>
        <span className="font-mono text-[10px] text-muted-foreground">
          {totalFrames}f ({totalSeconds.toFixed(2)}s)
        </span>
      </div>

      <div
        className="flex w-full overflow-hidden rounded"
        style={{ height }}
      >
        {segments.map((seg, i) => {
          if (seg.frames <= 0) return null;
          const widthPct = (seg.frames / totalFrames) * 100;
          return (
            <div
              key={`${seg.label}-${i}`}
              className="flex items-center justify-center border-r border-black/20 last:border-r-0"
              style={{
                width: `${widthPct}%`,
                minWidth: widthPct > 0 ? SEGMENT_MIN_WIDTH_PX : 0,
                backgroundColor: seg.color,
              }}
              title={
                seg.tooltip ??
                `${seg.label}: ${seg.frames}f (${(seg.frames / 60).toFixed(2)}s)`
              }
            >
              {showLabels && widthPct > 8 && (
                <span className="truncate px-1 text-[9px] font-medium text-white drop-shadow">
                  {seg.label}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {showFrameCounts && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5">
          {segments.map((seg, i) => (
            <div
              key={`${seg.label}-${i}`}
              className="flex items-center gap-1.5"
            >
              <span
                className="inline-block h-2 w-2 rounded-sm"
                style={{ backgroundColor: seg.color }}
              />
              <span className="text-[10px] text-muted-foreground">
                {seg.label}:
              </span>
              <span className="font-mono text-[10px]">
                {seg.frames}f
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface FrameTickRulerProps {
  totalFrames: number;
  tickInterval?: number;
  height?: number;
  className?: string;
}

export function FrameTickRuler({
  totalFrames,
  tickInterval: overrideInterval,
  height = 20,
  className,
}: FrameTickRulerProps) {
  const tickInterval = overrideInterval ?? computeTickInterval(totalFrames);
  const ticks = useMemo(() => {
    const result: number[] = [];
    for (let f = 0; f <= totalFrames; f += tickInterval) {
      result.push(f);
    }
    return result;
  }, [totalFrames, tickInterval]);

  if (totalFrames <= 0) return null;

  return (
    <div
      className={`relative w-full border-t border-muted ${className ?? ""}`}
      style={{ height }}
    >
      {ticks.map((f) => {
        const pct = (f / totalFrames) * 100;
        return (
          <div
            key={f}
            className="absolute flex flex-col items-center"
            style={{ left: `${pct}%`, transform: "translateX(-50%)" }}
          >
            <div className="h-1.5 w-px bg-muted-foreground/40" />
            <span className="mt-0.5 text-[8px] text-muted-foreground/60">
              {f}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function computeTickInterval(total: number): number {
  if (total <= 30) return 5;
  if (total <= 120) return 10;
  if (total <= 300) return 30;
  if (total <= 600) return 60;
  return 120;
}

export function buildWeaponTimeline(
  startupFrame: number,
  activeFrame: number,
  recoveryFrame: number,
  cooldownFrame: number,
): TimelineSegment[] {
  return [
    { label: "Startup", frames: startupFrame, color: "#eab308" },
    { label: "Active", frames: activeFrame, color: "#22c55e" },
    { label: "Recovery", frames: recoveryFrame, color: "#ef4444" },
    { label: "Cooldown", frames: cooldownFrame, color: "#6366f1" },
  ];
}

export function buildMeleeTimeline(
  startupFrame: number,
  trackingFrame: number,
  totalFrame: number,
  recoveryFrame: number,
  cancelFrame: number,
): TimelineSegment[] {
  const activeFrame = Math.max(0, totalFrame - startupFrame - recoveryFrame);
  return [
    { label: "Startup", frames: startupFrame, color: "#eab308" },
    {
      label: "Tracking",
      frames: Math.min(trackingFrame, activeFrame),
      color: "#60a5fa",
    },
    {
      label: "Active",
      frames: Math.max(0, activeFrame - trackingFrame),
      color: "#22c55e",
    },
    { label: "Recovery", frames: recoveryFrame, color: "#ef4444" },
    {
      label: "Cancel",
      frames: cancelFrame,
      color: "#a78bfa",
      tooltip: `Cancel window at frame ${totalFrame - cancelFrame}`,
    },
  ];
}

export function buildReloadTimeline(
  reloadType: number,
  reloadTimeTotal: number,
  reloadPerShotFrame: number,
  ammoCount: number,
  overheatFrame: number,
  chargeFrame: number,
): TimelineSegment[] {
  switch (reloadType) {
    case 0:
      return [
        { label: "Reload", frames: reloadTimeTotal, color: "#64748b" },
      ];
    case 1: {
      const totalReload = reloadPerShotFrame * Math.max(1, ammoCount);
      return [
        {
          label: "Per-shot reload",
          frames: totalReload,
          color: "#64748b",
          tooltip: `${reloadPerShotFrame}f × ${ammoCount} rounds`,
        },
      ];
    }
    case 2:
      return [
        { label: "Overheat cooldown", frames: overheatFrame, color: "#dc2626" },
      ];
    case 3:
      return [
        { label: "Charge", frames: chargeFrame, color: "#2563eb" },
      ];
    default:
      return [
        { label: "Reload", frames: reloadTimeTotal, color: "#64748b" },
      ];
  }
}
