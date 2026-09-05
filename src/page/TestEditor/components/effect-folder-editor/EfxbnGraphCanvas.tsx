import { useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from "react";
import type { EfxbnControlName, EfxbnCurveKey } from "./efxbnDocument";
import {
  efxbnDataToPixel,
  efxbnPixelToData,
  progressToEfxbnFrame,
  type EfxbnGraphView,
} from "./efxbnCurveMath";
import {
  boxSelectEfxbnKeys,
  mergeEfxbnKeySelection,
  sameEfxbnGraphKeyRef,
  toggleEfxbnKeySelection,
  type EfxbnGraphBox,
  type EfxbnGraphKeyPixel,
  type EfxbnGraphKeyRef,
} from "./efxbnGraphInteraction";
import { createLatestAnimationFrameScheduler } from "./efxbnProgressScrub";

export type EfxbnGraphCurveView = {
  name: EfxbnControlName;
  visible: boolean;
  focused?: boolean;
  color: string;
  keys: readonly EfxbnCurveKey[];
};

export type EfxbnGraphCanvasProps = {
  width: number;
  height: number;
  curves: readonly EfxbnGraphCurveView[];
  view: EfxbnGraphView;
  progress: number;
  frameCount: number;
  selection: readonly EfxbnGraphKeyRef[];
  disabled: boolean;
  onSelectionChange: (selection: readonly EfxbnGraphKeyRef[]) => void;
  onPreviewDrag: (deltaProgress: number, deltaValue: number) => void;
  onCommitDrag: (deltaProgress: number, deltaValue: number, snapToFrame: boolean) => void;
  onDeleteSelection: () => void;
  onNudgeSelection: (deltaProgress: number, deltaValue: number) => void;
  onProgressChange: (progress: number) => void;
  onViewChange: (view: EfxbnGraphView) => void;
  onScrubbingChange?: (active: boolean) => void;
};

const MARGIN = { left: 48, right: 12, top: 20, bottom: 24 } as const;

type PlotPoint = { x: number; y: number };

type Gesture =
  | {
      kind: "key";
      start: PlotPoint;
      ref: EfxbnGraphKeyRef;
      additive: boolean;
    }
  | {
      kind: "box";
      start: PlotPoint;
      additive: boolean;
    }
  | {
      kind: "scrub";
    }
  | {
      kind: "pan";
      start: PlotPoint;
      view: EfxbnGraphView;
    };

function formatGraphNumber(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return String(Number(value.toFixed(4)));
}

function tickValues(min: number, max: number, count: number): number[] {
  return Array.from({ length: count + 1 }, (_, index) => min + ((max - min) * index) / count);
}

export function EfxbnGraphCanvas({
  width,
  height,
  curves,
  view,
  progress,
  frameCount,
  selection,
  disabled,
  onSelectionChange,
  onPreviewDrag,
  onCommitDrag,
  onDeleteSelection,
  onNudgeSelection,
  onProgressChange,
  onViewChange,
  onScrubbingChange,
}: EfxbnGraphCanvasProps) {
  const { t } = useTranslation("test-effect-folder");
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragOverlayRef = useRef<SVGGElement | null>(null);
  const plotContentRef = useRef<SVGGElement | null>(null);
  const playheadRef = useRef<SVGLineElement | null>(null);
  const boxRef = useRef<SVGRectElement | null>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const lastDeltaRef = useRef({ progress: 0, value: 0 });
  const animationFrameRef = useRef<number | null>(null);
  const onProgressChangeRef = useRef(onProgressChange);
  onProgressChangeRef.current = onProgressChange;
  const onScrubbingChangeRef = useRef(onScrubbingChange);
  onScrubbingChangeRef.current = onScrubbingChange;
  const progressSchedulerRef = useRef(
    createLatestAnimationFrameScheduler((value: number) => {
      onProgressChangeRef.current(value);
    }),
  );

  const plotWidth = Math.max(1, width - MARGIN.left - MARGIN.right);
  const plotHeight = Math.max(1, height - MARGIN.top - MARGIN.bottom);
  const visibleCurves = useMemo(() => curves.filter((curve) => curve.visible), [curves]);

  const toPixel = (entry: EfxbnCurveKey): PlotPoint => {
    const point = efxbnDataToPixel(entry, view, plotWidth, plotHeight);
    return { x: MARGIN.left + point.x, y: MARGIN.top + point.y };
  };

  const toData = (point: PlotPoint): EfxbnCurveKey =>
    efxbnPixelToData(
      { x: point.x - MARGIN.left, y: point.y - MARGIN.top },
      view,
      plotWidth,
      plotHeight,
    );

  const keyPixels = useMemo<EfxbnGraphKeyPixel[]>(
    () =>
      visibleCurves.flatMap((curve) =>
        curve.keys.map((entry) => ({
          ref: { controlName: curve.name, sourceKey: entry.key },
          ...toPixel(entry),
        })),
      ),
    [visibleCurves, view, plotWidth, plotHeight],
  );

  const pointerPoint = (event: { clientX: number; clientY: number }): PlotPoint => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return { x: event.clientX, y: event.clientY };
    return {
      x: ((event.clientX - rect.left) / rect.width) * width,
      y: ((event.clientY - rect.top) / rect.height) * height,
    };
  };

  const setBox = (box: EfxbnGraphBox | null) => {
    const element = boxRef.current;
    if (!element) return;
    if (!box) {
      element.setAttribute("visibility", "hidden");
      return;
    }
    element.setAttribute("visibility", "visible");
    element.setAttribute("x", String(Math.min(box.left, box.right)));
    element.setAttribute("y", String(Math.min(box.top, box.bottom)));
    element.setAttribute("width", String(Math.abs(box.right - box.left)));
    element.setAttribute("height", String(Math.abs(box.bottom - box.top)));
  };

  const resetGestureVisuals = () => {
    if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = null;
    dragOverlayRef.current?.removeAttribute("transform");
    plotContentRef.current?.removeAttribute("transform");
    setBox(null);
    gestureRef.current = null;
    lastDeltaRef.current = { progress: 0, value: 0 };
  };

  const scheduleKeyPreview = (deltaProgress: number, deltaValue: number) => {
    lastDeltaRef.current = { progress: deltaProgress, value: deltaValue };
    if (animationFrameRef.current !== null) return;
    animationFrameRef.current = requestAnimationFrame(() => {
      animationFrameRef.current = null;
      const dx = (lastDeltaRef.current.progress / (view.progressMax - view.progressMin)) * plotWidth;
      const dy = -(lastDeltaRef.current.value / (view.valueMax - view.valueMin)) * plotHeight;
      dragOverlayRef.current?.setAttribute("transform", `translate(${dx} ${dy})`);
      onPreviewDrag(lastDeltaRef.current.progress, lastDeltaRef.current.value);
    });
  };

  const movePlayhead = (nextProgress: number) => {
    const playhead = playheadRef.current;
    if (!playhead) return;
    const x = toPixel({ key: nextProgress, value: view.valueMin }).x;
    playhead.setAttribute("x1", String(x));
    playhead.setAttribute("x2", String(x));
    playhead.setAttribute("data-progress", String(nextProgress));
  };

  const scrubAt = (point: PlotPoint) => {
    const data = toData({ x: point.x, y: MARGIN.top });
    const nextProgress = Math.min(100, Math.max(0, data.key));
    movePlayhead(nextProgress);
    progressSchedulerRef.current.schedule(nextProgress);
  };

  const handleRootPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button === 1) {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      gestureRef.current = { kind: "pan", start: pointerPoint(event), view };
      return;
    }
    if (event.button !== 0) return;
    const point = pointerPoint(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    if (point.y <= MARGIN.top) {
      gestureRef.current = { kind: "scrub" };
      onScrubbingChangeRef.current?.(true);
      scrubAt(point);
      return;
    }
    gestureRef.current = { kind: "box", start: point, additive: event.shiftKey };
    setBox({ left: point.x, right: point.x, top: point.y, bottom: point.y });
  };

  const handleKeyPointerDown = (
    event: ReactPointerEvent<SVGGElement>,
    ref: EfxbnGraphKeyRef,
  ) => {
    if (disabled || event.button !== 0) return;
    event.stopPropagation();
    const alreadySelected = selection.some((entry) => sameEfxbnGraphKeyRef(entry, ref));
    const selected = event.shiftKey
      ? toggleEfxbnKeySelection(selection, ref, true)
      : alreadySelected
        ? selection
        : [ref];
    onSelectionChange(selected);
    svgRef.current?.setPointerCapture(event.pointerId);
    gestureRef.current = {
      kind: "key",
      start: pointerPoint(event),
      ref,
      additive: event.shiftKey,
    };
  };

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const gesture = gestureRef.current;
    if (!gesture) return;
    const point = pointerPoint(event);
    if (gesture.kind === "scrub") {
      scrubAt(point);
      return;
    }
    if (gesture.kind === "box") {
      setBox({ left: gesture.start.x, top: gesture.start.y, right: point.x, bottom: point.y });
      return;
    }
    if (gesture.kind === "pan") {
      const dx = point.x - gesture.start.x;
      const dy = point.y - gesture.start.y;
      plotContentRef.current?.setAttribute("transform", `translate(${dx} ${dy})`);
      return;
    }
    const start = toData(gesture.start);
    const current = toData(point);
    const valueScale = event.shiftKey ? 0.1 : 1;
    scheduleKeyPreview(current.key - start.key, (current.value - start.value) * valueScale);
  };

  const handlePointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
    const gesture = gestureRef.current;
    if (!gesture) return;
    const point = pointerPoint(event);
    if (gesture.kind === "key") {
      const delta = lastDeltaRef.current;
      resetGestureVisuals();
      if (Math.abs(delta.progress) > 0 || Math.abs(delta.value) > 0) {
        onCommitDrag(delta.progress, delta.value, !event.ctrlKey);
      } else if (!gesture.additive) {
        onSelectionChange([gesture.ref]);
      }
    } else if (gesture.kind === "box") {
      const incoming = boxSelectEfxbnKeys(keyPixels, {
        left: gesture.start.x,
        top: gesture.start.y,
        right: point.x,
        bottom: point.y,
      });
      const next = gesture.additive ? mergeEfxbnKeySelection(selection, incoming) : incoming;
      resetGestureVisuals();
      onSelectionChange(next);
    } else if (gesture.kind === "pan") {
      const dx = point.x - gesture.start.x;
      const dy = point.y - gesture.start.y;
      const progressDelta = -(dx / plotWidth) * (view.progressMax - view.progressMin);
      const valueDelta = (dy / plotHeight) * (view.valueMax - view.valueMin);
      resetGestureVisuals();
      onViewChange({
        progressMin: gesture.view.progressMin + progressDelta,
        progressMax: gesture.view.progressMax + progressDelta,
        valueMin: gesture.view.valueMin + valueDelta,
        valueMax: gesture.view.valueMax + valueDelta,
      });
    } else if (gesture.kind === "scrub") {
      progressSchedulerRef.current.flushNow();
      onScrubbingChangeRef.current?.(false);
      resetGestureVisuals();
    } else {
      resetGestureVisuals();
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleWheel = (event: ReactWheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    const point = pointerPoint(event);
    const data = toData(point);
    if (event.shiftKey) {
      const delta = (event.deltaY / plotWidth) * (view.progressMax - view.progressMin);
      onViewChange({ ...view, progressMin: view.progressMin + delta, progressMax: view.progressMax + delta });
      return;
    }
    const factor = Math.min(2, Math.max(0.5, Math.exp(event.deltaY * 0.001)));
    onViewChange({
      progressMin: data.key + (view.progressMin - data.key) * factor,
      progressMax: data.key + (view.progressMax - data.key) * factor,
      valueMin: data.value + (view.valueMin - data.value) * factor,
      valueMax: data.value + (view.valueMax - data.value) * factor,
    });
  };

  const playhead = toPixel({ key: progress, value: view.valueMin });
  const progressTicks = tickValues(view.progressMin, view.progressMax, 5);
  const valueTicks = tickValues(view.valueMin, view.valueMax, 4);
  const renderKeyNodes = (selectedOnly: boolean) =>
    visibleCurves.flatMap((curve) =>
      curve.keys.flatMap((entry) => {
        const ref = { controlName: curve.name, sourceKey: entry.key } satisfies EfxbnGraphKeyRef;
        const selected = selection.some((candidate) => sameEfxbnGraphKeyRef(candidate, ref));
        if (selected !== selectedOnly) return [];
        const point = toPixel(entry);
        const frame = progressToEfxbnFrame(entry.key, frameCount);
        const frameLabel =
          frame === null
            ? `${formatGraphNumber(entry.key)} percent`
            : `frame ${formatGraphNumber(frame)}`;
        return [
          <g
            key={`${curve.name}:${entry.key}`}
            role="button"
            tabIndex={0}
            aria-pressed={selected}
            data-i18n-ignore=""
            aria-label={`${curve.name} key at ${frameLabel}, value ${formatGraphNumber(entry.value)}`}
            className="cursor-crosshair outline-none focus-visible:[&>polygon]:stroke-primary"
            onPointerDown={(event) => handleKeyPointerDown(event, ref)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelectionChange(toggleEfxbnKeySelection(selection, ref, event.shiftKey));
              } else if (event.key === "Delete" || event.key === "Backspace") {
                event.preventDefault();
                onDeleteSelection();
              } else if (event.key === "Escape") {
                onSelectionChange([]);
              } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                event.preventDefault();
                const direction = event.key === "ArrowLeft" ? -1 : 1;
                const delta = frameCount > 0 ? (100 / frameCount) * direction : direction;
                onNudgeSelection(delta, 0);
              } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                event.preventDefault();
                onNudgeSelection(0, event.key === "ArrowUp" ? 0.01 : -0.01);
              }
            }}
          >
            <circle cx={point.x} cy={point.y} r={10} fill="transparent" />
            <polygon
              points={`${point.x},${point.y - 5} ${point.x + 5},${point.y} ${point.x},${point.y + 5} ${point.x - 5},${point.y}`}
              fill={selected ? curve.color : "var(--background)"}
              stroke={curve.color}
              strokeWidth={selected ? 2 : 1.5}
            />
          </g>,
        ];
      }),
    );

  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden bg-background">
      <svg
        ref={svgRef}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="application"
        aria-label={t("canvas.ariaGraph")}
        className="block h-full w-full touch-none select-none"
        onPointerDown={handleRootPointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => {
          if (gestureRef.current?.kind === "scrub") {
            progressSchedulerRef.current.flushNow();
            onScrubbingChangeRef.current?.(false);
          }
          resetGestureVisuals();
        }}
        onWheel={handleWheel}
      >
        <defs>
          <clipPath id="efxbn-graph-plot-clip">
            <rect x={MARGIN.left} y={MARGIN.top} width={plotWidth} height={plotHeight} />
          </clipPath>
        </defs>
        <rect width={width} height={height} className="fill-background" />
        <g aria-hidden="true">
          {progressTicks.map((tick) => {
            const point = toPixel({ key: tick, value: view.valueMin });
            return (
              <g key={`p-${tick}`}>
                <line x1={point.x} x2={point.x} y1={MARGIN.top} y2={height - MARGIN.bottom} className="stroke-border/50" />
                <text x={point.x} y={height - 7} textAnchor="middle" className="fill-muted-foreground text-[9px] font-mono">
                  {formatGraphNumber(progressToEfxbnFrame(tick, frameCount) ?? tick)}
                </text>
              </g>
            );
          })}
          {valueTicks.map((tick) => {
            const point = toPixel({ key: view.progressMin, value: tick });
            return (
              <g key={`v-${tick}`}>
                <line x1={MARGIN.left} x2={width - MARGIN.right} y1={point.y} y2={point.y} className="stroke-border/50" />
                <text x={MARGIN.left - 6} y={point.y + 3} textAnchor="end" className="fill-muted-foreground text-[9px] font-mono">
                  {formatGraphNumber(tick)}
                </text>
              </g>
            );
          })}
        </g>
        <g ref={plotContentRef} clipPath="url(#efxbn-graph-plot-clip)">
          {view.valueMin <= 0 && view.valueMax >= 0 ? (
            <line
              x1={MARGIN.left}
              x2={width - MARGIN.right}
              y1={toPixel({ key: view.progressMin, value: 0 }).y}
              y2={toPixel({ key: view.progressMin, value: 0 }).y}
              className="stroke-muted-foreground/60"
            />
          ) : null}
          {visibleCurves.map((curve) => {
            const ordered = [...curve.keys].sort((left, right) => left.key - right.key);
            const extended = ordered.length
              ? [
                  { key: view.progressMin, value: ordered[0]!.value },
                  ...ordered,
                  { key: view.progressMax, value: ordered.at(-1)!.value },
                ]
              : [];
            const points = extended.map(toPixel).map((point) => `${point.x},${point.y}`).join(" ");
            return (
              <polyline
                key={curve.name}
                points={points}
                fill="none"
                stroke={curve.color}
                strokeWidth={curve.focused ? 2.5 : 1.5}
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
          <g>{renderKeyNodes(false)}</g>
          <g ref={dragOverlayRef}>{renderKeyNodes(true)}</g>
        </g>
        <line
          ref={playheadRef}
          data-testid="efxbn-playhead"
          data-progress={String(progress)}
          x1={playhead.x}
          x2={playhead.x}
          y1={MARGIN.top}
          y2={height - MARGIN.bottom}
          className="pointer-events-none stroke-amber-400"
          strokeWidth={1.5}
        />
        <rect
          ref={boxRef}
          visibility="hidden"
          fill="rgb(59 130 246 / 0.12)"
          stroke="rgb(96 165 250 / 0.8)"
          strokeDasharray="3 2"
        />
      </svg>
      <input
        type="range"
        min={0}
        max={100}
        step="any"
        value={progress}
        aria-label={t("canvas.ariaProgress")}
        className="sr-only"
        onChange={(event) => onProgressChange(Number(event.target.value))}
      />
    </div>
  );
}
