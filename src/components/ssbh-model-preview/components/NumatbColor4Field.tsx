import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";

export type NumatbColor4 = {
  r: number;
  g: number;
  b: number;
  a: number;
};

/** Disk and in-memory MATL colors are either `{r,g,b,a}`, `{x,y,z,w}`, or an RGBA `[f32;4]`. */
export type NumatbColor4Input =
  | NumatbColor4
  | { x?: number; y?: number; z?: number; w?: number }
  | readonly number[]
  | null
  | undefined;

const CHANNELS = [
  ["r", "R"],
  ["g", "G"],
  ["b", "B"],
  ["a", "A"],
] as const;

function finiteOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function channel(value: unknown): number {
  return finiteOrZero(typeof value === "number" ? value : Number(value));
}

/** Reads a MATL color. Arrays are RGBA: index 0 red, 1 green, 2 blue, 3 alpha. */
export function readNumatbColor4(value: NumatbColor4Input): NumatbColor4 {
  if (Array.isArray(value)) {
    return {
      r: channel(value[0]),
      g: channel(value[1]),
      b: channel(value[2]),
      a: channel(value[3]),
    };
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if ("r" in record || "g" in record || "b" in record || "a" in record) {
      return {
        r: channel(record.r),
        g: channel(record.g),
        b: channel(record.b),
        a: channel(record.a),
      };
    }
    if ("x" in record || "y" in record || "z" in record || "w" in record) {
      return {
        r: channel(record.x),
        g: channel(record.y),
        b: channel(record.z),
        a: channel(record.w),
      };
    }
  }
  return { r: 0, g: 0, b: 0, a: 0 };
}

export function colorChannelToByte(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(255, Math.round(value * 255)));
}

export function rgbToHex(r: number, g: number, b: number): string {
  const channel = (value: number) => colorChannelToByte(value).toString(16).padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

function colorIsOutsideUnitRange(color: NumatbColor4): boolean {
  return (["r", "g", "b"] as const).some((channel) => color[channel] < 0 || color[channel] > 1);
}

function ChannelInput({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: number;
  onCommit: (next: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  return (
    <Input
      type="number"
      step="0.01"
      aria-label={label}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (draft === String(value)) {
          return;
        }
        const parsed = Number(draft);
        onCommit(Number.isFinite(parsed) ? parsed : 0);
      }}
      className="h-8 px-1.5 text-[11px]"
    />
  );
}

export function NumatbColor4Field({
  value,
  onChange,
}: {
  value: NumatbColor4Input;
  onChange: (next: NumatbColor4) => void;
}) {
  const color = readNumatbColor4(value);
  const outsideUnitRange = colorIsOutsideUnitRange(color);
  const swatchAlpha = Math.max(0, Math.min(1, color.a));

  return (
    <div className="flex min-w-0 items-center gap-2">
      <label
        className="relative h-8 w-8 shrink-0 overflow-hidden rounded-md border border-border"
        title={
          outsideUnitRange
            ? "Stored RGB is outside 0-1. Edit the number fields to keep that range."
            : "Pick color"
        }
      >
        <span
          aria-hidden
          className="absolute inset-0"
          style={{
            backgroundColor: `rgba(${colorChannelToByte(color.r)}, ${colorChannelToByte(color.g)}, ${colorChannelToByte(color.b)}, ${swatchAlpha})`,
          }}
        />
        <input
          type="color"
          aria-label="Pick color"
          disabled={outsideUnitRange}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
          value={rgbToHex(color.r, color.g, color.b)}
          onChange={(event) => {
            const raw = event.currentTarget.value.slice(1);
            onChange({
              r: Number.parseInt(raw.slice(0, 2), 16) / 255,
              g: Number.parseInt(raw.slice(2, 4), 16) / 255,
              b: Number.parseInt(raw.slice(4, 6), 16) / 255,
              a: color.a,
            });
          }}
        />
      </label>
      <div className="grid min-w-0 flex-1 grid-cols-4 gap-1">
        {CHANNELS.map(([channel, label]) => (
          <ChannelInput
            key={channel}
            label={label}
            value={color[channel]}
            onCommit={(next) => onChange({ ...color, [channel]: next })}
          />
        ))}
      </div>
    </div>
  );
}
