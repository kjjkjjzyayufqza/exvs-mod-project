import { memo, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Pause, Play, RotateCcw, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useSsbhModelPreview } from "./SsbhModelPreviewContext";
import type { MotionBoneLocal } from "./motionPreviewTypes";
import type { SkelDataJson } from "./types";

const MAX_RENDERED_BONE_KEYS = 400;

type TimelineMark = {
  frame: number;
  left: number;
  major: boolean;
};

const TimelineRuler = memo(function TimelineRuler({ marks }: { marks: TimelineMark[] }) {
  return (
    <div className="relative h-5 border-b border-border/60 bg-background/80">
      {marks.map((mark) => (
        <span
          key={`ruler-${mark.frame}`}
          className={cn("absolute bottom-0 block w-px bg-border/80", mark.major ? "h-5" : "h-2")}
          style={{ left: `${mark.left}%` }}
        />
      ))}
      {marks
        .filter((mark) => mark.major)
        .map((mark) => (
          <span
            key={`label-${mark.frame}`}
            className="pointer-events-none absolute top-0 -translate-x-1/2 px-1 font-mono text-[9px] text-muted-foreground"
            style={{ left: `${mark.left}%` }}
          >
            {mark.frame}
          </span>
        ))}
    </div>
  );
});

const TimelineMajorGrid = memo(function TimelineMajorGrid({ marks }: { marks: TimelineMark[] }) {
  return (
    <>
      {marks
        .filter((mark) => mark.major)
        .map((mark) => (
          <span
            key={`grid-${mark.frame}`}
            className="pointer-events-none absolute bottom-0 top-0 block w-px bg-border/35"
            style={{ left: `${mark.left}%` }}
          />
        ))}
    </>
  );
});

const BoneKeyMarkers = memo(function BoneKeyMarkers({
  frames,
  safeMax,
}: {
  frames: number[];
  safeMax: number;
}) {
  const percents = useMemo(
    () => frames.map((frame) => clamp01(frame / safeMax) * 100),
    [frames, safeMax],
  );
  return (
    <>
      {percents.slice(0, -1).map((left, index) => (
        <span
          key={`segment-${frames[index]}-${frames[index + 1]}`}
          className="pointer-events-none absolute top-1/2 block h-px -translate-y-1/2 bg-primary/55"
          style={{
            left: `${left}%`,
            width: `${Math.max(0.1, percents[index + 1] - left)}%`,
          }}
        />
      ))}
      {percents.map((left, index) => (
        <span
          key={`key-${frames[index]}`}
          className="pointer-events-none absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-primary/80 bg-primary/30 shadow-[0_0_0_1px_rgba(0,0,0,0.15)]"
          style={{ left: `${left}%` }}
        />
      ))}
    </>
  );
});

function clampFrame(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    throw new Error("Frame value must be finite");
  }
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

function clamp01(value: number): number {
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

function getNiceStep(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) {
    return 1;
  }
  const base = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / base;
  if (n <= 1) {
    return 1 * base;
  }
  if (n <= 2) {
    return 2 * base;
  }
  if (n <= 5) {
    return 5 * base;
  }
  return 10 * base;
}

function lerpNumber(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpVec3(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  t: number,
): [number, number, number] {
  return [
    lerpNumber(a[0], b[0], t),
    lerpNumber(a[1], b[1], t),
    lerpNumber(a[2], b[2], t),
  ];
}

function normalizeQuat(x: number, y: number, z: number, w: number): [number, number, number, number] {
  const len = Math.hypot(x, y, z, w);
  if (len <= 1e-8) {
    return [0, 0, 0, 1];
  }
  return [x / len, y / len, z / len, w / len];
}

function lerpQuat(
  a: readonly [number, number, number, number],
  b: readonly [number, number, number, number],
  t: number,
): [number, number, number, number] {
  let bx = b[0];
  let by = b[1];
  let bz = b[2];
  let bw = b[3];
  const dot = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;
  if (dot < 0) {
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
  }
  return normalizeQuat(
    lerpNumber(a[0], bx, t),
    lerpNumber(a[1], by, t),
    lerpNumber(a[2], bz, t),
    lerpNumber(a[3], bw, t),
  );
}

function sampleBoneLocalAtFrame(
  frame: number,
  loop: boolean,
  finalFrameIndex: number,
  frames: readonly { boneLocals: MotionBoneLocal[] }[],
  boneIndex: number,
): MotionBoneLocal | null {
  const frameCount = frames.length;
  if (frameCount <= 0 || boneIndex < 0) {
    return null;
  }
  const maxIndex = frameCount - 1;
  let f = frame;
  if (loop) {
    f = finalFrameIndex > 0 ? ((f % finalFrameIndex) + finalFrameIndex) % finalFrameIndex : 0;
  } else if (f < 0) {
    f = 0;
  } else if (f > maxIndex) {
    f = maxIndex;
  }
  const currentIndex = Math.floor(f);
  const nextIndex = loop ? (currentIndex + 1) % frameCount : Math.min(currentIndex + 1, maxIndex);
  const current = frames[currentIndex]?.boneLocals[boneIndex];
  const next = frames[nextIndex]?.boneLocals[boneIndex];
  if (!current || !next) {
    return null;
  }
  const factor = f - currentIndex;
  if (factor <= 1e-8 || currentIndex === nextIndex) {
    return current;
  }
  return {
    translation: lerpVec3(current.translation, next.translation, factor),
    rotation: lerpQuat(current.rotation, next.rotation, factor),
    scale: lerpVec3(current.scale, next.scale, factor),
  };
}

type SsbhModelViewportTimelineProps = {
  onScrubStart: () => void;
  onScrubPreview: (frame: number) => void;
  onScrubEnd: (frame: number) => void;
};

export function SsbhModelViewportTimeline({
  onScrubStart,
  onScrubPreview,
  onScrubEnd,
}: SsbhModelViewportTimelineProps) {
  const p = useSsbhModelPreview();
  const maxFrame = Math.max(0, p.motionManifest?.finalFrameIndex ?? 0);
  const hasMotion = Boolean(p.motionSelectedNuanmbPath) && Boolean(p.motionClip) && maxFrame > 0;
  const [rangeEnabled, setRangeEnabled] = useState(false);
  const [rangeIn, setRangeIn] = useState(0);
  const [rangeOut, setRangeOut] = useState(maxFrame);
  const [frameInputText, setFrameInputText] = useState("0");
  const [scrubFrame, setScrubFrame] = useState<number | null>(null);
  const [boneFilter, setBoneFilter] = useState("");
  const skel = p.bundle?.skel ? (p.bundle.skel as SkelDataJson) : null;
  const boneNames = useMemo(() => skel?.bones.map((bone) => bone.name) ?? [], [skel]);
  const deferredBoneFilter = useDeferredValue(boneFilter);
  const [selectedBoneIndex, setSelectedBoneIndex] = useState<number>(0);
  const [, setPlaybackUiTick] = useState(0);
  const playheadRef = useRef(p.motionFrame);
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef<number | null>(null);
  const activeMin = rangeEnabled ? Math.min(rangeIn, rangeOut) : 0;
  const activeMax = rangeEnabled ? Math.max(rangeIn, rangeOut) : maxFrame;
  const timelineTrackRef = useRef<HTMLDivElement | null>(null);
  const boneRowsRef = useRef<HTMLDivElement | null>(null);
  const activePointerIdRef = useRef<number | null>(null);

  useEffect(() => {
    setRangeOut(maxFrame);
  }, [maxFrame]);

  useEffect(() => {
    if (boneNames.length === 0) {
      setSelectedBoneIndex(0);
      return;
    }
    if (selectedBoneIndex >= boneNames.length) {
      setSelectedBoneIndex(0);
    }
  }, [boneNames.length, selectedBoneIndex]);

  useEffect(() => {
    if (scrubFrame !== null) {
      return;
    }
    if (p.motionPlaying) {
      return;
    }
    playheadRef.current = clampFrame(p.motionFrame, 0, maxFrame);
    setFrameInputText(String(Math.round(playheadRef.current)));
  }, [p.motionFrame, maxFrame, scrubFrame, p.motionPlaying]);

  useEffect(() => {
    if (!p.motionPlaying || !hasMotion || scrubFrame !== null) {
      lastTickRef.current = null;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }
    const tick = (now: number) => {
      const last = lastTickRef.current ?? now;
      lastTickRef.current = now;
      const dt = (now - last) / 1000;
      const speed = p.motionSpeed;
      const min = rangeEnabled ? Math.min(rangeIn, rangeOut) : 0;
      const max = rangeEnabled ? Math.max(rangeIn, rangeOut) : maxFrame;
      let next = playheadRef.current + dt * 60 * speed;
      if (p.motionLoop) {
        const span = Math.max(1e-6, max - min);
        next = ((next - min) % span + span) % span + min;
      } else if (next >= max) {
        next = max;
      }
      playheadRef.current = clampFrame(next, min, max);
      setPlaybackUiTick((t) => t + 1);
      if (!p.motionLoop && next >= max) {
        p.setMotionFrame(playheadRef.current);
        p.setMotionPlaying(false);
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [
    hasMotion,
    maxFrame,
    p.motionPlaying,
    p.motionSpeed,
    p.motionLoop,
    p.setMotionFrame,
    p.setMotionPlaying,
    rangeEnabled,
    rangeIn,
    rangeOut,
    scrubFrame,
  ]);

  const displayFrame = scrubFrame ?? (p.motionPlaying ? playheadRef.current : p.motionFrame);
  const framePercent = maxFrame > 0 ? (displayFrame / maxFrame) * 100 : 0;
  const rangeStartPercent = maxFrame > 0 ? (Math.min(rangeIn, rangeOut) / maxFrame) * 100 : 0;
  const rangeEndPercent = maxFrame > 0 ? (Math.max(rangeIn, rangeOut) / maxFrame) * 100 : 0;

  const timelineScale = useMemo(() => {
    const safeMax = Math.max(1, Math.ceil(maxFrame));
    const majorStep = Math.max(1, Math.floor(getNiceStep(safeMax / 12)));
    const minorStep = Math.max(1, Math.floor(majorStep / 5));
    const marks: { frame: number; left: number; major: boolean }[] = [];
    for (let frame = 0; frame <= safeMax; frame += minorStep) {
      const major = frame % majorStep === 0;
      marks.push({
        frame,
        left: (frame / safeMax) * 100,
        major,
      });
    }
    if (marks.length === 0 || marks[marks.length - 1]?.frame !== safeMax) {
      marks.push({ frame: safeMax, left: 100, major: true });
    }
    return { marks, safeMax };
  }, [maxFrame]);

  const filteredBoneRows = useMemo(() => {
    const q = deferredBoneFilter.trim().toLowerCase();
    const rows: Array<{ name: string; index: number }> = [];
    for (let index = 0; index < boneNames.length; index += 1) {
      const name = boneNames[index];
      if (!q || name.toLowerCase().includes(q)) {
        rows.push({ name, index });
      }
    }
    return rows;
  }, [boneNames, deferredBoneFilter]);
  const boneRowVirtualizer = useVirtualizer({
    count: filteredBoneRows.length,
    getScrollElement: () => boneRowsRef.current,
    estimateSize: () => 28,
    getItemKey: (index) => filteredBoneRows[index]?.index ?? index,
    overscan: 6,
  });

  const currentBoneLocal = useMemo(() => {
    if (!p.motionClip || boneNames.length === 0) {
      return null;
    }
    return sampleBoneLocalAtFrame(
      displayFrame,
      p.motionLoop,
      p.motionClip.finalFrameIndex,
      p.motionClip.frames,
      selectedBoneIndex,
    );
  }, [p.motionClip, p.motionLoop, displayFrame, boneNames.length, selectedBoneIndex]);

  const boneKeyframes = useMemo(() => {
    if (!p.motionClip || selectedBoneIndex < 0) {
      return [] as number[];
    }
    const out: number[] = [];
    const frames = p.motionClip.frames;
    let prev: MotionBoneLocal | null = null;
    for (let i = 0; i < frames.length; i++) {
      const cur = frames[i]?.boneLocals[selectedBoneIndex] ?? null;
      if (!cur) {
        continue;
      }
      if (!prev) {
        out.push(i);
        prev = cur;
        continue;
      }
      const tDiff =
        Math.abs(cur.translation[0] - prev.translation[0]) +
        Math.abs(cur.translation[1] - prev.translation[1]) +
        Math.abs(cur.translation[2] - prev.translation[2]);
      const rDiff =
        Math.abs(cur.rotation[0] - prev.rotation[0]) +
        Math.abs(cur.rotation[1] - prev.rotation[1]) +
        Math.abs(cur.rotation[2] - prev.rotation[2]) +
        Math.abs(cur.rotation[3] - prev.rotation[3]);
      const sDiff =
        Math.abs(cur.scale[0] - prev.scale[0]) +
        Math.abs(cur.scale[1] - prev.scale[1]) +
        Math.abs(cur.scale[2] - prev.scale[2]);
      if (tDiff + rDiff + sDiff > 1e-6) {
        out.push(i);
      }
      prev = cur;
    }
    return out;
  }, [p.motionClip, selectedBoneIndex]);

  const renderedBoneKeyframes = useMemo(() => {
    if (boneKeyframes.length <= MAX_RENDERED_BONE_KEYS) return boneKeyframes;
    const sampled: number[] = [];
    const lastIndex = boneKeyframes.length - 1;
    for (let index = 0; index < MAX_RENDERED_BONE_KEYS; index += 1) {
      const sourceIndex = Math.round((index / (MAX_RENDERED_BONE_KEYS - 1)) * lastIndex);
      const frame = boneKeyframes[sourceIndex];
      if (sampled[sampled.length - 1] !== frame) sampled.push(frame);
    }
    return sampled;
  }, [boneKeyframes]);

  const scrubToClientX = (clientX: number): number => {
    const el = timelineTrackRef.current;
    if (!el) {
      throw new Error("Timeline track ref is missing");
    }
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) {
      throw new Error("Timeline track width must be positive");
    }
    const ratio = clamp01((clientX - rect.left) / rect.width);
    const projected = ratio * timelineScale.safeMax;
    return clampFrame(projected, activeMin, activeMax);
  };

  const beginTimelineScrub = (clientX: number): void => {
    const next = scrubToClientX(clientX);
    playheadRef.current = next;
    setScrubFrame(next);
    onScrubStart();
    onScrubPreview(next);
    p.setMotionPlaying(false);
  };

  const updateTimelineScrub = (clientX: number): void => {
    const next = scrubToClientX(clientX);
    playheadRef.current = next;
    setScrubFrame(next);
    onScrubPreview(next);
  };

  const commitScrubFrame = (frame: number): void => {
    const snapped = clampFrame(Math.round(frame), activeMin, activeMax);
    playheadRef.current = snapped;
    onScrubEnd(snapped);
  };

  const flushScrubCommit = (): void => {
    if (scrubFrame === null) {
      return;
    }
    commitScrubFrame(scrubFrame);
    setScrubFrame(null);
  };

  return (
    <div className="rounded-md border border-border/60 bg-background/80 px-2 py-2 backdrop-blur-sm">
      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 px-2"
          disabled={!hasMotion}
          onClick={() => {
            const target = rangeEnabled ? activeMin : 0;
            playheadRef.current = target;
            setScrubFrame(null);
            p.setMotionFrame(target);
            p.setMotionPlaying(false);
          }}
          title="Jump to start"
        >
          <ChevronsLeft className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          size="sm"
          variant={p.motionPlaying ? "secondary" : "default"}
          className="h-7 px-2"
          disabled={!hasMotion || p.motionSampling}
          onClick={() => {
            if (!p.motionPlaying) {
              const current = clampFrame(displayFrame, 0, maxFrame);
              const target = rangeEnabled ? clampFrame(current, activeMin, activeMax) : current;
              setScrubFrame(null);
              p.setMotionFrame(target);
              playheadRef.current = target;
            } else {
              p.setMotionFrame(clampFrame(playheadRef.current, 0, maxFrame));
            }
            p.setMotionPlaying(!p.motionPlaying);
          }}
          title={p.motionPlaying ? "Pause playback" : "Play"}
        >
          {p.motionPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 px-2"
          disabled={!hasMotion}
          onClick={() => {
            p.setMotionPlaying(false);
            setScrubFrame(null);
            p.setMotionFrame(clampFrame(displayFrame, 0, maxFrame));
          }}
          title="Stop playback"
        >
          <Square className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 px-2"
          disabled={!hasMotion}
          onClick={() => {
            const idx = Math.floor(displayFrame + 1e-9);
            const next = clampFrame(idx - 1, activeMin, activeMax);
            playheadRef.current = next;
            setScrubFrame(null);
            p.setMotionFrame(next);
            p.setMotionPlaying(false);
          }}
          title="Previous frame"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 px-2"
          disabled={!hasMotion}
          onClick={() => {
            const idx = Math.floor(displayFrame + 1e-9);
            const next = clampFrame(idx + 1, activeMin, activeMax);
            playheadRef.current = next;
            setScrubFrame(null);
            p.setMotionFrame(next);
            p.setMotionPlaying(false);
          }}
          title="Next frame"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 px-2"
          disabled={!hasMotion}
          onClick={() => {
            const target = rangeEnabled ? activeMax : maxFrame;
            playheadRef.current = target;
            setScrubFrame(null);
            p.setMotionFrame(target);
            p.setMotionPlaying(false);
          }}
          title="Jump to end"
        >
          <ChevronsRight className="h-3.5 w-3.5" />
        </Button>
        <div className="ml-auto flex items-center gap-3 pr-1">
          <div className="flex items-center gap-2">
            <Label htmlFor="viewport-force-visible" className="text-[10px] text-muted-foreground">
              Force Visible
            </Label>
            <Switch
              id="viewport-force-visible"
              checked={p.motionForceVisibleDuringPlayback}
              onCheckedChange={p.setMotionForceVisibleDuringPlayback}
              disabled={!hasMotion}
            />
          </div>
          <Label htmlFor="viewport-loop" className="text-[10px] text-muted-foreground">
            Loop
          </Label>
          <Switch id="viewport-loop" checked={p.motionLoop} onCheckedChange={p.setMotionLoop} disabled={!hasMotion} />
        </div>
      </div>

      <div className="mt-2 rounded border border-border/50 bg-background/70 p-2">
        <div
          ref={timelineTrackRef}
          className={cn(
            "relative select-none rounded border border-border/60 bg-muted/20",
            hasMotion ? "cursor-ew-resize" : "cursor-not-allowed opacity-70",
          )}
          onPointerDown={(e) => {
            if (!hasMotion || e.button !== 0) {
              return;
            }
            const target = e.currentTarget;
            target.setPointerCapture(e.pointerId);
            activePointerIdRef.current = e.pointerId;
            beginTimelineScrub(e.clientX);
          }}
          onPointerMove={(e) => {
            if (!hasMotion) {
              return;
            }
            if (activePointerIdRef.current !== e.pointerId) {
              return;
            }
            updateTimelineScrub(e.clientX);
          }}
          onPointerUp={(e) => {
            if (activePointerIdRef.current !== e.pointerId) {
              return;
            }
            const target = e.currentTarget;
            if (target.hasPointerCapture(e.pointerId)) {
              target.releasePointerCapture(e.pointerId);
            }
            activePointerIdRef.current = null;
            flushScrubCommit();
          }}
          onPointerCancel={(e) => {
            if (activePointerIdRef.current !== e.pointerId) {
              return;
            }
            const target = e.currentTarget;
            if (target.hasPointerCapture(e.pointerId)) {
              target.releasePointerCapture(e.pointerId);
            }
            activePointerIdRef.current = null;
            flushScrubCommit();
          }}
          title={hasMotion ? "Drag playhead to scrub frames" : "Load motion to enable timeline"}
        >
          <TimelineRuler marks={timelineScale.marks} />
          <div className="relative h-8 bg-background/40">
            <span className="pointer-events-none absolute left-0 right-0 top-1/2 block h-px -translate-y-1/2 bg-border/70" />
            <TimelineMajorGrid marks={timelineScale.marks} />
            {rangeEnabled ? (
              <span
                className="pointer-events-none absolute bottom-0 top-0 bg-primary/10"
                style={{
                  left: `${rangeStartPercent}%`,
                  width: `${Math.max(0.8, rangeEndPercent - rangeStartPercent)}%`,
                }}
              />
            ) : null}
            <BoneKeyMarkers frames={renderedBoneKeyframes} safeMax={timelineScale.safeMax} />
          </div>
          <div
            className="pointer-events-none absolute bottom-0 top-0 z-10 w-[2px] bg-primary shadow-[0_0_0_1px_rgba(0,0,0,0.3)]"
            style={{ left: `${framePercent}%` }}
          >
            <span className="absolute -top-1.5 left-1/2 block h-0 w-0 -translate-x-1/2 border-x-[5px] border-t-0 border-b-[6px] border-x-transparent border-b-primary" />
          </div>
        </div>
        <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
          <span className="font-mono">Frame {Math.round(displayFrame)}</span>
          <span>
            Bone keys: <span className="font-mono">{boneKeyframes.length}</span>
          </span>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          {([0.25, 0.5, 1, 1.5, 2] as const).map((v) => (
            <Button
              key={v}
              type="button"
              size="sm"
              variant={Math.abs(p.motionSpeed - v) < 1e-6 ? "default" : "outline"}
              className="h-6 px-2 text-[10px]"
              disabled={!hasMotion}
              onClick={() => p.setMotionSpeed(v)}
              title={`Set speed to ${v}x`}
            >
              {v}x
            </Button>
          ))}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-6 px-2 text-[10px]"
            disabled={!hasMotion}
            onClick={() => p.setMotionSpeed(1)}
            title="Reset speed to 1x"
          >
            <RotateCcw className="mr-1 h-3 w-3" />
            Reset
          </Button>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <Label className="text-[10px] text-muted-foreground">Frame</Label>
          <Input
            className="h-6 w-[84px] font-mono text-[10px]"
            value={frameInputText}
            disabled={!hasMotion}
            onChange={(e) => setFrameInputText(e.target.value)}
            onBlur={() => {
              const parsed = Number(frameInputText);
              if (Number.isNaN(parsed)) {
                setFrameInputText(String(Math.round(displayFrame)));
                return;
              }
              const next = clampFrame(Math.round(parsed), activeMin, activeMax);
              playheadRef.current = next;
              setScrubFrame(null);
              p.setMotionFrame(next);
              p.setMotionPlaying(false);
              setFrameInputText(String(next));
            }}
          />
          <span className="font-mono text-[10px] text-muted-foreground">/ {Math.round(maxFrame)}</span>
        </div>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-6 px-2 text-[10px]"
          disabled={!hasMotion}
          onClick={() => {
            const current = clampFrame(displayFrame, 0, maxFrame);
            setRangeIn(current);
            if (current > rangeOut) {
              setRangeOut(current);
            }
          }}
        >
          Set In
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-6 px-2 text-[10px]"
          disabled={!hasMotion}
          onClick={() => {
            const current = clampFrame(displayFrame, 0, maxFrame);
            setRangeOut(current);
            if (current < rangeIn) {
              setRangeIn(current);
            }
          }}
        >
          Set Out
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-6 px-2 text-[10px]"
          disabled={!hasMotion}
          onClick={() => {
            setRangeIn(0);
            setRangeOut(maxFrame);
            setRangeEnabled(false);
          }}
        >
          Clear Range
        </Button>
        <div className="ml-auto flex items-center gap-2 pr-1">
          <Label htmlFor="timeline-range" className="text-[10px] text-muted-foreground">
            Range Play
          </Label>
          <Switch
            id="timeline-range"
            checked={rangeEnabled}
            disabled={!hasMotion}
            onCheckedChange={setRangeEnabled}
          />
          <span className="font-mono text-[10px] text-muted-foreground">
            [{Math.min(rangeIn, rangeOut).toFixed(2)} - {Math.max(rangeIn, rangeOut).toFixed(2)}]
          </span>
        </div>
      </div>

      <div className="mt-2 rounded-md border border-border/50 bg-background/70 p-2">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="text-[11px] font-medium">Bone Transform Inspector</div>
          <div className="text-[10px] text-muted-foreground">
            {boneNames.length > 0 ? `${selectedBoneIndex}: ${boneNames[selectedBoneIndex] ?? "—"}` : "No skeleton"}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-[220px_minmax(0,1fr)]">
          <div className="space-y-2">
            <Input
              className="h-7 text-[11px]"
              placeholder="Filter bone name..."
              value={boneFilter}
              onChange={(e) => setBoneFilter(e.target.value)}
              disabled={boneNames.length === 0}
            />
            <div ref={boneRowsRef} className="h-[180px] overflow-y-auto rounded border border-border/50 p-1">
              {filteredBoneRows.length > 0 ? (
                <div
                  className="relative w-full"
                  style={{ height: `${boneRowVirtualizer.getTotalSize()}px` }}
                >
                  {boneRowVirtualizer.getVirtualItems().map((virtualRow) => {
                    const row = filteredBoneRows[virtualRow.index];
                    return (
                      <button
                        key={virtualRow.key}
                        type="button"
                        className={cn(
                          "absolute left-0 top-0 block h-7 w-full rounded px-2 py-1 text-left text-[11px]",
                          row.index === selectedBoneIndex
                            ? "bg-primary/20 text-foreground"
                            : "hover:bg-muted/60",
                        )}
                        style={{ transform: `translateY(${virtualRow.start}px)` }}
                        onClick={() => setSelectedBoneIndex(row.index)}
                      >
                        <span className="font-mono text-[10px] text-muted-foreground">{row.index}</span>{" "}
                        <span>{row.name}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="px-2 py-1 text-[11px] text-muted-foreground">No matching bones</div>
              )}
            </div>
          </div>
          <div className="space-y-2 rounded border border-border/50 p-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-6 px-2 text-[10px]"
                disabled={boneKeyframes.length === 0}
                onClick={() => {
                  const current = displayFrame;
                  const prevKey = [...boneKeyframes].reverse().find((f) => f < current);
                  if (prevKey === undefined) {
                    return;
                  }
                  setScrubFrame(null);
                  playheadRef.current = prevKey;
                  p.setMotionFrame(prevKey);
                  p.setMotionPlaying(false);
                }}
              >
                Prev Key
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-6 px-2 text-[10px]"
                disabled={boneKeyframes.length === 0}
                onClick={() => {
                  const current = displayFrame;
                  const nextKey = boneKeyframes.find((f) => f > current);
                  if (nextKey === undefined) {
                    return;
                  }
                  setScrubFrame(null);
                  playheadRef.current = nextKey;
                  p.setMotionFrame(nextKey);
                  p.setMotionPlaying(false);
                }}
              >
                Next Key
              </Button>
              <span className="text-[10px] text-muted-foreground">Keys: {boneKeyframes.length}</span>
            </div>
            {currentBoneLocal ? (
              <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                <div className="rounded border border-border/40 p-2">
                  <div className="mb-1 text-[10px] font-medium text-muted-foreground">Translation</div>
                  <div className="font-mono text-[11px]">X {currentBoneLocal.translation[0].toFixed(4)}</div>
                  <div className="font-mono text-[11px]">Y {currentBoneLocal.translation[1].toFixed(4)}</div>
                  <div className="font-mono text-[11px]">Z {currentBoneLocal.translation[2].toFixed(4)}</div>
                </div>
                <div className="rounded border border-border/40 p-2">
                  <div className="mb-1 text-[10px] font-medium text-muted-foreground">Rotation (Quat)</div>
                  <div className="font-mono text-[11px]">X {currentBoneLocal.rotation[0].toFixed(5)}</div>
                  <div className="font-mono text-[11px]">Y {currentBoneLocal.rotation[1].toFixed(5)}</div>
                  <div className="font-mono text-[11px]">Z {currentBoneLocal.rotation[2].toFixed(5)}</div>
                  <div className="font-mono text-[11px]">W {currentBoneLocal.rotation[3].toFixed(5)}</div>
                </div>
                <div className="rounded border border-border/40 p-2">
                  <div className="mb-1 text-[10px] font-medium text-muted-foreground">Scale</div>
                  <div className="font-mono text-[11px]">X {currentBoneLocal.scale[0].toFixed(4)}</div>
                  <div className="font-mono text-[11px]">Y {currentBoneLocal.scale[1].toFixed(4)}</div>
                  <div className="font-mono text-[11px]">Z {currentBoneLocal.scale[2].toFixed(4)}</div>
                </div>
              </div>
            ) : (
              <div className="text-[11px] text-muted-foreground">
                No sampled transform for the selected bone at this frame.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

