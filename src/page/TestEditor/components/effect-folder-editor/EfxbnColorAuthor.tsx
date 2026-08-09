import { useEffect, useMemo, useRef, useState } from "react";
import { Link2, Unlink2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import type { EfxbnEffectSummary } from "@/services/effectFolder/effectFolderService";
import {
  type EfxbnColorControlName,
  type EfxbnDraftSession,
  EFXBN_COLOR_CONTROL_NAMES,
  isEfxbnBlockDirty,
  tryGetControlConstant,
} from "./efxbnDraftSession";
import { evaluateEfxbnControl } from "./effectFolderPreviewPlan";
import type { EffectFolderPreviewPlan } from "./effectFolderPreviewPlan";

type EfxbnColorAuthorProps = {
  draft: EfxbnDraftSession;
  block: EfxbnEffectSummary;
  plan: EffectFolderPreviewPlan;
  progress: number;
  writing?: boolean;
  onPatchColor: (
    blockIndex: number,
    color: { r?: number; g?: number; b?: number; a?: number },
  ) => void;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function channelToByte(value: number): number {
  return Math.round(clamp(value, 0, 1) * 255);
}

function rgbToHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b]
      .map((channel) => channelToByte(channel).toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}

function laneMeta(block: EfxbnEffectSummary, name: EfxbnColorControlName) {
  const reference = block.controlReferences.find((entry) => entry.name === name);
  if (!reference || reference.selector === 0) {
    return { mode: "unused" as const, selector: 0, lookupIndex: -1 };
  }
  if (reference.selector === 1) {
    return {
      mode: "const" as const,
      selector: 1,
      lookupIndex: reference.lookupIndex,
    };
  }
  return {
    mode: "curve" as const,
    selector: reference.selector,
    lookupIndex: reference.lookupIndex,
  };
}

type ChannelRowProps = {
  letter: string;
  letterClassName: string;
  value: number;
  min: number;
  max: number;
  disabled: boolean;
  /** Continuous drag / typing — UI only, must not touch 3D draft. */
  onDrag: (value: number) => void;
  /** Pointer release / Enter / blur — apply to draft + 3D. */
  onCommit: (value: number) => void;
};

function ChannelRow({
  letter,
  letterClassName,
  value,
  min,
  max,
  disabled,
  onDrag,
  onCommit,
}: ChannelRowProps) {
  return (
    <div className="grid grid-cols-[14px_minmax(0,1fr)_56px] items-center gap-2">
      <span className={cn("font-mono text-[10px] font-bold", letterClassName)}>{letter}</span>
      <Slider
        min={min}
        max={max}
        step={0.01}
        value={[value]}
        disabled={disabled}
        onValueChange={(next) => onDrag(next[0] ?? value)}
        onValueCommit={(next) => onCommit(next[0] ?? value)}
        aria-label={`${letter} channel`}
      />
      <Input
        type="number"
        min={min}
        max={max}
        step={0.01}
        value={Number.isFinite(value) ? value.toFixed(2) : "0.00"}
        disabled={disabled}
        className="h-7 px-1.5 font-mono text-[11px] tabular-nums"
        onChange={(event) => {
          const parsed = Number(event.target.value);
          if (!Number.isFinite(parsed)) return;
          onDrag(clamp(parsed, min, max));
        }}
        onBlur={() => onCommit(value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          }
        }}
      />
    </div>
  );
}

export function EfxbnColorAuthor({
  draft,
  block,
  plan,
  progress,
  writing = false,
  onPatchColor,
}: EfxbnColorAuthorProps) {
  const [linkRgb, setLinkRgb] = useState(true);

  const laneModes = useMemo(
    () =>
      Object.fromEntries(
        EFXBN_COLOR_CONTROL_NAMES.map((name) => [name, laneMeta(block, name)]),
      ) as Record<EfxbnColorControlName, ReturnType<typeof laneMeta>>,
    [block],
  );

  // Draft-derived colour (source of truth after commit / external revert).
  const draftColor = useMemo(() => {
    const r = tryGetControlConstant(draft, block.index, "colorR");
    const g = tryGetControlConstant(draft, block.index, "colorG");
    const b = tryGetControlConstant(draft, block.index, "colorB");
    const a = tryGetControlConstant(draft, block.index, "colorA");
    return {
      r: r ?? evaluateEfxbnControl(
        block.controlReferences.find((entry) => entry.name === "colorR"),
        plan.controlLookupEntries,
        progress,
      ),
      g: g ?? evaluateEfxbnControl(
        block.controlReferences.find((entry) => entry.name === "colorG"),
        plan.controlLookupEntries,
        progress,
      ),
      b: b ?? evaluateEfxbnControl(
        block.controlReferences.find((entry) => entry.name === "colorB"),
        plan.controlLookupEntries,
        progress,
      ),
      a: a ?? evaluateEfxbnControl(
        block.controlReferences.find((entry) => entry.name === "colorA"),
        plan.controlLookupEntries,
        progress,
      ),
      editable: {
        r: r !== null,
        g: g !== null,
        b: b !== null,
        a: a !== null,
      },
    };
  }, [block.controlReferences, block.index, draft, plan.controlLookupEntries, progress]);

  /**
   * Local paint while dragging. 3D/draft only update on commit (slider release,
   * colour-picker close, number blur) so continuous pointer moves stay cheap.
   */
  const [color, setColor] = useState(draftColor);
  const colorRef = useRef(color);
  colorRef.current = color;
  useEffect(() => {
    setColor((prev) => {
      if (
        prev.r === draftColor.r &&
        prev.g === draftColor.g &&
        prev.b === draftColor.b &&
        prev.a === draftColor.a &&
        prev.editable.r === draftColor.editable.r &&
        prev.editable.g === draftColor.editable.g &&
        prev.editable.b === draftColor.editable.b &&
        prev.editable.a === draftColor.editable.a
      ) {
        return prev;
      }
      return draftColor;
    });
  }, [block.index, draft.path, draftColor]);

  const anyEditable = color.editable.r || color.editable.g || color.editable.b || color.editable.a;
  const allConst = EFXBN_COLOR_CONTROL_NAMES.every((name) => laneModes[name].mode === "const");
  const anyCurve = EFXBN_COLOR_CONTROL_NAMES.some((name) => laneModes[name].mode === "curve");
  const rgbLinkable = color.editable.r && color.editable.g && color.editable.b;
  const dirty = isEfxbnBlockDirty(draft, block.index);
  const hex = rgbToHex(color.r, color.g, color.b);
  const swatchAlpha = clamp(color.a, 0, 1);
  const controlsLocked = writing;

  const evaluated = useMemo(() => {
    return EFXBN_COLOR_CONTROL_NAMES.map((name) => {
      const reference = block.controlReferences.find((entry) => entry.name === name);
      return {
        name,
        value: evaluateEfxbnControl(reference, plan.controlLookupEntries, progress),
        meta: laneModes[name],
      };
    });
  }, [block.controlReferences, laneModes, plan.controlLookupEntries, progress]);

  /** Compute next local colour for a channel edit (link-RGB aware). */
  const resolveChannelPaint = (
    prev: typeof color,
    channel: "r" | "g" | "b" | "a",
    nextValue: number,
  ): { r?: number; g?: number; b?: number; a?: number } | null => {
    if (controlsLocked || !prev.editable[channel]) return null;
    if (channel === "a" || !linkRgb || !rgbLinkable) {
      return { [channel]: nextValue };
    }
    const previous = prev[channel];
    if (Math.abs(previous) < 1e-8) {
      return { [channel]: nextValue };
    }
    const scale = nextValue / previous;
    return {
      r: clamp(prev.r * scale, 0, 2),
      g: clamp(prev.g * scale, 0, 2),
      b: clamp(prev.b * scale, 0, 2),
    };
  };

  const paintChannel = (channel: "r" | "g" | "b" | "a", nextValue: number) => {
    const prev = colorRef.current;
    const patch = resolveChannelPaint(prev, channel, nextValue);
    if (!patch) return;
    const next = { ...prev, ...patch };
    colorRef.current = next;
    setColor(next);
  };

  const commitChannel = (channel: "r" | "g" | "b" | "a", nextValue: number) => {
    const prev = colorRef.current;
    const patch = resolveChannelPaint(prev, channel, nextValue);
    if (!patch) return;
    const next = { ...prev, ...patch };
    colorRef.current = next;
    setColor(next);
    onPatchColor(block.index, patch);
  };

  const paintRgb = (nextRgb: { r: number; g: number; b: number }) => {
    if (controlsLocked || !rgbLinkable) return;
    const next = { ...colorRef.current, ...nextRgb };
    colorRef.current = next;
    setColor(next);
  };

  const commitRgb = (nextRgb: { r: number; g: number; b: number }) => {
    if (controlsLocked || !rgbLinkable) return;
    const next = { ...colorRef.current, ...nextRgb };
    colorRef.current = next;
    setColor(next);
    onPatchColor(block.index, nextRgb);
  };

  if (!anyEditable && !anyCurve) {
    return (
      <p className="py-2 text-[10px] text-muted-foreground">
        Color lanes are unused on this block.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="rounded-md border border-sky-500/25 bg-sky-500/10 px-2 py-1.5 text-[10px] text-sky-100/90">
        Tint multiplies the colour map:{" "}
        <span className="font-mono">final = texel × (R,G,B,A)</span>. Dragging only updates this
        panel; the 3D preview applies when you release the control. Persist with footer Save EFXBN.
      </p>

      <div className="rounded-md border border-border/60 bg-muted/15 p-2">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-[11px] font-medium">Particle / model tint</span>
          {dirty ? (
            <Badge variant="outline" className="h-4 border-amber-500/40 px-1 text-[8px] text-amber-400">
              dirty
            </Badge>
          ) : null}
          {writing ? (
            <Badge variant="outline" className="h-4 px-1 text-[8px] text-muted-foreground">
              writing
            </Badge>
          ) : null}
          <span className="ml-auto font-mono text-[9px] text-muted-foreground">
            {allConst ? "const" : anyCurve && anyEditable ? "mixed" : anyCurve ? "curve" : "mixed"}
          </span>
        </div>

        <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-3">
          <div className="flex flex-col items-center gap-1.5">
            <label
              className={cn(
                "relative h-16 w-16 overflow-hidden rounded-[10px] border border-white/15 shadow-md",
                rgbLinkable && !controlsLocked ? "cursor-pointer" : "cursor-not-allowed opacity-80",
              )}
              style={{
                background: `
                  linear-gradient(135deg, rgba(${channelToByte(color.r)},${channelToByte(color.g)},${channelToByte(color.b)},${swatchAlpha}),
                  rgba(${channelToByte(color.r * 0.55)},${channelToByte(color.g * 0.55)},${channelToByte(color.b * 0.55)},0.45)),
                  repeating-conic-gradient(#2a2a2a 0% 25%, #1a1a1a 0% 50%) 50% / 10px 10px
                `,
              }}
              title="Pick RGB (0..1). Values above 1 stay on the sliders."
            >
              <input
                type="color"
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
                value={`#${[color.r, color.g, color.b].map((c) => channelToByte(c).toString(16).padStart(2, "0")).join("")}`}
                disabled={!rgbLinkable || controlsLocked}
                aria-label="RGB color picker"
                onInput={(event) => {
                  // Continuous drag inside the OS colour dialog — local swatch only.
                  const raw = event.currentTarget.value.replace("#", "");
                  paintRgb({
                    r: parseInt(raw.slice(0, 2), 16) / 255,
                    g: parseInt(raw.slice(2, 4), 16) / 255,
                    b: parseInt(raw.slice(4, 6), 16) / 255,
                  });
                }}
                onChange={(event) => {
                  // Dialog closed / final value — push draft + 3D once.
                  const raw = event.currentTarget.value.replace("#", "");
                  commitRgb({
                    r: parseInt(raw.slice(0, 2), 16) / 255,
                    g: parseInt(raw.slice(2, 4), 16) / 255,
                    b: parseInt(raw.slice(4, 6), 16) / 255,
                  });
                }}
                onBlur={(event) => {
                  const raw = event.currentTarget.value.replace("#", "");
                  commitRgb({
                    r: parseInt(raw.slice(0, 2), 16) / 255,
                    g: parseInt(raw.slice(2, 4), 16) / 255,
                    b: parseInt(raw.slice(4, 6), 16) / 255,
                  });
                }}
              />
            </label>
            <span className="font-mono text-[9px] text-muted-foreground">{hex}</span>
          </div>

          <div className="space-y-2">
            <ChannelRow
              letter="R"
              letterClassName="text-red-400"
              value={color.r}
              min={0}
              max={2}
              disabled={!color.editable.r || controlsLocked}
              onDrag={(value) => paintChannel("r", value)}
              onCommit={(value) => commitChannel("r", value)}
            />
            <ChannelRow
              letter="G"
              letterClassName="text-emerald-400"
              value={color.g}
              min={0}
              max={2}
              disabled={!color.editable.g || controlsLocked}
              onDrag={(value) => paintChannel("g", value)}
              onCommit={(value) => commitChannel("g", value)}
            />
            <ChannelRow
              letter="B"
              letterClassName="text-sky-400"
              value={color.b}
              min={0}
              max={2}
              disabled={!color.editable.b || controlsLocked}
              onDrag={(value) => paintChannel("b", value)}
              onCommit={(value) => commitChannel("b", value)}
            />
            <ChannelRow
              letter="A"
              letterClassName="text-muted-foreground"
              value={color.a}
              min={0}
              max={4}
              disabled={!color.editable.a || controlsLocked}
              onDrag={(value) => paintChannel("a", value)}
              onCommit={(value) => commitChannel("a", value)}
            />
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant={linkRgb ? "secondary" : "ghost"}
            className="h-6 gap-1 px-2 text-[10px]"
            disabled={!rgbLinkable || controlsLocked}
            onClick={() => setLinkRgb((value) => !value)}
            title={linkRgb ? "RGB channels scale together" : "Edit channels independently"}
          >
            {linkRgb ? <Link2 className="h-3 w-3" /> : <Unlink2 className="h-3 w-3" />}
            {linkRgb ? "Link RGB" : "Free RGB"}
          </Button>
          {anyCurve ? (
            <span className="text-[9px] text-amber-500">
              Curve colour lanes are view-only; constant channels remain editable.
            </span>
          ) : null}
        </div>
      </div>

      <div>
        <div className="mb-1 flex items-center gap-2">
          <span className="text-[11px] font-medium">Curve key table</span>
          <span className="ml-auto font-mono text-[9px] text-muted-foreground">
            eval @ {progress.toFixed(1)}
          </span>
        </div>
        {evaluated.map((lane) => (
          <div
            key={lane.name}
            className="flex items-center gap-2 border-b border-border/45 py-1.5 last:border-b-0"
          >
            <span className="w-12 shrink-0 font-mono text-[9px]">{lane.name}</span>
            <Badge variant="outline" className="h-4 px-1 text-[8px]">
              {lane.meta.mode === "const"
                ? `idx ${lane.meta.lookupIndex}`
                : lane.meta.mode === "curve"
                  ? `${lane.meta.selector} keys`
                  : "unused"}
            </Badge>
            <span className="ml-auto font-mono text-[9px] tabular-nums">
              {lane.value.toFixed(4)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
