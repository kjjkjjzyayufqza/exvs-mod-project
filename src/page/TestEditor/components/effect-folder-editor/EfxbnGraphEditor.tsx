import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  ClipboardPaste,
  Copy,
  Diamond,
  Eye,
  Maximize2,
  Redo2,
  RotateCcw,
  Trash2,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { EfxbnGraphCanvas, type EfxbnGraphCurveView } from "./EfxbnGraphCanvas";
import {
  canRedoEfxbn,
  canUndoEfxbn,
  EFXBN_CONTROL_NAMES,
  readEfxbnCurve,
  redoEfxbn,
  replaceEfxbnCurves,
  undoEfxbn,
  type EfxbnControlName,
  type EfxbnCurveKey,
  type EfxbnCurveReplacement,
  type EfxbnDocument,
} from "./efxbnDocument";
import {
  adjacentEfxbnKey,
  evaluateEfxbnCurve,
  findEfxbnKeyAtProgress,
  frameToEfxbnProgress,
  initialEfxbnGraphView,
  insertSampledEfxbnKey,
  pickNearestEfxbnKey,
  progressToEfxbnFrame,
  type EfxbnGraphView,
} from "./efxbnCurveMath";
import {
  deleteEfxbnSelectedKeys,
  inspectorChannelName,
  isEfxbnEditableHotkeyTarget,
  mergeEfxbnPastedKeys,
  moveEfxbnSelectedKeys,
  offsetEfxbnCopiedKeys,
  refsForEfxbnControl,
  sameEfxbnGraphKeyRef,
  sanitizeEfxbnGraphSelection,
  selectEfxbnChannelKeys,
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

const CHANNEL_GROUPS: readonly { heading: string; names: readonly EfxbnControlName[] }[] = [
  { heading: "Spawn form", names: ["spawnForm0", "spawnForm1", "spawnForm2", "spawnForm3"] },
  { heading: "Spread", names: ["spreadX", "spreadY"] },
  { heading: "Velocity", names: ["speedBaseX", "speedBaseY", "speedBaseZ"] },
  { heading: "Scale", names: ["scaleBaseX", "scaleBaseY", "scaleBaseZ"] },
  { heading: "Color", names: ["colorR", "colorG", "colorB", "colorA"] },
  { heading: "Forces", names: ["worldGravityAccel", "directionAccel"] },
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

type GraphClipboard = {
  keys: readonly EfxbnCurveKey[];
  originProgress: number;
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
  const { t } = useTranslation("test-effect-folder");
  const editorRef = useRef<HTMLElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const clipboardRef = useRef<GraphClipboard | null>(null);
  const progressRef = useRef(progress);
  const focusedControlRef = useRef(focusedControlName);
  progressRef.current = progress;
  focusedControlRef.current = focusedControlName;
  const [size, setSize] = useState({ width: 800, height: 300 });
  const [hasClipboard, setHasClipboard] = useState(false);
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
    const name = focusedControlRef.current;
    const keys = readEfxbnCurve(document.summary, blockIndex, name).keys;
    const nearest = pickNearestEfxbnKey(keys, progressRef.current);
    setSelection(nearest ? [{ controlName: name, sourceKey: nearest.key }] : []);
    const nextCurves = EFXBN_CONTROL_NAMES.map((controlName) =>
      readEfxbnCurve(document.summary, blockIndex, controlName).keys,
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

  useEffect(() => {
    setSelection((current) => {
      const next = sanitizeEfxbnGraphSelection(current, curveByName);
      if (
        next.length === current.length &&
        next.every((entry, index) => sameEfxbnGraphKeyRef(entry, current[index]!))
      ) {
        return current;
      }
      return next;
    });
  }, [curveByName]);

  const reportError = (error: unknown) => onError(error instanceof Error ? error.message : String(error));

  const applySelection = (next: readonly EfxbnGraphKeyRef[]) => {
    setSelection(next);
    const names = [...new Set(next.map((entry) => entry.controlName))];
    if (names.length === 1) onFocusedControlNameChange(names[0]!);
  };

  const selectChannel = (name: EfxbnControlName, event?: Pick<ReactMouseEvent, "shiftKey" | "ctrlKey" | "metaKey">) => {
    onFocusedControlNameChange(name);
    setSelection(
      selectEfxbnChannelKeys({
        controlName: name,
        keys: curveByName[name] ?? [],
        progress,
        mode: event?.ctrlKey || event?.metaKey ? "all" : "nearest",
        current: selection,
        additive: Boolean(event?.shiftKey),
      }),
    );
    editorRef.current?.focus();
  };

  const soloControls = (names: readonly EfxbnControlName[]) => {
    const already =
      visibleControls.size === names.length && names.every((name) => visibleControls.has(name));
    setVisibleControls(already ? new Set(EFXBN_CONTROL_NAMES) : new Set(names));
  };

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
      const { replacements, keptLastKey } = deleteEfxbnSelectedKeys({
        curves: curveByName,
        selected: selection,
      });
      if (replacements.length === 0) {
        if (keptLastKey) onError(t("graph.keepLastKey"));
        return;
      }
      onDocumentChange(
        replaceEfxbnCurves(document, blockIndex, replacements, `Delete ${selection.length} graph keys`),
      );
      const deletedNames = new Set(replacements.map((entry) => entry.controlName));
      setSelection(selection.filter((entry) => !deletedNames.has(entry.controlName)));
      if (keptLastKey) onError(t("graph.keepLastKey"));
    } catch (error) {
      reportError(error);
    }
  };

  const copySelection = () => {
    const copied = selection.flatMap((selected) => {
      const entry = (curveByName[selected.controlName] ?? []).find(
        (candidate) => Math.abs(candidate.key - selected.sourceKey) <= 1e-5,
      );
      return entry ? [{ ...entry }] : [];
    });
    const payload = copied.length > 0 ? copied : (curveByName[focusedControlName] ?? []).map((entry) => ({ ...entry }));
    if (payload.length === 0) return;
    clipboardRef.current = {
      keys: payload,
      originProgress: payload[0]!.key,
    };
    setHasClipboard(true);
  };

  const pasteClipboard = () => {
    if (writing) return;
    const clipboard = clipboardRef.current;
    if (!clipboard || clipboard.keys.length === 0) return;
    try {
      const pasted = offsetEfxbnCopiedKeys(clipboard.keys, clipboard.originProgress, progress);
      const keys = mergeEfxbnPastedKeys(curveByName[focusedControlName] ?? [], pasted);
      onDocumentChange(
        replaceEfxbnCurves(
          document,
          blockIndex,
          [{ controlName: focusedControlName, keys }],
          `Paste ${pasted.length} keys onto ${focusedControlName}`,
        ),
      );
      setSelection(pasted.map((entry) => ({ controlName: focusedControlName, sourceKey: entry.key })));
    } catch (error) {
      reportError(error);
    }
  };

  const resetFocusedChannel = () => {
    if (writing) return;
    const baseline = curves.find((curve) => curve.name === focusedControlName)?.baselineKeys;
    if (!baseline) return;
    try {
      onDocumentChange(
        replaceEfxbnCurves(
          document,
          blockIndex,
          [{ controlName: focusedControlName, keys: baseline.map((entry) => ({ ...entry })) }],
          `Reset ${focusedControlName}`,
        ),
      );
      const nearest = pickNearestEfxbnKey(baseline, progress);
      setSelection(nearest ? [{ controlName: focusedControlName, sourceKey: nearest.key }] : []);
    } catch (error) {
      reportError(error);
    }
  };

  const jumpFocusedKey = (direction: -1 | 1) => {
    const next = adjacentEfxbnKey(curveByName[focusedControlName] ?? [], progress, direction);
    if (!next) return;
    onProgressChange(next.key);
    setSelection([{ controlName: focusedControlName, sourceKey: next.key }]);
  };

  const handleUndo = () => {
    if (writing || !canUndoEfxbn(document)) return;
    onDocumentChange(undoEfxbn(document));
  };

  const handleRedo = () => {
    if (writing || !canRedoEfxbn(document)) return;
    onDocumentChange(redoEfxbn(document));
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
  const selectedChannel = inspectorChannelName(selection, focusedControlName);
  const playheadValue = evaluateEfxbnCurve(curveByName[focusedControlName] ?? [{ key: 0, value: 0 }], progress);

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
  const focusedDirty = curves.some(
    (curve) =>
      curve.name === focusedControlName && JSON.stringify(curve.keys) !== JSON.stringify(curve.baselineKeys),
  );
  const showingAllChannels = visibleControls.size === EFXBN_CONTROL_NAMES.length;

  return (
    <section
      ref={editorRef}
      tabIndex={0}
      className="flex h-full min-h-[220px] flex-col bg-background outline-none focus-visible:ring-1 focus-visible:ring-ring"
      aria-label={t("graph.ariaEditor")}
      onKeyDown={(event) => {
        if (isEfxbnEditableHotkeyTarget(event.target)) return;
        const key = event.key.toLowerCase();
        const mod = event.ctrlKey || event.metaKey;
        if (mod && key === "a") {
          event.preventDefault();
          const names = event.shiftKey
            ? EFXBN_CONTROL_NAMES.filter((name) => visibleControls.has(name))
            : [focusedControlName];
          applySelection(names.flatMap((name) => refsForEfxbnControl(name, curveByName[name] ?? [])));
          return;
        }
        if (mod && key === "c") {
          event.preventDefault();
          copySelection();
          return;
        }
        if (mod && key === "v") {
          event.preventDefault();
          pasteClipboard();
          return;
        }
        if (event.key.toLowerCase() === "f" && selectedDisplayKeys.length > 0) {
          event.preventDefault();
          setView(fitSelectionView(selectedDisplayKeys));
        } else if (event.key === "Home") {
          event.preventDefault();
          setView(initialEfxbnGraphView(visibleDisplayKeys));
        } else if (event.key === "Delete" || event.key === "Backspace") {
          event.preventDefault();
          deleteSelection();
        } else if (event.key === "Escape") {
          setSelection([]);
        } else if (key === "i" && !mod) {
          event.preventDefault();
          insertFocusedKey();
        } else if (event.key === "[") {
          event.preventDefault();
          jumpFocusedKey(-1);
        } else if (event.key === "]") {
          event.preventDefault();
          jumpFocusedKey(1);
        }
      }}
    >
      <div className="flex h-10 shrink-0 items-center gap-1 border-b px-2">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          disabled={writing || !canUndoEfxbn(document)}
          aria-label={t("graph.undo")}
          title={canUndoEfxbn(document) ? t("graph.undoTitle", { change: document.changeLog.at(-1) ?? "" }) : t("graph.nothingToUndo")}
          onClick={handleUndo}
        >
          <Undo2 className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          disabled={writing || !canRedoEfxbn(document)}
          aria-label={t("graph.redo")}
          title={t("graph.redoTitle")}
          onClick={handleRedo}
        >
          <Redo2 className="h-3.5 w-3.5" />
        </Button>
        <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />
        <Button
          type="button"
          size="icon"
          variant={keyAtPlayhead ? "secondary" : "ghost"}
          className="h-7 w-7"
          disabled={writing}
          aria-label={
            keyAtPlayhead
              ? t("graph.selectKey", { name: focusedControlName, frame: formatNumber(playheadFrame ?? progress) })
              : t("graph.insertKey", { name: focusedControlName, frame: formatNumber(playheadFrame ?? progress) })
          }
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
          aria-label={t("graph.deleteKeys")}
          onClick={deleteSelection}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          disabled={selectedEntries.length === 0 && (curveByName[focusedControlName]?.length ?? 0) === 0}
          aria-label={t("graph.copyKeys")}
          title={t("graph.copyKeys")}
          onClick={copySelection}
        >
          <Copy className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          disabled={writing || !hasClipboard}
          aria-label={t("graph.pasteKeys")}
          title={t("graph.pasteKeys")}
          onClick={pasteClipboard}
        >
          <ClipboardPaste className="h-3.5 w-3.5" />
        </Button>
        <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 gap-1 px-2 text-[10px]"
          aria-label={t("graph.frameSelection")}
          disabled={selectedDisplayKeys.length === 0}
          onClick={() => setView(fitSelectionView(selectedDisplayKeys))}
        >
          <Maximize2 className="h-3 w-3" /> {t("graph.selection")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-[10px]"
          aria-label={t("graph.frameAll")}
          onClick={() => setView(initialEfxbnGraphView(visibleDisplayKeys))}
        >
          {t("graph.home")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={normalizeView ? "secondary" : "ghost"}
          className="h-7 px-2 text-[10px]"
          aria-pressed={normalizeView}
          onClick={() => setNormalizeView((value) => !value)}
        >
          {normalizeView ? t("graph.normalize") : t("graph.absolute")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 gap-1 px-2 text-[10px]"
          disabled={showingAllChannels}
          aria-label={t("graph.showAllChannels")}
          title={t("graph.showAllChannels")}
          onClick={() => setVisibleControls(new Set(EFXBN_CONTROL_NAMES))}
        >
          <Eye className="h-3 w-3" />
        </Button>
        <span className="ml-auto font-mono text-[9px] tabular-nums text-muted-foreground" data-i18n-ignore="">
          {t("graph.frameLabel", { value: formatNumber(playheadFrame ?? progress) })} / {formatNumber(frameCount)} | {formatNumber(progress)}%
        </span>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[220px_minmax(280px,1fr)_210px]">
        <aside className="custom-scrollbar-thin overflow-y-auto border-r px-1.5 py-1.5" aria-label={t("graph.channels")}>
          {CHANNEL_GROUPS.map((group) => (
            <div key={group.heading} className="mb-1">
              <button
                type="button"
                className="flex w-full items-center px-1 py-1 text-left text-[10px] font-medium text-muted-foreground hover:text-foreground"
                data-i18n-ignore=""
                title={t("graph.soloGroup")}
                onClick={() => selectChannel(group.names[0]!)}
                onDoubleClick={() => soloControls(group.names)}
              >
                {group.heading}
              </button>
              {group.names.map((name) => {
                const curve = curves.find((entry) => entry.name === name)!;
                const dirty = JSON.stringify(curve.keys) !== JSON.stringify(curve.baselineKeys);
                const current = evaluateEfxbnCurve(curve.keys, progress);
                const selected = selectedChannel === name || focusedControlName === name;
                return (
                  <div
                    key={name}
                    className={cn(
                      "grid grid-cols-[18px_8px_minmax(0,1fr)_auto] items-center gap-1 rounded px-1 py-1",
                      selected && "bg-muted",
                      focusedControlName === name && "ring-1 ring-inset ring-border",
                    )}
                    onClick={(event) => selectChannel(name, event)}
                    onDoubleClick={(event) => {
                      event.preventDefault();
                      soloControls([name]);
                    }}
                  >
                    <Checkbox
                      checked={visibleControls.has(name)}
                      aria-label={t("graph.showCurve", { name })}
                      onClick={(event) => event.stopPropagation()}
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
                      data-i18n-ignore=""
                      aria-pressed={focusedControlName === name}
                      onClick={(event) => {
                        event.stopPropagation();
                        selectChannel(name, event);
                      }}
                    >
                      {name}
                    </button>
                    <span className={cn("font-mono text-[10px] tabular-nums text-muted-foreground", dirty && "text-amber-400")}>
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
            onSelectionChange={applySelection}
            onPreviewDrag={() => undefined}
            onCommitDrag={commitMove}
            onDeleteSelection={deleteSelection}
            onNudgeSelection={(deltaProgress, deltaValue) => commitMove(deltaProgress, deltaValue, false)}
            onProgressChange={onProgressChange}
            onScrubbingChange={onScrubbingChange}
            onViewChange={setView}
          />
        </div>

        <aside className="border-l p-3" aria-label={t("graph.selectedValues")}>
          <p className="mb-2 text-xs font-medium">
            {t("graph.selectedKey")}
            <span className="ml-1 font-mono text-[10px] text-muted-foreground" data-i18n-ignore="">
              {selectedChannel === "mixed" ? t("graph.mixed") : selectedChannel}
            </span>
          </p>
          <div className="space-y-2">
            <label className="block space-y-1">
              <span className="text-[9px] text-muted-foreground">{t("graph.channel")}</span>
              <Input
                aria-label={t("graph.channel")}
                value={selectedChannel === "mixed" ? t("graph.mixed") : selectedChannel}
                readOnly
                className="h-7 px-1.5 font-mono text-[10px]"
                data-i18n-ignore=""
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[9px] text-muted-foreground">{t("graph.playheadValue")}</span>
              <Input
                aria-label={t("graph.playheadValue")}
                value={formatNumber(playheadValue)}
                readOnly
                className="h-7 px-1.5 font-mono text-[10px] tabular-nums"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[9px] text-muted-foreground">{t("graph.frame")}</span>
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
              <span className="text-[9px] text-muted-foreground">{t("graph.progress")}</span>
              <PrecisionInput
                ariaLabel="Selected EFXBN key progress"
                value={commonProgress}
                disabled={writing || selection.length === 0}
                onCommit={(key) => patchSelection({ key })}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[9px] text-muted-foreground">{t("graph.value")}</span>
              <PrecisionInput
                ariaLabel="Selected EFXBN key value"
                value={commonValue}
                disabled={writing || selection.length === 0}
                onCommit={(value) => patchSelection({ value })}
              />
            </label>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 w-full justify-start gap-1 px-1.5 text-[10px]"
              disabled={writing || !focusedDirty}
              onClick={resetFocusedChannel}
            >
              <RotateCcw className="h-3 w-3" />
              {t("graph.resetChannel")}
            </Button>
            <p className="font-mono text-[9px] text-muted-foreground">{t("graph.selectedCount", { count: selection.length })}</p>
            <p className="text-[9px] leading-snug text-muted-foreground">{t("graph.shortcuts")}</p>
          </div>
        </aside>
      </div>
    </section>
  );
}
