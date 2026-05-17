import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { type TexturePreviewSlotKey } from "@/page/TestEditor/components/ssbh-model-preview/meshFromSsbh";
import type { NutexbTextureDataMap } from "../hooks/useSceneTextureLoader";
import type { SsbhModelPreviewBundle } from "@/page/TestEditor/components/ssbh-model-preview/types";
import {
  collectBundleTextureInventory,
  collectGlobalLoadedNutexbInventory,
  textureSlotShortLabel,
  type ObjectTextureInventory,
  type ObjectTextureLoadState,
} from "../utils/sceneTextureInventory";

interface ModelTextureSlotPanelProps {
  objectId: string;
  bundle: SsbhModelPreviewBundle;
  textureDataMap: NutexbTextureDataMap;
  textureSlotLoadEnabled: Record<TexturePreviewSlotKey, boolean>;
  objectTextureLoadState: ObjectTextureLoadState;
  onTexturePathToggle: (objectId: string, path: string, enabled: boolean) => void;
  modelLabel?: string;
}

export function ModelTextureSlotPanel({
  objectId,
  bundle,
  textureDataMap,
  textureSlotLoadEnabled,
  objectTextureLoadState,
  onTexturePathToggle,
  modelLabel,
}: ModelTextureSlotPanelProps) {
  const textures = useMemo(
    () => collectBundleTextureInventory(
      bundle,
      textureDataMap,
      textureSlotLoadEnabled,
      objectTextureLoadState,
      objectId,
    ),
    [bundle, textureDataMap, textureSlotLoadEnabled, objectTextureLoadState, objectId],
  );

  if (textures.length === 0) {
    return (
      <div className="text-[10px] text-muted-foreground italic py-1">
        No textures resolved for this model
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {modelLabel && (
        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          {modelLabel}
        </div>
      )}
      {textures.map((tex) => {
        const slotLabel = tex.slots.map(textureSlotShortLabel).join(", ");
        return (
          <div key={tex.pathKey} className="space-y-0.5 rounded-sm px-1 py-1 hover:bg-muted/30">
            <div className="flex items-center gap-2">
              <Checkbox
                id={`model-texture-${objectId}-${tex.pathKey}`}
                checked={tex.enabled}
                onCheckedChange={(checked) => onTexturePathToggle(objectId, tex.path, !!checked)}
                className="h-3.5 w-3.5"
              />
              <label
                htmlFor={`model-texture-${objectId}-${tex.pathKey}`}
                className={cn(
                  "text-[11px] font-medium cursor-pointer flex-1 truncate font-mono",
                  !tex.enabled && "text-muted-foreground line-through",
                )}
                title={tex.internalName}
              >
                {tex.internalName}
              </label>
              <Badge variant="outline" className="text-[9px] h-4 px-1">
                {tex.loaded ? "loaded" : "idle"}
              </Badge>
            </div>
            <div className="ml-5 flex items-center gap-1.5 text-[9px] text-muted-foreground">
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full shrink-0",
                  tex.loaded ? "bg-green-500" : "bg-muted-foreground/40",
                )}
              />
              <span className="truncate flex-1">{slotLabel}</span>
              {tex.resolution && <span className="tabular-nums shrink-0">{tex.resolution}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function GlobalLoadedTexturePanel({
  objects,
}: {
  objects: ObjectTextureInventory[];
}) {
  const loaded = useMemo(() => collectGlobalLoadedNutexbInventory(objects), [objects]);

  if (loaded.length === 0) {
    return (
      <div className="text-[10px] text-muted-foreground italic py-1">
        No nutexb textures are currently loaded
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {loaded.map((entry) => (
        <div key={entry.path.toLowerCase()} className="rounded-sm px-1 py-1 hover:bg-muted/30">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500 shrink-0" />
            <span className="min-w-0 flex-1 truncate text-[10px] font-mono" title={entry.internalName}>
              {entry.internalName}
            </span>
            <span className="text-[9px] tabular-nums text-muted-foreground">{entry.resolution}</span>
          </div>
          <div className="ml-3 truncate text-[9px] text-muted-foreground" title={entry.objectLabels.join(", ")}>
            {entry.objectLabels.join(", ")}
          </div>
        </div>
      ))}
    </div>
  );
}
