import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pencil, Loader2 } from "lucide-react";
import { TexturePathPicker } from "./TexturePathPicker";
import { Skeleton } from "@/components/ui/skeleton";
import { type TexturePreviewSlotKey } from "@/components/ssbh-model-preview/meshFromSsbh";
import type { NutexbTextureDataMap } from "../hooks/useSceneTextureLoader";
import type { SsbhModelPreviewBundle } from "@/components/ssbh-model-preview/types";
import {
  collectBundleTextureInventory,
  collectGlobalLoadedNutexbInventory,
  textureSlotShortLabel,
  type ObjectTextureInventory,
  type ObjectTextureLoadState,
} from "../utils/sceneTextureInventory";
import { PROP_PANEL } from "./propertyPanelStyles";

interface ModelTextureSlotPanelProps {
  objectId: string;
  bundle: SsbhModelPreviewBundle;
  textureDataMap: NutexbTextureDataMap;
  textureSlotLoadEnabled: Record<TexturePreviewSlotKey, boolean>;
  objectTextureLoadState: ObjectTextureLoadState;
  onTexturePathToggle: (objectId: string, path: string, enabled: boolean) => void;
  onTexturePathChange?: (objectId: string, oldPath: string, newBasename: string) => void;
  modelLabel?: string;
}

export function ModelTextureSlotPanel({
  objectId,
  bundle,
  textureDataMap,
  textureSlotLoadEnabled,
  objectTextureLoadState,
  onTexturePathToggle,
  onTexturePathChange,
  modelLabel,
}: ModelTextureSlotPanelProps) {
  const [editingPath, setEditingPath] = useState<string | null>(null);
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
      <div className="py-2 text-center text-[10px] italic text-muted-foreground">
        No texture slots found for this model.
      </div>
    );
  }

  return (
    <div className={`space-y-1.5 ${PROP_PANEL}`}>
      {modelLabel && (
        <div className="truncate text-[10px] font-semibold uppercase tracking-wider text-muted-foreground" title={modelLabel}>
          {modelLabel}
        </div>
      )}
      {textures.map((tex) => {
        const slotLabel = tex.slots.map(textureSlotShortLabel).join(", ");
        const isLoading = tex.enabled && !tex.loaded;

        if (isLoading) {
          return (
            <div key={tex.pathKey} className="min-w-0 space-y-1 rounded-sm px-1 py-1">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-4 shrink-0 rounded-sm" />
                <Skeleton className="h-3.5 flex-1" />
                <Badge variant="outline" className="h-4 gap-0.5 px-1 text-[9px]">
                  <Loader2 className="h-2.5 w-2.5 animate-spin" />
                  loading
                </Badge>
              </div>
              <div className="ml-5 space-y-1">
                <Skeleton className="h-2.5 w-2/3" />
                <p className="truncate text-[9px] text-muted-foreground" title={tex.internalName}>
                  {tex.internalName}
                </p>
              </div>
            </div>
          );
        }

        return (
          <div key={tex.pathKey} className="min-w-0 space-y-0.5 rounded-sm px-1 py-1 hover:bg-muted/30">
            <div className="flex min-w-0 items-center gap-2">
              <Checkbox
                id={`model-texture-${objectId}-${tex.pathKey}`}
                checked={tex.enabled}
                onCheckedChange={(checked) => onTexturePathToggle(objectId, tex.path, !!checked)}
                className="h-4 w-4 shrink-0"
              />
              <label
                htmlFor={`model-texture-${objectId}-${tex.pathKey}`}
                className={cn(
                  "min-w-0 flex-1 cursor-pointer truncate font-mono text-[11px] font-medium",
                  !tex.enabled && "text-muted-foreground line-through",
                )}
                title={tex.internalName}
              >
                {tex.internalName}
              </label>
              <Badge variant="outline" className="text-[9px] h-4 px-1">
                {tex.loaded ? "loaded" : "idle"}
              </Badge>
              {onTexturePathChange && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-4 w-4 shrink-0"
                  onClick={() => setEditingPath(editingPath === tex.pathKey ? null : tex.pathKey)}
                >
                  <Pencil className="h-3 w-3" />
                </Button>
              )}
            </div>
            {editingPath === tex.pathKey && (
              <div className="ml-5 mt-1">
                <TexturePathPicker
                  value={tex.internalName}
                  paramId={tex.slots[0] ?? ""}
                  onChange={(newBasename) => {
                    onTexturePathChange?.(objectId, tex.path, newBasename);
                    setEditingPath(null);
                  }}
                  className="max-w-[220px]"
                />
              </div>
            )}
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
