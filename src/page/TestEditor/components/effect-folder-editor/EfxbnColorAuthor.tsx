import { useEffect, useMemo, useRef, useState } from "react";
import { Diamond, Link2, Unlink2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import type { EfxbnEffectSummary } from "@/services/effectFolder/effectFolderService";
import {
  EFXBN_COLOR_CONTROL_NAMES,
  isEfxbnBlockDirty,
  readEfxbnCurve,
  replaceEfxbnCurves,
  type EfxbnColorControlName,
  type EfxbnDocument,
} from "./efxbnDocument";
import {
  evaluateEfxbnCurve,
  findEfxbnKeyAtProgress,
  insertSampledEfxbnKey,
  progressToEfxbnFrame,
} from "./efxbnCurveMath";

type ColorChannel = "r" | "g" | "b" | "a";

const CHANNEL_CONTROL: Record<ColorChannel, EfxbnColorControlName> = {
  r: "colorR",
  g: "colorG",
  b: "colorB",
  a: "colorA",
};

type EfxbnColorAuthorProps = {
  document: EfxbnDocument;
  block: EfxbnEffectSummary;
  progress: number;
  frameCount: number;
  writing?: boolean;
  focusedControlName: EfxbnColorControlName;
  onFocusedControlNameChange: (name: EfxbnColorControlName) => void;
  onDocumentChange: (next: EfxbnDocument) => void;
  onError: (message: string) => void;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function channelToByte(value: number): number {
  return Math.round(clamp(value, 0, 1) * 255);
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b]
    .map((channel) => channelToByte(channel).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;
}

function editableColorKeyIndex(
  document: EfxbnDocument,
  blockIndex: number,
  name: EfxbnColorControlName,
  progress: number,
): number | null {
  const curve = readEfxbnCurve(document.summary, blockIndex, name);
  if (curve.keys.length === 1) return 0;
  return findEfxbnKeyAtProgress(curve.keys, progress);
}

type ChannelRowProps = {
  letter: string;
  letterClassName: string;
  value: number;
  min: number;
  max: number;
  disabled: boolean;
  keyExists: boolean;
  insertLabel: string;
  focused: boolean;
  onFocus: () => void;
  onInsert: () => void;
  onDrag: (value: number) => void;
  onCommit: (value: number) => void;
};

function ChannelRow({
  letter,
  letterClassName,
  value,
  min,
  max,
  disabled,
  keyExists,
  insertLabel,
  focused,
  onFocus,
  onInsert,
  onDrag,
  onCommit,
}: ChannelRowProps) {
  return (
    <div className={cn("grid grid-cols-[14px_minmax(0,1fr)_56px_24px] items-center gap-2 rounded px-1", focused && "bg-muted/60")}>
      <button type="button" className={cn("font-mono text-[10px] font-bold", letterClassName)} onClick={onFocus}>
        {letter}
      </button>
      <Slider
        min={min}
        max={max}
        step={0.01}
        value={[value]}
        disabled={disabled}
        onValueChange={(next) => onDrag(next[0] ?? value)}
        onValueCommit={(next) => onCommit(next[0] ?? value)}
        aria-label={`${letter} channel slider`}
      />
      <Input
        type="number"
        min={min}
        max={max}
        step={0.01}
        value={Number.isFinite(value) ? value.toFixed(2) : "0.00"}
        disabled={disabled}
        aria-label={`${letter} channel`}
        className="h-7 px-1.5 font-mono text-[11px] tabular-nums"
        onChange={(event) => {
          const parsed = Number(event.target.value);
          if (Number.isFinite(parsed)) onDrag(clamp(parsed, min, max));
        }}
        onBlur={() => onCommit(value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-6 w-6"
        disabled={keyExists || insertLabel.startsWith("Writing")}
        aria-label={insertLabel}
        onClick={onInsert}
      >
        <Diamond className={cn("h-3 w-3", keyExists && "fill-amber-400 text-amber-400")} />
      </Button>
    </div>
  );
}

export function EfxbnColorAuthor({
  document,
  block,
  progress,
  frameCount,
  writing = false,
  focusedControlName,
  onFocusedControlNameChange,
  onDocumentChange,
  onError,
}: EfxbnColorAuthorProps) {
  const [linkRgb, setLinkRgb] = useState(true);

  const draftColor = useMemo(() => {
    const values = Object.fromEntries(
      (Object.entries(CHANNEL_CONTROL) as [ColorChannel, EfxbnColorControlName][]).map(
        ([channel, name]) => {
          const curve = readEfxbnCurve(document.summary, block.index, name);
          return [channel, evaluateEfxbnCurve(curve.keys, progress)];
        },
      ),
    ) as Record<ColorChannel, number>;
    const editable = Object.fromEntries(
      (Object.entries(CHANNEL_CONTROL) as [ColorChannel, EfxbnColorControlName][]).map(
        ([channel, name]) => [
          channel,
          editableColorKeyIndex(document, block.index, name, progress) !== null,
        ],
      ),
    ) as Record<ColorChannel, boolean>;
    return { ...values, editable };
  }, [block.index, document, progress]);

  const [color, setColor] = useState(draftColor);
  const colorRef = useRef(color);
  colorRef.current = color;
  useEffect(() => {
    colorRef.current = draftColor;
    setColor(draftColor);
  }, [draftColor]);

  const rgbLinkable = color.editable.r && color.editable.g && color.editable.b;
  const dirty = isEfxbnBlockDirty(document, block.index);
  const swatchAlpha = clamp(color.a, 0, 1);
  const frame = progressToEfxbnFrame(progress, frameCount) ?? progress;

  const resolvePatch = (
    previous: typeof color,
    channel: ColorChannel,
    nextValue: number,
  ): Partial<Record<ColorChannel, number>> | null => {
    if (writing || !previous.editable[channel]) return null;
    if (channel === "a" || !linkRgb || !rgbLinkable) return { [channel]: nextValue };
    const oldValue = previous[channel];
    if (Math.abs(oldValue) < 1e-8) return { [channel]: nextValue };
    const scale = nextValue / oldValue;
    return {
      r: clamp(previous.r * scale, 0, 2),
      g: clamp(previous.g * scale, 0, 2),
      b: clamp(previous.b * scale, 0, 2),
    };
  };

  const paintChannel = (channel: ColorChannel, value: number) => {
    const patch = resolvePatch(colorRef.current, channel, value);
    if (!patch) return;
    const next = { ...colorRef.current, ...patch };
    colorRef.current = next;
    setColor(next);
  };

  const commitPatch = (patch: Partial<Record<ColorChannel, number>>) => {
    try {
      const replacements = (Object.entries(patch) as [ColorChannel, number][]).map(
        ([channel, value]) => {
          const controlName = CHANNEL_CONTROL[channel];
          const curve = readEfxbnCurve(document.summary, block.index, controlName);
          const keyIndex = editableColorKeyIndex(document, block.index, controlName, progress);
          if (keyIndex === null) {
            throw new Error(`Insert a ${controlName} key at the playhead before editing it`);
          }
          return {
            controlName,
            keys: curve.keys.map((entry, index) =>
              index === keyIndex ? { ...entry, value } : { ...entry },
            ),
          };
        },
      );
      onDocumentChange(
        replaceEfxbnCurves(document, block.index, replacements, `Edit ${replacements.length} color keys`),
      );
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    }
  };

  const commitChannel = (channel: ColorChannel, value: number) => {
    const patch = resolvePatch(colorRef.current, channel, value);
    if (!patch) return;
    const next = { ...colorRef.current, ...patch };
    colorRef.current = next;
    setColor(next);
    commitPatch(patch);
  };

  const insertKeys = (channels: readonly ColorChannel[]) => {
    try {
      const replacements = channels.flatMap((channel) => {
        const controlName = CHANNEL_CONTROL[channel];
        const curve = readEfxbnCurve(document.summary, block.index, controlName);
        if (findEfxbnKeyAtProgress(curve.keys, progress) !== null) return [];
        return [{ controlName, keys: insertSampledEfxbnKey(curve.keys, progress) }];
      });
      if (replacements.length === 0) return;
      onDocumentChange(
        replaceEfxbnCurves(document, block.index, replacements, `Insert ${replacements.length} color keys`),
      );
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    }
  };

  const commitRgb = (nextRgb: { r: number; g: number; b: number }) => {
    if (writing || !rgbLinkable) return;
    const next = { ...colorRef.current, ...nextRgb };
    colorRef.current = next;
    setColor(next);
    commitPatch(nextRgb);
  };

  const rgbMissingKey = (["r", "g", "b"] as const).some((channel) => {
    const curve = readEfxbnCurve(document.summary, block.index, CHANNEL_CONTROL[channel]);
    return findEfxbnKeyAtProgress(curve.keys, progress) === null;
  });

  return (
    <div className="space-y-3 p-0.5">
      <p className="rounded-md border bg-muted/20 px-2 py-1.5 text-[10px] text-muted-foreground">
        Tint multiplies the colour map. The 3D preview updates when the drag ends.
      </p>

      <div className="rounded-md border border-border/60 bg-muted/15 p-2">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-[11px] font-medium">Particle / model tint</span>
          {dirty ? <Badge variant="outline" className="h-4 border-amber-500/40 px-1 text-[8px] text-amber-400">dirty</Badge> : null}
          {writing ? <Badge variant="outline" className="h-4 px-1 text-[8px]">writing</Badge> : null}
          <span className="ml-auto font-mono text-[9px] text-muted-foreground">frame {Number(frame.toFixed(3))}</span>
        </div>

        <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-3">
          <div className="flex flex-col items-center gap-1.5">
            <label
              className={cn(
                "relative h-16 w-16 overflow-hidden rounded-[10px] border border-white/15",
                rgbLinkable && !writing ? "cursor-pointer" : "cursor-not-allowed opacity-75",
              )}
              style={{
                background: `linear-gradient(135deg, rgba(${channelToByte(color.r)},${channelToByte(color.g)},${channelToByte(color.b)},${swatchAlpha}), rgba(${channelToByte(color.r * 0.55)},${channelToByte(color.g * 0.55)},${channelToByte(color.b * 0.55)},0.45)), repeating-conic-gradient(#2a2a2a 0% 25%, #1a1a1a 0% 50%) 50% / 10px 10px`,
              }}
              title="Pick RGB. Values above 1 remain available in the channel controls."
            >
              <input
                type="color"
                className="absolute inset-0 h-full w-full opacity-0"
                value={rgbToHex(color.r, color.g, color.b)}
                disabled={!rgbLinkable || writing}
                aria-label="RGB color picker"
                onInput={(event) => {
                  const raw = event.currentTarget.value.slice(1);
                  const next = {
                    r: parseInt(raw.slice(0, 2), 16) / 255,
                    g: parseInt(raw.slice(2, 4), 16) / 255,
                    b: parseInt(raw.slice(4, 6), 16) / 255,
                  };
                  colorRef.current = { ...colorRef.current, ...next };
                  setColor(colorRef.current);
                }}
                onChange={(event) => {
                  const raw = event.currentTarget.value.slice(1);
                  commitRgb({
                    r: parseInt(raw.slice(0, 2), 16) / 255,
                    g: parseInt(raw.slice(2, 4), 16) / 255,
                    b: parseInt(raw.slice(4, 6), 16) / 255,
                  });
                }}
              />
            </label>
            <span className="font-mono text-[9px] text-muted-foreground">{rgbToHex(color.r, color.g, color.b)}</span>
          </div>

          <div className="space-y-2">
            {(
              [
                ["r", "R", "text-red-400", 2],
                ["g", "G", "text-emerald-400", 2],
                ["b", "B", "text-sky-400", 2],
                ["a", "A", "text-muted-foreground", 4],
              ] as const
            ).map(([channel, letter, className, max]) => {
              const controlName = CHANNEL_CONTROL[channel];
              const editable = color.editable[channel];
              const curve = readEfxbnCurve(document.summary, block.index, controlName);
              const keyExists = findEfxbnKeyAtProgress(curve.keys, progress) !== null;
              return (
                <ChannelRow
                  key={channel}
                  letter={letter}
                  letterClassName={className}
                  value={color[channel]}
                  min={0}
                  max={max}
                  disabled={!editable || writing}
                  keyExists={keyExists}
                  focused={focusedControlName === controlName}
                  insertLabel={writing ? `Writing ${letter} channel` : `Insert ${letter} key at frame ${Number(frame.toFixed(3))}`}
                  onFocus={() => onFocusedControlNameChange(controlName)}
                  onInsert={() => {
                    onFocusedControlNameChange(controlName);
                    insertKeys([channel]);
                  }}
                  onDrag={(value) => paintChannel(channel, value)}
                  onCommit={(value) => commitChannel(channel, value)}
                />
              );
            })}
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant={linkRgb ? "secondary" : "ghost"}
            className="h-6 gap-1 px-2 text-[10px]"
            disabled={writing}
            onClick={() => setLinkRgb((value) => !value)}
          >
            {linkRgb ? <Link2 className="h-3 w-3" /> : <Unlink2 className="h-3 w-3" />}
            {linkRgb ? "Link RGB" : "Free RGB"}
          </Button>
          {rgbMissingKey ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-6 px-2 text-[10px]"
              disabled={writing}
              onClick={() => insertKeys(["r", "g", "b"])}
            >
              Insert RGB keys
            </Button>
          ) : null}
          <span className="text-[9px] text-muted-foreground">
            {rgbMissingKey
              ? "Insert a key at the playhead to edit this animated channel."
              : "Editing keys at the current playhead."}
          </span>
        </div>
      </div>

      <div className="space-y-1">
        {EFXBN_COLOR_CONTROL_NAMES.map((name) => {
          const curve = readEfxbnCurve(document.summary, block.index, name);
          const keyIndex = editableColorKeyIndex(document, block.index, name, progress);
          return (
            <button
              key={name}
              type="button"
              className="flex w-full items-center gap-2 py-1 text-left"
              onClick={() => onFocusedControlNameChange(name)}
            >
              <span className="w-12 font-mono text-[9px]">{name}</span>
              <Badge variant="outline" className="h-4 px-1 text-[8px]">
                {curve.keys.length === 1 ? "const" : `${curve.keys.length} keys`}
              </Badge>
              <span className="ml-auto font-mono text-[9px] text-muted-foreground">
                {keyIndex === null ? "between keys" : `key ${keyIndex}`}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
