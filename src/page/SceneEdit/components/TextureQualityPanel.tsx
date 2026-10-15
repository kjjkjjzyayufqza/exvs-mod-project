import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { NutexbTextureDataMap } from "../hooks/useSceneTextureLoader";
import {
  PROP_LABEL,
  PROP_PANEL,
  PROP_ROW,
} from "./propertyPanelStyles";
import {
  TEXTURE_PREVIEW_SLOT_META,
  type TexturePreviewSlotKey,
} from "@/components/ssbh-model-preview/meshFromSsbh";

interface TextureStats {
  uniqueCount: number;
  cacheHits: number;
  maxWidth: number;
  maxHeight: number;
  resolutionBuckets: Map<string, number>;
}

function computeTextureStats(textureDataMap: NutexbTextureDataMap): TextureStats {
  const seen = new Set<string>();
  let cacheHits = 0;
  let maxWidth = 0;
  let maxHeight = 0;
  const resolutionBuckets = new Map<string, number>();

  for (const [path, data] of textureDataMap) {
    const key = path.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    if (data.kind === "png" && data.cacheHit) cacheHits += 1;
    maxWidth = Math.max(maxWidth, data.width);
    maxHeight = Math.max(maxHeight, data.height);

    const bucket = `${data.width}×${data.height}`;
    resolutionBuckets.set(bucket, (resolutionBuckets.get(bucket) ?? 0) + 1);
  }

  return { uniqueCount: seen.size, cacheHits, maxWidth, maxHeight, resolutionBuckets };
}

/** Quick preset: all slots on, all off, or custom mix (toggle group shows no segment pressed). */
function inferTextureSlotPreset(
  textureSlotLoadEnabled: Record<TexturePreviewSlotKey, boolean>,
): "all" | "none" | "" {
  const allOn = TEXTURE_PREVIEW_SLOT_META.every(({ key }) => textureSlotLoadEnabled[key]);
  const allOff = TEXTURE_PREVIEW_SLOT_META.every(({ key }) => !textureSlotLoadEnabled[key]);
  if (allOn) return "all";
  if (allOff) return "none";
  return "";
}

const SLOT_WARNINGS: Partial<Record<TexturePreviewSlotKey, string>> = {
  emissiveMap: "Game emissive paths can blow out Three.js preview.",
  metalnessMap: "Often tied to custom EXVS shaders; can look wrong in generic PBR.",
  cubeMap: "Environment cube is game IBL; may cause harsh highlights when mis-mapped.",
};

interface TextureQualityPanelProps {
  textureSlotLoadEnabled: Record<TexturePreviewSlotKey, boolean>;
  onTextureSlotMode: (mode: "all" | "none") => void;
  onTextureSlotToggle: (key: TexturePreviewSlotKey, enabled: boolean) => void;
  textureDataMap: NutexbTextureDataMap;
  isDecoding: boolean;
}

export function TextureQualityPanel({
  textureSlotLoadEnabled,
  onTextureSlotMode,
  onTextureSlotToggle,
  textureDataMap,
  isDecoding,
}: TextureQualityPanelProps) {
  const { t } = useTranslation("scene-texture-dialogs");
  const stats = useMemo(() => computeTextureStats(textureDataMap), [textureDataMap]);
  const slotPreset = inferTextureSlotPreset(textureSlotLoadEnabled);

  const sortedBuckets = useMemo(() => {
    return [...stats.resolutionBuckets.entries()].sort((a, b) => {
      const aMax = Math.max(...a[0].split("×").map(Number));
      const bMax = Math.max(...b[0].split("×").map(Number));
      return bMax - aMax;
    });
  }, [stats.resolutionBuckets]);

  return (
    <div className={`space-y-2 ${PROP_PANEL}`}>
      <div className="space-y-1.5">
        <div className={PROP_LABEL}>{t("quality.textureSlots")}</div>
        <ToggleGroup
          type="single"
          value={slotPreset}
          onValueChange={(v) => {
            if (v === "all" || v === "none") onTextureSlotMode(v);
          }}
          variant="default"
          size="sm"
          className="inline-flex h-7 w-full min-w-0 items-stretch rounded-md border border-input bg-muted p-0.5 shadow-sm"
        >
          <ToggleGroupItem
            value="all"
            aria-label={t("quality.loadAllAria")}
            className={cn(
              "min-h-0 flex-1 rounded-sm px-2 text-[11px] font-medium",
              "min-w-0! border-0! shadow-none! bg-transparent text-muted-foreground",
              "hover:bg-muted-foreground/15 hover:text-foreground",
              "data-[state=on]:bg-background! data-[state=on]:text-foreground! data-[state=on]:shadow-sm",
              "focus-visible:z-10 focus-visible:ring-2! focus-visible:ring-ring!",
            )}
          >
            {t("quality.loadAll")}
          </ToggleGroupItem>
          <ToggleGroupItem
            value="none"
            aria-label={t("quality.loadNoneAria")}
            className={cn(
              "min-h-0 flex-1 rounded-sm border-y-0 border-r-0 border-l border-border/60 bg-transparent px-2 text-[11px] font-medium",
              "min-w-0! shadow-none! text-muted-foreground",
              "hover:bg-muted-foreground/15 hover:text-foreground",
              "data-[state=on]:bg-background! data-[state=on]:text-foreground! data-[state=on]:shadow-sm",
              "focus-visible:z-10 focus-visible:ring-2! focus-visible:ring-ring!",
            )}
          >
            {t("quality.loadNone")}
          </ToggleGroupItem>
        </ToggleGroup>

        <div className="mt-1.5 space-y-1">
          <div className="text-[10px] text-muted-foreground/80 leading-snug">
            {t("quality.overridesDescription")}
          </div>
          {TEXTURE_PREVIEW_SLOT_META.map(({ key, label, short }) => {
            const warning = SLOT_WARNINGS[key];
            const checked = textureSlotLoadEnabled[key];
            return (
              <div key={key} className="min-w-0 space-y-0.5">
                <label
                  className="flex min-w-0 cursor-pointer items-start gap-2 rounded-sm px-1 py-0.5 hover:bg-accent/40"
                >
                  <Checkbox
                    className="mt-0.5 h-4 w-4 shrink-0"
                    checked={checked}
                    onCheckedChange={(v) => onTextureSlotToggle(key, v === true)}
                    aria-label={t(`quality.slots.${key}.label`, { defaultValue: label })}
                  />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-[11px] leading-tight text-foreground">
                      <span className="font-medium">{short}</span>
                      <span className="font-normal text-muted-foreground"> — {t(`quality.slots.${key}.label`, { defaultValue: label })}</span>
                    </span>
                    {warning ? (
                      <span className="text-[10px] leading-snug text-amber-600/90 mt-0.5">
                        {t(`quality.slots.${key}.warning`, { defaultValue: warning })}
                      </span>
                    ) : null}
                  </span>
                </label>
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-1 border-t border-border/30 pt-1.5">
        <div className={PROP_ROW}>
            <span className="text-[11px] text-muted-foreground">{t("quality.uniqueTextures")}</span>
          <span className="font-mono text-[11px]">{stats.uniqueCount}</span>
        </div>
        <div className={PROP_ROW}>
          <span className="text-[11px] text-muted-foreground">{t("quality.cacheHits")}</span>
          <span className="font-mono text-[11px]">{stats.cacheHits}</span>
        </div>
        {stats.maxWidth > 0 && (
          <div className={PROP_ROW}>
            <span className="text-[11px] text-muted-foreground">{t("quality.largest")}</span>
            <span className="font-mono text-[11px]" data-i18n-ignore="">
              {stats.maxWidth}×{stats.maxHeight}
            </span>
          </div>
        )}

        {sortedBuckets.length > 0 && (
          <div className="mt-1 space-y-0.5">
            <div className="text-[10px] text-muted-foreground/60 mb-0.5">{t("quality.distribution")}</div>
            {sortedBuckets.map(([res, count]) => (
              <div key={res} className={PROP_ROW}>
                <span className="font-mono text-[10px] text-muted-foreground">{res}</span>
                <span className="font-mono text-[10px] text-muted-foreground">{count}</span>
              </div>
            ))}
          </div>
        )}

        {isDecoding && (
          <div className="text-[10px] text-blue-400 animate-pulse">
            {t("quality.preparingCache")}
          </div>
        )}
      </div>
    </div>
  );
}
