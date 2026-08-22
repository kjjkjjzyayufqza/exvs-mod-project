import { useEffect, useMemo, useRef, useState } from "react";
import { Diamond, Maximize2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { EfxbnGraphCanvas, type EfxbnGraphCurveView } from "./EfxbnGraphCanvas";
import {
  EFXBN_CONTROL_NAMES,
  readEfxbnCurve,
  replaceEfxbnCurves,
  type EfxbnControlName,
  type EfxbnCurveKey,
  type EfxbnCurveReplacement,
  type EfxbnDocument,
} from "./efxbnDocument";
import {
  evaluateEfxbnCurve,
  findEfxbnKeyAtProgress,
  frameToEfxbnProgress,
  initialEfxbnGraphView,
  insertSampledEfxbnKey,
  progressToEfxbnFrame,
  type EfxbnGraphView,
} from "./efxbnCurveMath";
import {
  moveEfxbnSelectedKeys,
  sameEfxbnGraphKeyRef,
  type EfxbnGraphKeyRef,
} from "./efxbnGraphInteraction";

export type EfxbnGraphEditorProps = {
  document: EfxbnDocument;
  blockIndex: number;
  progress: number;
  frameCount: number;
  writing?: boolean;
  focusedControlName: EfxbnControlName;
  onFocusedControlNameChange: (name: EfxbnControlName) => void;
  onProgressChange: (progress: number) => void;
  onScrubbingChange?: (active: boolean) => void;
  onDocumentChange: (next: EfxbnDocument) => void;
  onError: (message: string) => void;
};

const CHANNEL_GROUPS: readonly { label: string; names: readonly EfxbnControlName[] }[] = [
  { label: "Spawn form", names: ["spawnForm0", "spawnForm1", "spawnForm2", "spawnForm3"] },
  { label: "Spread", names: ["spreadX", "spreadY"] },
  { label: "Velocity", names: ["speedBaseX", "speedBaseY", "speedBaseZ"] },
  { label: "Scale", names: ["scaleBaseX", "scaleBaseY", "scaleBaseZ"] },
  { label: "Color", names: ["colorR", "colorG", "colorB", "colorA"] },
  { label: "Forces", names: ["worldGravityAccel", "directionAccel"] },
];

const CHANNEL_COLORS: Record<EfxbnControlName, string> = {
  spawnForm0: "#F59E0B",
  spawnForm1: "#F97316",
  spawnForm2: "#FB7185",
  spawnForm3: "#E879F9",
  spreadX: "#A78BFA",
  spreadY: "#818CF8",
  speedBaseX: "#38BDF8",
  speedBaseY: "#22D3EE",
  speedBaseZ: "#2DD4BF",
  scaleBaseX: "#34D399",
  scaleBaseY: "#4ADE80",
  scaleBaseZ: "#A3E635",
  colorR: "#F87171",
  colorG: "#4ADE80",
  colorB: "#60A5FA",
  colorA: "#CBD5E1",
  worldGravityAccel: "#FACC15",
  directionAccel: "#FB923C",
};

function formatNumber(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return String(Number(value.toFixed(5)));
}

function curveRange(keys: readonly EfxbnCurveKey[]): { min: number; span: number } {
  const min = Math.min(...keys.map((entry) => entry.value));
  const max = Math.max(...keys.map((entry) => entry.value));
  return { min, span: max === min ? 1 : max - min };
}

function normalizeCurve(keys: readonly EfxbnCurveKey[]): EfxbnCurveKey[] {
  const range = curveRange(keys);
  return keys.map((entry) => ({ key: entry.key, value: (entry.value - range.min) / range.span }));
}

function fitSelectionView(keys: readonly EfxbnCurveKey[]): EfxbnGraphView {
  if (keys.length === 0) return { progressMin: 0, progressMax: 100, valueMin: -1, valueMax: 1 };
  const progressMin = Math.min(...keys.map((entry) => entry.key));
  const progressMax = Math.max(...keys.map((entry) => entry.key));
  const valueMin = Math.min(...keys.map((entry) => entry.value));
  const valueMax = Math.max(...keys.map((entry) => entry.value));
  const progressPadding = progressMin === progressMax ? 10 : (progressMax - progressMin) * 0.12;
  const valuePadding = valueMin === valueMax ? Math.max(1, Math.abs(valueMin) * 0.5) : (valueMax - valueMin) * 0.12;
  return {
    progressMin: progressMin - progressPadding,
    progressMax: progressMax + progressPadding,
    valueMin: valueMin - valuePadding,
    valueMax: valueMax + valuePadding,
  };
}

function PrecisionInput({
  ariaLabel,
  value,
  disabled,
  onCommit,
}: {
  ariaLabel: string;
  value: number | null;
  disabled?: boolean;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    setDraft(null);
    const parsed = Number(draft);
    if (Number.isFinite(parsed)) onCommit(parsed);
  };
  return (
    <Input
      type="number"
      aria-label={ariaLabel}
      value={draft ?? (value === null ? "" : formatNumber(value))}
      disabled={disabled}
      className="h-7 px-1.5 text-right font-mono text-[10px]"
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          setDraft(null);
          event.currentTarget.blur();
        }
      }}
    />
  );
}

export function EfxbnGraphEditor({
  document,
  blockIndex,
  progress,
  frameCount,
  writing = false,
  focusedControlName,
  onFocusedControlNameChange,
  onProgressChange,
  onScrubbingChange,
  onDocumentChange,
  onError,
}: EfxbnGraphEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 800, height: 300 });
  const [visibleControls, setVisibleControls] = useState<ReadonlySet<EfxbnControlName>>(
    () => new Set(EFXBN_CONTROL_NAMES),
  );
  const [selection, setSelection] = useState<readonly EfxbnGraphKeyRef[]>([]);
  const [normalizeView, setNormalizeView] = useState(false);

  const curves = useMemo(
    () =>
      EFXBN_CONTROL_NAMES.map((name) => ({
        name,
        keys: readEfxbnCurve(document.summary, blockIndex, name).keys,
        baselineKeys: readEfxbnCurve(document.baseline, blockIndex, name).keys,
      })),
    [blockIndex, document],
  );

  const displayCurves = useMemo<EfxbnGraphCurveView[]>(
    () =>
      curves.map((curve) => ({
        name: curve.name,
        visible: visibleControls.has(curve.name),
        focused: curve.name === focusedControlName,
        color: CHANNEL_COLORS[curve.name],
        keys: normalizeView ? normalizeCurve(curve.keys) : curve.keys,
      })),
    [curves, focusedControlName, normalizeView, visibleControls],
  );
  const visibleDisplayKeys = displayCurves.filter((curve) => curve.visible).map((curve) => curve.keys);
  const [view, setView] = useState<EfxbnGraphView>(() => initialEfxbnGraphView(visibleDisplayKeys));

  useEffect(() => {
    const host = hostRef.current;
    if (!host || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      const box = entry?.contentRect;
      if (!box || box.width <= 0 || box.height <= 0) return;
      setSize({ width: box.width, height: box.height });
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setSelection([]);
    const nextCurves = EFXBN_CONTROL_NAMES.map((name) =>
      readEfxbnCurve(document.summary, blockIndex, name).keys,
    );
    setView(initialEfxbnGraphView(normalizeView ? nextCurves.map(normalizeCurve) : nextCurves));
  }, [blockIndex, document.path]);

  useEffect(() => {
    setView(initialEfxbnGraphView(visibleDisplayKeys));
  }, [normalizeView]);

  const curveByName = useMemo(
    () =>
      curves.reduce<Record<EfxbnControlName, readonly EfxbnCurveKey[]>>(
        (result, curve) => {
          result[curve.name] = curve.keys;
          return result;
        },
        {} as Record<EfxbnControlName, readonly EfxbnCurveKey[]>,
      ),
    [curves],
  );

  const reportError = (error: unknown) => onError(error instanceof Error ? error.message : String(error));

  const insertFocusedKey = () => {
    try {
      const curve = readEfxbnCurve(document.summary, blockIndex, focusedControlName);
      const existingIndex = findEfxbnKeyAtProgress(curve.keys, progress);
      if (existingIndex !== null) {
        setSelection([{ controlName: focusedControlName, sourceKey: curve.keys[existingIndex]!.key }]);
        return;
      }
      const keys = insertSampledEfxbnKey(curve.keys, progress);
      const next = replaceEfxbnCurves(
        document,
        blockIndex,
        [{ controlName: focusedControlName, keys }],
        `${focusedControlName} + key @ ${progress}`,
      );
      onDocumentChange(next);
      setSelection([{ controlName: focusedControlName, sourceKey: progress }]);
    } catch (error) {
      reportError(error);
    }
  };

  const movedProgress = (source: number, delta: number, snapToFrame: boolean) => {
    const moved = source + delta;
    if (!snapToFrame || frameCount <= 0) return moved;
    const frame = progressToEfxbnFrame(moved, frameCount);
    return frame === null ? moved : (frameToEfxbnProgress(Math.round(frame), frameCount) ?? moved);
  };

  const commitMove = (deltaProgress: number, deltaDisplayValue: number, snapToFrame: boolean) => {
    if (writing || selection.length === 0) return;
    try {
      let replacements: EfxbnCurveReplacement[];
      if (normalizeView) {
        replacements = [...new Set(selection.map((entry) => entry.controlName))].flatMap((name) => {
          const range = curveRange(curveByName[name]);
          return moveEfxbnSelectedKeys({
            curves: { [name]: curveByName[name] },
            selected: selection.filter((entry) => entry.controlName === name),
            deltaProgress,
            deltaValue: deltaDisplayValue * range.span,
            frameCount,
            snapToFrame,
          });
        });
      } else {
        replacements = moveEfxbnSelectedKeys({
          curves: curveByName,
          selected: selection,
          deltaProgress,
          deltaValue: deltaDisplayValue,
          frameCount,
          snapToFrame,
        });
      }
      onDocumentChange(
        replaceEfxbnCurves(document, blockIndex, replacements, `Move ${selection.length} graph keys`),
      );
      setSelection(
        selection.map((entry) => ({
          ...entry,
          sourceKey: movedProgress(entry.sourceKey, deltaProgress, snapToFrame),
        })),
      );
    } catch (error) {
      reportError(error);
    }
  };

  const deleteSelection = () => {
    if (writing || selection.length === 0) return;
    try {
      const replacements = [...new Set(selection.map((entry) => entry.controlName))].map((name) => {
        const selectedKeys = selection.filter((entry) => entry.controlName === name);
        return {
          controlName: name,
          keys: curveByName[name].filter(
            (key) => !selectedKeys.some((entry) => Math.abs(entry.sourceKey - key.key) <= 1e-5),
          ),
        };
      });
      onDocumentChange(
        replaceEfxbnCurves(document, blockIndex, replacements, `Delete ${selection.length} graph keys`),
      );
      setSelection([]);
    } catch (error) {
      reportError(error);
    }
  };

  const selectedEntries = selection.flatMap((selected) => {
    const entry = curveByName[selected.controlName].find(
      (candidate) => Math.abs(candidate.key - selected.sourceKey) <= 1e-5,
    );
    return entry ? [{ ref: selected, entry }] : [];
  });
  const common = (pick: (entry: EfxbnCurveKey) => number): number | null => {
    const first = selectedEntries[0];
    if (!first) return null;
    const value = pick(first.entry);
    return selectedEntries.every((entry) => pick(entry.entry) === value) ? value : null;
  };
  const commonProgress = common((entry) => entry.key);
  const commonFrame = commonProgress === null ? null : progressToEfxbnFrame(commonProgress, frameCount);
  const commonValue = common((entry) => entry.value);

  const patchSelection = (patch: { key?: number; value?: number }) => {
    if (writing || selection.length === 0) return;
    try {
      const replacements = [...new Set(selection.map((entry) => entry.controlName))].map((name) => ({
        controlName: name,
        keys: curveByName[name].map((key) => {
          const selected = selection.some(
            (entry) => entry.controlName === name && Math.abs(entry.sourceKey - key.key) <= 1e-5,
          );
          return selected ? { key: patch.key ?? key.key, value: patch.value ?? key.value } : { ...key };
        }),
      }));
      onDocumentChange(
        replaceEfxbnCurves(document, blockIndex, replacements, `Edit ${selection.length} graph keys`),
      );
      if (patch.key !== undefined) {
        setSelection(selection.map((entry) => ({ ...entry, sourceKey: patch.key! })));
      }
    } catch (error) {
      reportError(error);
    }
  };

  const selectedDisplayKeys = selectedEntries.map(({ ref, entry }) => {
    if (!normalizeView) return entry;
    const range = curveRange(curveByName[ref.controlName]);
    return { key: entry.key, value: (entry.value - range.min) / range.span };
  });
  const playheadFrame = progressToEfxbnFrame(progress, frameCount);
  const keyAtPlayhead = findEfxbnKeyAtProgress(curveByName[focusedControlName], progress) !== null;

  return (
    <section
      className="flex h-full min-h-[220px] flex-col bg-background"
      aria-label="EFXBN Graph Editor"
      onKeyDown={(event) => {
        if (event.target instanceof HTMLInputElement) return;
        if (event.key.toLowerCase() === "f" && selectedDisplayKeys.length > 0) {
          event.preventDefault();
          setView(fitSelectionView(selectedDisplayKeys));
        } else if (event.key === "Home") {
          event.preventDefault();
          setView(initialEfxbnGraphView(visibleDisplayKeys));
        }
      }}
    >
      <div className="flex h-10 shrink-0 items-center gap-1.5 border-b px-3">
        <Button
          type="button"
          size="icon"
          variant={keyAtPlayhead ? "secondary" : "ghost"}
          className="h-7 w-7"
          disabled={writing}
          aria-label={`${keyAtPlayhead ? "Select" : "Insert"} key for ${focusedControlName} at frame ${formatNumber(playheadFrame ?? progress)}`}
          onClick={insertFocusedKey}
        >
          <Diamond className={cn("h-3.5 w-3.5", keyAtPlayhead && "fill-amber-400 text-amber-400")} />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          disabled={writing || selection.length === 0}
          aria-label="Delete selected EFXBN keys"
          onClick={deleteSelection}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 gap-1 px-2 text-[10px]"
          aria-label="Frame selected EFXBN keys"
          disabled={selectedDisplayKeys.length === 0}
          onClick={() => setView(fitSelectionView(selectedDisplayKeys))}
        >
          <Maximize2 className="h-3 w-3" /> Selection
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-[10px]"
          aria-label="Frame all visible EFXBN curves"
          onClick={() => setView(initialEfxbnGraphView(visibleDisplayKeys))}
        >
          Home
        </Button>
        <Button
          type="button"
          size="sm"
          variant={normalizeView ? "secondary" : "ghost"}
          className="h-7 px-2 text-[10px]"
          aria-pressed={normalizeView}
          onClick={() => setNormalizeView((value) => !value)}
        >
          {normalizeView ? "Normalize" : "Absolute"}
        </Button>
        <span className="ml-auto font-mono text-[9px] tabular-nums text-muted-foreground">
          frame {formatNumber(playheadFrame ?? progress)} / {formatNumber(frameCount)} | {formatNumber(progress)}%
        </span>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[220px_minmax(280px,1fr)_200px]">
        <aside className="custom-scrollbar-thin overflow-y-auto border-r px-1.5 py-1.5" aria-label="EFXBN graph channels">
          {CHANNEL_GROUPS.map((group) => (
            <div key={group.label} className="mb-1">
              <p className="px-1 py-1 text-[10px] font-medium text-muted-foreground">{group.label}</p>
              {group.names.map((name) => {
                const curve = curves.find((entry) => entry.name === name)!;
                const dirty = JSON.stringify(curve.keys) !== JSON.stringify(curve.baselineKeys);
                const current = evaluateEfxbnCurve(curve.keys, progress);
                return (
                  <div
                    key={name}
                    className={cn(
                      "grid grid-cols-[18px_8px_minmax(0,1fr)_auto] items-center gap-1 rounded px-1 py-1",
                      focusedControlName === name && "bg-muted",
                    )}
                  >
                    <Checkbox
                      checked={visibleControls.has(name)}
                      aria-label={`Show ${name} curve`}
                      onCheckedChange={(checked) => {
                        setVisibleControls((currentVisible) => {
                          const next = new Set(currentVisible);
                          if (checked === true) next.add(name);
                          else next.delete(name);
                          return next;
                        });
                      }}
                    />
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: CHANNEL_COLORS[name] }} aria-hidden />
                    <button
                      type="button"
                      className="min-w-0 truncate text-left font-mono text-[11px]"
                      onClick={() => onFocusedControlNameChange(name)}
                    >
                      {name}
                    </button>
                    <span className={cn("font-mono text-[10px] text-muted-foreground", dirty && "text-amber-400")}>
                      {curve.keys.length === 1 ? formatNumber(current) : `${curve.keys.length}k`}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </aside>

        <div ref={hostRef} className="min-h-0 min-w-0">
          <EfxbnGraphCanvas
            width={size.width}
            height={size.height}
            curves={displayCurves}
            view={view}
            progress={progress}
            frameCount={frameCount}
            selection={selection}
            disabled={writing}
            onSelectionChange={setSelection}
            onPreviewDrag={() => undefined}
            onCommitDrag={commitMove}
            onDeleteSelection={deleteSelection}
            onNudgeSelection={(deltaProgress, deltaValue) => commitMove(deltaProgress, deltaValue, false)}
            onProgressChange={onProgressChange}
            onScrubbingChange={onScrubbingChange}
            onViewChange={setView}
          />
        </div>

        <aside className="border-l p-3" aria-label="Selected EFXBN key values">
          <p className="mb-2 text-xs font-medium">Selected key</p>
          <div className="space-y-2">
            <label className="block space-y-1">
              <span className="text-[9px] text-muted-foreground">Channel</span>
              <Input
                value={selection.length === 1 ? selection[0]!.controlName : selection.length > 1 ? "Mixed" : "None"}
                readOnly
                className="h-7 px-1.5 font-mono text-[10px]"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[9px] text-muted-foreground">Frame</span>
              <PrecisionInput
                ariaLabel="Selected EFXBN key frame"
                value={commonFrame}
                disabled={writing || selection.length === 0 || frameCount <= 0}
                onCommit={(frame) => {
                  const next = frameToEfxbnProgress(frame, frameCount);
                  if (next !== null) patchSelection({ key: next });
                }}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[9px] text-muted-foreground">Progress %</span>
              <PrecisionInput
                ariaLabel="Selected EFXBN key progress"
                value={commonProgress}
                disabled={writing || selection.length === 0}
                onCommit={(key) => patchSelection({ key })}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[9px] text-muted-foreground">Value</span>
              <PrecisionInput
                ariaLabel="Selected EFXBN key value"
                value={commonValue}
                disabled={writing || selection.length === 0}
                onCommit={(value) => patchSelection({ value })}
              />
            </label>
            <p className="font-mono text-[9px] text-muted-foreground">{selection.length} selected</p>
          </div>
        </aside>
      </div>
    </section>
  );
}
