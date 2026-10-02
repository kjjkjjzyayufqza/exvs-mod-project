import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { EfxbnEffectSummary } from "@/services/effectFolder/effectFolderService";
import { setEfxbnFields, type EfxbnDocument } from "./efxbnDocument";
import {
  EFXBN_FIELD_SCHEMA,
  efxbnFieldId,
  readEfxbnField,
  type EfxbnFieldDescriptor,
} from "./efxbnFieldSchema";
import { ACTION_FLAG_VIEW_ANGLE_COLOR, efxbnViewAngleFactor } from "./efxbnBillboardShading";
import { efxbnRuntime } from "./efxbnSimulation";
import { EfxbnNumberInput } from "./EfxbnNumberInput";

/**
 * The view-angle ramp as two colour stops and the curve between them.
 *
 * The shaders multiply the particle colour by `lerp(start, end, t)`, where `t` grows from 0 where
 * the surface faces the camera to 1 where it is seen edge-on (`efxbnViewAngleFactor`). The bar
 * plots exactly that product over the rim term, so threshold and power read as a shape instead of
 * two bare numbers.
 */

type Rgba = [number, number, number, number];
type RampStopKey = "blurStartColor" | "blurEndColor";
type RampDraft = Record<RampStopKey, Rgba> & { blurEnableRange: number; blurFadePower: number };
type FieldWrite = { field: EfxbnFieldDescriptor; value: number };

const CHANNELS = [
  { letter: "R", className: "text-red-400" },
  { letter: "G", className: "text-emerald-400" },
  { letter: "B", className: "text-sky-400" },
  { letter: "A", className: "text-muted-foreground" },
] as const;
/** Slider span for a colour multiplier; a larger authored value widens it instead of clamping. */
const CHANNEL_SLIDER_MAX = 2;
const THRESHOLD_SLIDER_MAX = 1;
const POWER_SLIDER_MAX = 4;
const GRADIENT_SAMPLES = 24;
/** Runtime element types whose draw path reads the ramp: billboard and model. */
const RAMP_ELEMENT_TYPES: ReadonlySet<number> = new Set([1, 3]);
const CHECKER = "repeating-conic-gradient(#2a2a2a 0% 25%, #1a1a1a 0% 50%) 50% / 8px 8px";

function schemaField(key: string, component?: number): EfxbnFieldDescriptor {
  const field = EFXBN_FIELD_SCHEMA.find(
    (entry) => entry.key === key && entry.component === component,
  );
  if (!field) {
    throw new Error(`EFXBN field schema has no ${component === undefined ? key : `${key}.${component}`}`);
  }
  return field;
}

const STOP_FIELDS: Record<RampStopKey, readonly EfxbnFieldDescriptor[]> = {
  blurStartColor: CHANNELS.map((_, component) => schemaField("blurStartColor", component)),
  blurEndColor: CHANNELS.map((_, component) => schemaField("blurEndColor", component)),
};
const THRESHOLD_FIELD = schemaField("blurEnableRange");
const POWER_FIELD = schemaField("blurFadePower");
const ACTION_FLAGS_FIELD = schemaField("actionFlags");

function toByte(value: number): number {
  return Math.round(Math.min(1, Math.max(0, value)) * 255);
}

function cssRgba([r, g, b, a]: Rgba): string {
  return `rgba(${toByte(r)},${toByte(g)},${toByte(b)},${Math.min(1, Math.max(0, a))})`;
}

function hexOfRgb([r, g, b]: Rgba): string {
  return `#${[r, g, b].map((value) => toByte(value).toString(16).padStart(2, "0")).join("")}`;
}

function parseHexRgb(hex: string): [number, number, number] {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!match) throw new Error(`Colour picker returned ${hex}, expected #rrggbb`);
  return [1, 2, 3].map((group) => Number.parseInt(match[group]!, 16) / 255) as [number, number, number];
}

function readDraft(block: EfxbnEffectSummary): RampDraft {
  return {
    blurStartColor: [...block.blurStartColor],
    blurEndColor: [...block.blurEndColor],
    blurEnableRange: block.blurEnableRange,
    blurFadePower: block.blurFadePower,
  };
}

function rampBackground(draft: RampDraft): string {
  const stops = Array.from({ length: GRADIENT_SAMPLES }, (_, sample) => {
    const rim = sample / (GRADIENT_SAMPLES - 1);
    const t = efxbnViewAngleFactor(rim, draft.blurEnableRange, draft.blurFadePower);
    const color = draft.blurStartColor.map(
      (start, channel) => start + (draft.blurEndColor[channel]! - start) * t,
    ) as Rgba;
    return `${cssRgba(color)} ${(rim * 100).toFixed(1)}%`;
  });
  return `linear-gradient(90deg, ${stops.join(", ")}), ${CHECKER}`;
}

function SliderRow({
  label,
  labelClassName,
  ariaLabel = label,
  value,
  sliderMax,
  step,
  disabled,
  onDraft,
  onCommit,
}: {
  label: string;
  labelClassName?: string;
  ariaLabel?: string;
  value: number;
  sliderMax: number;
  step: number;
  disabled?: boolean;
  onDraft: (value: number) => void;
  onCommit: (value: number) => void;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)_3.25rem] items-center gap-1.5">
      <span className={cn("font-mono text-[10px]", labelClassName)}>{label}</span>
      <Slider
        min={Math.min(0, value)}
        max={Math.max(sliderMax, value)}
        step={step}
        value={[value]}
        disabled={disabled}
        aria-label={ariaLabel}
        onValueChange={(next) => onDraft(next[0] ?? value)}
        onValueCommit={(next) => onCommit(next[0] ?? value)}
      />
      <EfxbnNumberInput
        value={value}
        integral={false}
        disabled={disabled}
        ariaLabel={ariaLabel}
        onCommit={onCommit}
      />
    </div>
  );
}

function RampStop({
  label,
  color,
  dirty,
  disabled,
  onDraft,
  onCommit,
}: {
  label: string;
  color: Rgba;
  dirty: boolean;
  disabled?: boolean;
  onDraft: (color: Rgba) => void;
  onCommit: (components: readonly number[], color: Rgba) => void;
}) {
  const { t } = useTranslation("test-effect-folder");
  const pickerRef = useRef<HTMLInputElement>(null);
  const latest = useRef({ color, onCommit });
  latest.current = { color, onCommit };

  // React's onChange on a colour input fires on every drag step; the native `change` event fires
  // once when the picker closes, which is the moment that deserves an undo step.
  useEffect(() => {
    const picker = pickerRef.current;
    if (!picker) return undefined;
    const commitPicked = () => {
      const [r, g, b] = parseHexRgb(picker.value);
      latest.current.onCommit([0, 1, 2], [r, g, b, latest.current.color[3]]);
    };
    picker.addEventListener("change", commitPicked);
    return () => picker.removeEventListener("change", commitPicked);
  }, []);

  const withChannel = (channel: number, value: number): Rgba =>
    color.map((entry, index) => (index === channel ? value : entry)) as Rgba;

  return (
    <div className="grid grid-cols-[2.75rem_minmax(0,1fr)] gap-2 rounded-md border border-border/60 bg-muted/15 p-1.5">
      <div className="flex flex-col items-center gap-1">
        <label
          className={cn(
            "relative h-11 w-11 overflow-hidden rounded-md border border-white/15",
            disabled ? "cursor-not-allowed opacity-75" : "cursor-pointer",
          )}
          style={{ background: `linear-gradient(${cssRgba(color)}, ${cssRgba(color)}), ${CHECKER}` }}
          title={t("block.viewRamp.pick", { stop: label })}
        >
          <input
            ref={pickerRef}
            type="color"
            className="absolute inset-0 h-full w-full cursor-[inherit] opacity-0"
            value={hexOfRgb(color)}
            disabled={disabled}
            aria-label={t("block.viewRamp.pick", { stop: label })}
            onChange={(event) => {
              const [r, g, b] = parseHexRgb(event.currentTarget.value);
              onDraft([r, g, b, color[3]]);
            }}
          />
        </label>
        <span className="font-mono text-[9px] uppercase text-muted-foreground" data-i18n-ignore="">
          {hexOfRgb(color)}
        </span>
      </div>
      <div className="min-w-0 space-y-1">
        <span
          className={cn(
            "block text-[10px] font-medium",
            dirty && "text-amber-600 dark:text-amber-400",
          )}
        >
          {label}
        </span>
        {CHANNELS.map(({ letter, className }, channel) => (
          <SliderRow
            key={letter}
            label={letter}
            labelClassName={className}
            ariaLabel={t("block.viewRamp.channel", { stop: label, letter })}
            value={color[channel]!}
            sliderMax={CHANNEL_SLIDER_MAX}
            step={0.01}
            disabled={disabled}
            onDraft={(value) => onDraft(withChannel(channel, value))}
            onCommit={(value) => onCommit([channel], withChannel(channel, value))}
          />
        ))}
      </div>
    </div>
  );
}

export function EfxbnViewAngleRampEditor({
  document: doc,
  blockIndex,
  block,
  dirtyFields,
  disabled,
  onChange,
  onError,
}: {
  document: EfxbnDocument;
  blockIndex: number;
  block: EfxbnEffectSummary;
  dirtyFields: Set<string>;
  disabled?: boolean;
  onChange: (next: EfxbnDocument) => void;
  onError: (message: string) => void;
}) {
  const { t } = useTranslation("test-effect-folder");
  const authored = useMemo(() => readDraft(block), [block]);
  const [draft, setDraft] = useState(authored);
  useEffect(() => setDraft(authored), [authored]);

  const actionFlags = block.actionFlags >>> 0;
  const enabled = (actionFlags & ACTION_FLAG_VIEW_ANGLE_COLOR) !== 0;
  const readsRamp = RAMP_ELEMENT_TYPES.has(efxbnRuntime(block).elementType);

  const commit = (writes: readonly FieldWrite[], label: string) => {
    const changed = writes.filter(({ field, value }) => readEfxbnField(block, field) !== value);
    if (changed.length === 0) {
      setDraft(authored);
      return;
    }
    try {
      onChange(setEfxbnFields(doc, blockIndex, changed, label));
    } catch (error) {
      setDraft(authored);
      onError(error instanceof Error ? error.message : String(error));
    }
  };

  const commitStop = (key: RampStopKey, components: readonly number[], color: Rgba) => {
    setDraft((current) => ({ ...current, [key]: color }));
    const writes = components.map((component) => ({
      field: STOP_FIELDS[key][component]!,
      value: color[component]!,
    }));
    const label =
      components.length === 1
        ? `${writes[0]!.field.label} = ${writes[0]!.value}`
        : `${key} = ${hexOfRgb(color)}`;
    commit(writes, label);
  };

  const commitScalar = (field: EfxbnFieldDescriptor, key: "blurEnableRange" | "blurFadePower", value: number) => {
    setDraft((current) => ({ ...current, [key]: value }));
    commit([{ field, value }], `${field.label} = ${value}`);
  };

  const stops: readonly { key: RampStopKey; label: string }[] = [
    { key: "blurStartColor", label: t("block.viewRamp.start") },
    { key: "blurEndColor", label: t("block.viewRamp.end") },
  ];

  return (
    <div className="space-y-2 pb-1 pt-0.5">
      <label className="flex items-center gap-2">
        <Switch
          checked={enabled}
          disabled={disabled}
          onCheckedChange={(next) =>
            commit(
              [
                {
                  field: ACTION_FLAGS_FIELD,
                  value: (next ? actionFlags | ACTION_FLAG_VIEW_ANGLE_COLOR : actionFlags & ~ACTION_FLAG_VIEW_ANGLE_COLOR) >>> 0,
                },
              ],
              `View-angle ramp ${next ? "on" : "off"}`,
            )
          }
        />
        <span className="text-[10px] font-medium">{t("block.viewRamp.enabled")}</span>
        <span className="ml-auto font-mono text-[9px] text-muted-foreground" data-i18n-ignore="">
          actionFlags 0x02000000
        </span>
      </label>

      <p className="text-[10px] leading-snug text-muted-foreground">
        {readsRamp ? t("block.viewRamp.help") : t("block.viewRamp.ignored")}
      </p>

      <div className={cn("space-y-2", !(enabled && readsRamp) && "opacity-60")}>
        <div className="space-y-0.5">
          <div
            className="relative h-5 overflow-hidden rounded-md border border-white/10"
            style={{ background: rampBackground(draft) }}
          >
            {draft.blurEnableRange > 0 && draft.blurEnableRange < 1 ? (
              <span
                className="absolute inset-y-0 w-px bg-white/60"
                style={{ left: `${draft.blurEnableRange * 100}%` }}
              />
            ) : null}
          </div>
          <div className="flex justify-between text-[9px] text-muted-foreground">
            <span>{t("block.viewRamp.faceOn")}</span>
            <span>{t("block.viewRamp.edgeOn")}</span>
          </div>
        </div>

        {stops.map(({ key, label }) => (
          <RampStop
            key={key}
            label={label}
            color={draft[key]}
            dirty={STOP_FIELDS[key].some((field) => dirtyFields.has(efxbnFieldId(field)))}
            disabled={disabled}
            onDraft={(color) => setDraft((current) => ({ ...current, [key]: color }))}
            onCommit={(components, color) => commitStop(key, components, color)}
          />
        ))}

        <div className="space-y-1 px-0.5">
          <SliderRow
            label={t("block.viewRamp.threshold")}
            labelClassName={cn(
              "w-14 font-sans text-muted-foreground",
              dirtyFields.has(efxbnFieldId(THRESHOLD_FIELD)) && "text-amber-600 dark:text-amber-400",
            )}
            value={draft.blurEnableRange}
            sliderMax={THRESHOLD_SLIDER_MAX}
            step={0.01}
            disabled={disabled}
            onDraft={(value) => setDraft((current) => ({ ...current, blurEnableRange: value }))}
            onCommit={(value) => commitScalar(THRESHOLD_FIELD, "blurEnableRange", value)}
          />
          <SliderRow
            label={t("block.viewRamp.power")}
            labelClassName={cn(
              "w-14 font-sans text-muted-foreground",
              dirtyFields.has(efxbnFieldId(POWER_FIELD)) && "text-amber-600 dark:text-amber-400",
            )}
            value={draft.blurFadePower}
            sliderMax={POWER_SLIDER_MAX}
            step={0.05}
            disabled={disabled}
            onDraft={(value) => setDraft((current) => ({ ...current, blurFadePower: value }))}
            onCommit={(value) => commitScalar(POWER_FIELD, "blurFadePower", value)}
          />
        </div>
      </div>
    </div>
  );
}
