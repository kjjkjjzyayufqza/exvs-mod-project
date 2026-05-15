import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { NutexbTextureDataMap } from "../hooks/useSceneTextureLoader";

export interface TextureQualityPreset {
  key: string;
  label: string;
  maxDimension: number | null;
  description: string;
  badge: string;
}

export const TEXTURE_QUALITY_PRESETS: TextureQualityPreset[] = [
  { key: "draft", label: "Draft", maxDimension: 512, description: "Fast preview, basic shapes and colors", badge: "512px" },
  { key: "standard", label: "Standard", maxDimension: 1024, description: "Balanced quality and performance", badge: "1K" },
  { key: "high", label: "High", maxDimension: 2048, description: "Detailed preview with sharp textures", badge: "2K" },
  { key: "original", label: "Original", maxDimension: null, description: "Native resolution, no downsampling", badge: "Full" },
];

export function getMaxDimensionForQuality(qualityKey: string): number | null {
  const preset = TEXTURE_QUALITY_PRESETS.find((p) => p.key === qualityKey);
  return preset ? preset.maxDimension : 2048;
}

interface TextureStats {
  uniqueCount: number;
  totalRgbaBytes: number;
  maxWidth: number;
  maxHeight: number;
  resolutionBuckets: Map<string, number>;
}

function computeTextureStats(textureDataMap: NutexbTextureDataMap): TextureStats {
  const seen = new Set<string>();
  let totalRgbaBytes = 0;
  let maxWidth = 0;
  let maxHeight = 0;
  const resolutionBuckets = new Map<string, number>();

  for (const [path, data] of textureDataMap) {
    const key = path.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    totalRgbaBytes += data.rgba.byteLength;
    maxWidth = Math.max(maxWidth, data.width);
    maxHeight = Math.max(maxHeight, data.height);

    const bucket = `${data.width}×${data.height}`;
    resolutionBuckets.set(bucket, (resolutionBuckets.get(bucket) ?? 0) + 1);
  }

  return { uniqueCount: seen.size, totalRgbaBytes, maxWidth, maxHeight, resolutionBuckets };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

interface TextureQualityPanelProps {
  quality: string;
  onQualityChange: (quality: string) => void;
  textureDataMap: NutexbTextureDataMap;
  isDecoding: boolean;
}

export function TextureQualityPanel({
  quality,
  onQualityChange,
  textureDataMap,
  isDecoding,
}: TextureQualityPanelProps) {
  const stats = useMemo(() => computeTextureStats(textureDataMap), [textureDataMap]);

  const sortedBuckets = useMemo(() => {
    return [...stats.resolutionBuckets.entries()].sort((a, b) => {
      const aMax = Math.max(...a[0].split("×").map(Number));
      const bMax = Math.max(...b[0].split("×").map(Number));
      return bMax - aMax;
    });
  }, [stats.resolutionBuckets]);

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest select-none">
        Texture Quality
      </div>

      <div className="flex flex-col gap-1.5">
        {TEXTURE_QUALITY_PRESETS.map((preset) => {
          const active = quality === preset.key;
          return (
            <button
              key={preset.key}
              type="button"
              onClick={() => onQualityChange(preset.key)}
              className={cn(
                "flex items-center justify-between rounded-md border px-3 py-2 text-left transition-colors",
                "hover:bg-accent/50",
                active
                  ? "border-primary/50 bg-primary/10"
                  : "border-transparent bg-muted/30",
              )}
            >
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className={cn("text-xs font-medium", active ? "text-foreground" : "text-muted-foreground")}>
                  {preset.label}
                </span>
                <span className="text-[10px] text-muted-foreground truncate">
                  {preset.description}
                </span>
              </div>
              <span
                className={cn(
                  "shrink-0 ml-2 text-[10px] font-mono px-1.5 py-0.5 rounded",
                  active ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground",
                )}
              >
                {preset.badge}
              </span>
            </button>
          );
        })}
      </div>

      {quality === "original" && (
        <div className="text-[10px] text-amber-500 bg-amber-500/10 rounded-md px-2.5 py-1.5 leading-relaxed">
          Full resolution textures may require significantly more VRAM.
        </div>
      )}

      <div className="border-t pt-2 space-y-1.5">
        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest select-none">
          Decoded Textures
        </div>

        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span>Unique textures</span>
          <span className="font-mono">{stats.uniqueCount}</span>
        </div>
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span>RGBA total (CPU)</span>
          <span className="font-mono">{formatBytes(stats.totalRgbaBytes)}</span>
        </div>
        {stats.maxWidth > 0 && (
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>Largest decoded</span>
            <span className="font-mono">{stats.maxWidth}×{stats.maxHeight}</span>
          </div>
        )}

        {sortedBuckets.length > 0 && (
          <div className="mt-1 space-y-0.5">
            <div className="text-[10px] text-muted-foreground/70 mb-0.5">
              Resolution distribution
            </div>
            {sortedBuckets.map(([res, count]) => (
              <div key={res} className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span className="font-mono">{res}</span>
                <span className="font-mono">{count}</span>
              </div>
            ))}
          </div>
        )}

        {isDecoding && (
          <div className="text-[10px] text-blue-400 animate-pulse">
            Decoding textures…
          </div>
        )}
      </div>
    </div>
  );
}
