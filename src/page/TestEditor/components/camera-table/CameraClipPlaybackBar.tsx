import { useRef } from "react";
import { Pause, Play, SkipBack } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import type { CompiledShot } from "./compileCameraClip";
import {
  DEFAULT_CAMERA_PREVIEW_VIEW_ZOOM,
  MAX_CAMERA_PREVIEW_VIEW_ZOOM,
  MIN_CAMERA_PREVIEW_VIEW_ZOOM,
} from "./cameraPreviewSettings";

type CameraClipPlaybackBarProps = {
  clock: number;
  total: number;
  playing: boolean;
  playShotIndex: number;
  editShotIndex: number;
  shots: CompiledShot[];
  onToggle: () => void;
  onReset: () => void;
  onSeek: (clock: number) => void;
  onSelectShot: (index: number) => void;
  viewZoom: number;
  onViewZoomChange: (zoom: number) => void;
};

export function CameraClipPlaybackBar({
  clock,
  total,
  playing,
  playShotIndex,
  editShotIndex,
  shots,
  onToggle,
  onReset,
  onSeek,
  onSelectShot,
  viewZoom,
  onViewZoomChange,
}: CameraClipPlaybackBarProps) {
  const { t } = useTranslation("test-lists");
  const trackRef = useRef<HTMLDivElement | null>(null);
  const span = Math.max(total, 1);
  const playhead = Math.min(Math.max(clock / span, 0), 1);

  const seekFromClientX = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    const x = Math.min(Math.max(clientX - rect.left, 0), rect.width);
    onSeek((x / rect.width) * total);
  };

  return (
    <div className="shrink-0 border-t border-white/10 bg-zinc-950 px-2 py-1.5">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="h-10 w-10 shrink-0 rounded-md border-white/15 bg-zinc-900 text-zinc-100 transition-[transform,background-color,border-color] duration-150 ease-out hover:bg-zinc-800 active:scale-[0.96]"
          onClick={onReset}
          title={t("cameraTable.resetClip")}
          aria-label={t("cameraTable.resetClip")}
        >
          <SkipBack className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="default"
          className="h-10 w-10 shrink-0 rounded-md transition-[transform,background-color,box-shadow] duration-150 ease-out active:scale-[0.96]"
          onClick={onToggle}
          title={playing ? t("cameraTable.pauseClip") : t("cameraTable.playClip")}
          aria-label={playing ? t("cameraTable.pauseClip") : t("cameraTable.playClip")}
        >
          {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="ml-0.5 h-3.5 w-3.5" />}
        </Button>
        <div
          ref={trackRef}
          className="relative flex h-10 min-w-0 flex-1 cursor-pointer items-center"
          onPointerDown={(event) => {
            (event.currentTarget as HTMLDivElement).setPointerCapture(event.pointerId);
            seekFromClientX(event.clientX);
          }}
          onPointerMove={(event) => {
            if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
            seekFromClientX(event.clientX);
          }}
        >
          <div className="relative h-2 w-full rounded-full bg-zinc-800 outline-1 -outline-offset-1 outline-white/10">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-primary/70"
              style={{ width: `${playhead * 100}%` }}
            />
            <div
              className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-zinc-950 bg-zinc-100"
              style={{ left: `${playhead * 100}%` }}
            />
          </div>
        </div>
        <span className="shrink-0 font-mono text-[11px] tabular-nums text-zinc-400">
          {clock.toFixed(0).padStart(4, "0")} / {total.toFixed(0).padStart(4, "0")}
        </span>
        <div className="flex w-44 shrink-0 items-center gap-2 pl-1">
          <span className="shrink-0 font-mono text-[9px] font-medium uppercase tracking-[0.14em] text-zinc-400">
            {t("cameraTable.viewZoom")}
          </span>
          <Slider
            min={MIN_CAMERA_PREVIEW_VIEW_ZOOM}
            max={MAX_CAMERA_PREVIEW_VIEW_ZOOM}
            step={0.05}
            value={[viewZoom]}
            onValueChange={(value) => {
              const next = value[0];
              if (typeof next === "number") onViewZoomChange(next);
            }}
            aria-label={t("cameraTable.viewZoom")}
            className="min-w-0 flex-1"
          />
          <button
            type="button"
            className="shrink-0 font-mono text-[11px] tabular-nums text-zinc-200 transition-colors hover:text-white"
            title={t("cameraTable.resetViewZoom")}
            aria-label={t("cameraTable.resetViewZoom")}
            onClick={() => onViewZoomChange(DEFAULT_CAMERA_PREVIEW_VIEW_ZOOM)}
          >
            {viewZoom.toFixed(2)}×
          </button>
        </div>
      </div>
      <div className="mt-1.5 flex h-10 overflow-hidden rounded-md bg-zinc-900 outline-1 -outline-offset-1 outline-white/10">
        {shots.map((shot, index) => {
          const playingShot = index === playShotIndex;
          const editing = index === editShotIndex;
          return (
            <button
              key={shot.entryIndex}
              type="button"
              title={`${index + 1} / ${shot.duration.toFixed(0)}t`}
              onClick={() => onSelectShot(index)}
              style={{ flexGrow: Math.max(shot.duration, 8) }}
              className={cn(
                "relative min-w-10 border-r border-white/10 px-1.5 text-left transition-[background-color] duration-150 ease-out last:border-r-0",
                playingShot ? "bg-primary/40" : editing ? "bg-zinc-700" : "bg-transparent hover:bg-zinc-800",
              )}
            >
              <span className="block font-mono text-[10px] font-medium tabular-nums text-zinc-100">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="block font-mono text-[9px] tabular-nums text-zinc-400">
                {shot.duration.toFixed(0)}t
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
